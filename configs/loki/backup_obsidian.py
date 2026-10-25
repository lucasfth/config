#!/usr/bin/env python3
"""Gimle's verified ciphertext-only Muninn publisher. Never pushes the vault."""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import shutil
import socket
import sqlite3
import stat
import subprocess
import tempfile
import time
from datetime import datetime, timezone

HOME = Path.home()
ROOT = HOME / 'loki-data'
SOURCE = ROOT / 'loki-memory'
REPO = ROOT / 'loki-muninn-backup'
TEMPORAL_LEDGER = ROOT / 'live/hermes/mcp-vault-server/temporal.db'
VOLUNDR = ROOT / 'live/volundr'
SCRATCH = ROOT / 'backup/scratch'
LOG = ROOT / 'backup/muninn-salt.log'
RECEIPT = ROOT / 'backup/muninn-salt-receipt.json'
BACKUP_PATH = f'{HOME}/.nix-profile/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin'
SSH_KEY = ROOT / 'backup/github-deploy-key'
KNOWN_HOSTS = ROOT / 'backup/github-known-hosts'


def digest_file(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def digest(root):
    return {str(p.relative_to(root)): digest_file(p) for p in sorted(root.rglob('*')) if p.is_file()}


def run(*args, attempts=1):
    for attempt in range(attempts):
        result = subprocess.run([str(a) for a in args], capture_output=True, text=True, timeout=1800)
        with LOG.open('a') as stream:
            stream.write(result.stdout + result.stderr)
        if not result.returncode:
            return result.stdout.strip()
        if attempt + 1 < attempts:
            time.sleep(5 * (attempt + 1))
    raise RuntimeError(f'{args[0]} {args[1]} failed after {attempts} attempt(s); see private backup log')


def inventory(root):
    files = {}
    for directory, dirs, names in os.walk(root):
        dirs[:] = sorted(d for d in dirs if d != '.git')
        for name in dirs + names:
            if (Path(directory) / name).is_symlink():
                raise RuntimeError('Snapshot contains a symlink; refusing incomplete backup')
        for name in sorted(names):
            p = Path(directory) / name
            s = p.stat()
            if not stat.S_ISREG(s.st_mode):
                raise RuntimeError('Snapshot contains a nonregular file')
            files[str(p.relative_to(root))] = (s.st_ino, s.st_size, s.st_mtime_ns, s.st_ctime_ns)
    return files


def snapshot_database(source, dest):
    dest.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(source.as_uri() + '?mode=ro', uri=True, timeout=30) as db:
        with sqlite3.connect(dest) as target:
            db.backup(target)
            if target.execute('pragma quick_check').fetchone() != ('ok',):
                raise RuntimeError('SQLite snapshot integrity check failed')


def snapshot_tree(source, dest):
    before = inventory(source)
    databases = set()
    for name in before:
        p = source / name
        with p.open('rb') as stream:
            if stream.read(16) == b'SQLite format 3\x00':
                databases.add(name)
    for name in before:
        if any(name == db + suffix for db in databases for suffix in ('-wal', '-shm', '-journal')):
            continue
        p, target = source / name, dest / name
        target.parent.mkdir(parents=True, exist_ok=True)
        if name in databases:
            snapshot_database(p, target)
        else:
            shutil.copy2(p, target)
            if digest_file(p) != digest_file(target):
                raise RuntimeError('Source changed during snapshot; retry')
    after = inventory(source)
    # Live SQLite databases may legitimately change; each backup is independently
    # transactional. Every ordinary file and the set of payload paths must agree.
    def ordinary(data):
        return {k: v for k, v in data.items() if k not in databases and not any(k == db + s for db in databases for s in ('-wal', '-shm', '-journal'))}
    if ordinary(before) != ordinary(after) or set(before) - set(after):
        raise RuntimeError('Source changed during snapshot; retry')


def snapshot_volundr(repo, dest):
    def git(*args):
        return subprocess.check_output(['git', '-C', str(repo), *args], stderr=subprocess.PIPE)
    def files():
        names = git('ls-files', '-z', '--cached', '--others', '--exclude-standard').decode().split('\0')
        result = {}
        for name in sorted(set(filter(None, names))):
            p = repo / name
            if p.is_symlink():
                raise RuntimeError('Volundr symlink requires explicit backup review')
            if p.is_file():
                result[name] = digest_file(p)
        return result
    head, refs, before = git('rev-parse', 'HEAD').decode().strip(), git('show-ref'), files()
    dest.mkdir(parents=True)
    git('bundle', 'create', str(dest / 'repository.bundle'), '--all')
    git('bundle', 'verify', str(dest / 'repository.bundle'))
    for name in before:
        target = dest / 'worktree' / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(repo / name, target)
    if before != digest(dest / 'worktree') or before != files() or refs != git('show-ref') or head != git('rev-parse', 'HEAD').decode().strip():
        raise RuntimeError('Volundr changed during snapshot; retry')
    (dest / 'snapshot.json').write_text(json.dumps({'head': head, 'worktree_files': len(before), 'file_sha256': before, 'status': git('status', '--porcelain').decode(), 'restore': 'Clone repository.bundle; overlay worktree excluding .git and preserve deletions from status.'}, indent=2) + '\n')
    return {'head': head, 'worktree_files': len(before)}


def validate_ciphertext_paths(paths):
    allowed = {'.gitignore', '.gitattributes', '.salt/format.json', '.salt/key.age', '.salt/recipients.txt', 'index.age'}
    if any(p not in allowed and not (p.startswith('objects/') and '..' not in Path(p).parts) for p in paths):
        raise RuntimeError('Unexpected plaintext path in ciphertext checkout')


def preflight():
    if socket.gethostname() != 'gimle' or HOME != Path('/Users/gimle') or os.getuid() != 501:
        raise RuntimeError('This publisher is restricted to Gimle')
    if not os.path.ismount(ROOT) or not (SOURCE / '.git').exists():
        raise RuntimeError('Encrypted vault mount is not ready')
    if (HOME / 'Library/Caches/salt').resolve() != ROOT / 'backup/cache':
        raise RuntimeError('Salt plaintext cache must stay inside encrypted volume')
    if (HOME / 'Library/Application Support/salt').resolve() != ROOT / 'backup/salt':
        raise RuntimeError('Salt identity and signing store must stay inside encrypted volume')
    for key in [SSH_KEY, *list((HOME / 'Library/Application Support/salt/keys').glob('*.json'))]:
        if not key.is_file() or stat.S_IMODE(key.stat().st_mode) != 0o600:
            raise RuntimeError('Backup key missing or not private')
    if not list((HOME / 'Library/Application Support/salt/keys').glob('*.json')):
        raise RuntimeError('Salt identity missing')
    if not KNOWN_HOSTS.is_file() or not REPO.is_dir() or not VOLUNDR.is_dir():
        raise RuntimeError('Backup repository or dependencies missing')
    if run('git', '-C', REPO, 'remote', 'get-url', 'origin') != 'git@github.com:lucasfth/muninn.git':
        raise RuntimeError('Unexpected encrypted backup remote')
    if run('git', '-C', REPO, 'branch', '--show-current') != 'main':
        raise RuntimeError('Encrypted backup branch must be main')
    if run('git', '-C', REPO, 'status', '--porcelain'):
        raise RuntimeError('Encrypted backup checkout is dirty; inspect before retry')
    run('git', '-C', REPO, 'fetch', 'origin', 'main', attempts=3)
    if run('git', '-C', REPO, 'rev-parse', 'HEAD') != run('git', '-C', REPO, 'rev-parse', 'origin/main'):
        raise RuntimeError('Encrypted branch differs from remote; no automatic reconciliation')
    validate_ciphertext_paths(run('git', '-C', REPO, 'ls-tree', '-r', '--name-only', 'HEAD').splitlines())


def main():
    os.umask(0o077)
    os.environ.update(PATH=BACKUP_PATH, SALT_KEYSTORE='file', GIT_TERMINAL_PROMPT='0')
    import shlex
    os.environ['GIT_SSH_COMMAND'] = shlex.join(['/usr/bin/ssh', '-i', str(SSH_KEY), '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', f'UserKnownHostsFile={KNOWN_HOSTS}'])
    # Do not accidentally create an unencrypted fallback before mount readiness.
    if not os.path.ismount(ROOT):
        raise RuntimeError('Encrypted backup volume not mounted')
    SCRATCH.mkdir(parents=True, exist_ok=True, mode=0o700)
    LOG.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    with (SCRATCH / 'muninn-salt.lock').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        preflight()
        with tempfile.TemporaryDirectory(prefix='muninn-snapshot-', dir=SCRATCH) as temp:
            stage, restored = Path(temp) / 'vault', Path(temp) / 'restored'
            stage.mkdir()
            snapshot_tree(SOURCE, stage)
            if not TEMPORAL_LEDGER.is_file():
                raise RuntimeError('Temporal preservation ledger missing')
            snapshot_database(TEMPORAL_LEDGER, stage / '.muninn/temporal.db')
            volundr = snapshot_volundr(VOLUNDR, stage / '.muninn/volundr')
            drafts = HOME / '.hermes/skills'
            if drafts.exists():
                target = stage / '.muninn/local-skills'
                shutil.copytree(drafts, target, symlinks=True, ignore=shutil.ignore_patterns('__pycache__'))
                for link in target.rglob('*'):
                    if link.is_symlink():
                        value = os.readlink(link)
                        link.unlink()
                        link.with_name(link.name + '.symlink-target').write_text(value)
            for source in [HOME / '.hermes/config.yaml', Path(__file__).resolve()]:
                target = stage / '.muninn/loki-runtime' / source.name
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source, target)
            run('salt', 'seal', '--prune', stage, REPO)
            run('salt', 'verify', REPO)
            run('salt', 'restore', REPO, '--to', restored)
            expected = digest(stage)
            if expected != digest(restored):
                raise RuntimeError('Restored snapshot differs from staged source')
            run('git', '-C', REPO, 'add', '-A')
            validate_ciphertext_paths(run('git', '-C', REPO, 'ls-files').splitlines())
            run('salt', 'check', REPO)
            changed = subprocess.run(['git', '-C', str(REPO), 'diff', '--cached', '--quiet']).returncode
            if changed == 1:
                run('git', '-C', REPO, 'commit', '-m', 'chore(backup): verified encrypted Gimle snapshot ' + datetime.now(timezone.utc).isoformat(timespec='seconds'))
            elif changed != 0:
                raise RuntimeError('Cannot inspect staged snapshot')
            run('git', '-C', REPO, 'push', 'origin', 'main', attempts=3)
            local = run('git', '-C', REPO, 'rev-parse', 'HEAD')
            remote = run('git', '-C', REPO, 'ls-remote', 'origin', 'refs/heads/main', attempts=3).split()[0]
            if local != remote:
                raise RuntimeError('Remote commit verification failed')
            run('git', '-C', REPO, 'fetch', 'origin', 'main', attempts=3)
            if local != run('git', '-C', REPO, 'rev-parse', 'origin/main'):
                raise RuntimeError('Fetched remote revision differs')
            receipt = {'host': 'gimle', 'commit': local, 'files': len(expected), 'restore_verified': True, 'remote_verified': True, 'history_pruned': False, 'volundr': volundr, 'source': str(SOURCE), 'script_sha256': digest_file(Path(__file__).resolve()), 'timestamp': datetime.now(timezone.utc).isoformat()}
            pending = RECEIPT.with_suffix('.pending')
            pending.write_text(json.dumps(receipt, indent=2) + '\n')
            os.replace(pending, RECEIPT)
            print(f'Encrypted Muninn backup verified: {len(expected)} files, commit {local[:12]}.')


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(f'Muninn encrypted backup failed: {type(exc).__name__}: {exc}')
        raise SystemExit(1)
