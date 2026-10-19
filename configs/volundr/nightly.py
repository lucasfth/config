#!/usr/bin/env python3
"""Bounded nightly pin adoption. No remote credential handling or source reset."""
import argparse
import contextlib
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
import secret_gate


def run(*args, cwd=None, env=None, check=True):
    return subprocess.run([str(a) for a in args], cwd=cwd, env=env, check=check,
                          capture_output=True, text=True, timeout=90)


def git(repo, *args, check=True):
    return run('git', '-C', repo, *args, check=check).stdout.strip()


def save(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temporary = path.with_name(path.name + '.tmp')
    temporary.write_text(json.dumps(value, indent=2) + '\n')
    temporary.chmod(0o600)
    temporary.replace(path)


PROBE = r'''
import json,sys,os,tempfile
from pathlib import Path
from hermes_yaml import safe_load,roundtrip_yaml
from io import StringIO
root,profile,mode=map(str,sys.argv[1:4]); root=Path(root).resolve();profile=Path(profile)
active=[];archived=[]
for p in sorted((root/'skills').glob('*/SKILL.md')):
 fm=safe_load(p.read_text().split('---',2)[1])
 if fm['name']!=p.parent.name:raise ValueError('canonical name mismatch')
 status=fm.get('metadata',{}).get('status')
 if status not in ['active','archived']:raise ValueError('invalid status')
 (active if status=='active' else archived).append(str(p.parent) if status=='active' else fm['name'])
if not active:raise ValueError('empty catalogue')
if mode!='apply':(profile/'cache').mkdir(parents=True,exist_ok=True)
if mode=='apply':
 p=profile/'config.yaml';editor=roundtrip_yaml();data=editor.load(p.read_text());s=data.setdefault('skills',{})
 s['external_dirs']=active;s['disabled']=sorted(set(s.get('disabled') or [])|set(archived))
 out=StringIO();editor.dump(data,out);tmp=p.with_name('config.volundr-new');tmp.write_text(out.getvalue());tmp.chmod(p.stat().st_mode&0o777);tmp.replace(p)
else:
 with tempfile.TemporaryDirectory(prefix='volundr-probe-',dir=profile/'cache') as folder:
  h=Path(folder);(h/'skills').mkdir();(h/'config.yaml').write_text(json.dumps({'skills':{'external_dirs':active,'disabled':archived}}));os.environ['HERMES_HOME']=folder
  from tools.skills_tool import _skill_catalog,skill_view
  rows=_skill_catalog(include_hidden=True)
  if {x['name'] for x in rows}!={Path(x).name for x in active}:raise ValueError('catalogue mismatch')
  if any(not x.get('load_name') for x in rows) or len(rows)!=len(active):raise ValueError('ambiguous catalogue')
  for name in archived:
   if json.loads(skill_view(name,preprocess=False)).get('success'):raise ValueError('archived guide loadable')
print(json.dumps({'active':len(active),'archived':len(archived)}))
'''


def probe(settings, root, mode='probe'):
    env = dict(os.environ, **settings.get('runtime_env', {}))
    result = run(settings['runtime_python'], '-c', PROBE, root, settings['home'], mode,
                 cwd=settings['runtime_source'], env=env)
    return json.loads(result.stdout)


def stage_local(repo, target, state):
    """Private snapshot and rebase in disposable clone; never stash the live tree."""
    folder = Path(tempfile.mkdtemp(prefix='candidate-', dir=state))
    candidate = folder / 'repo'
    run('git', 'clone', '--no-hardlinks', repo, candidate)
    git(candidate, 'config', 'user.name', 'Loki skill candidate')
    git(candidate, 'config', 'user.email', 'candidate@example.invalid')
    git(candidate, 'checkout', '-B', 'nightly-candidate', git(repo, 'rev-parse', 'HEAD'))
    # Preserve changed/untracked bytes privately, including deletions. Do not publish.
    changed = git(repo, 'diff', '--name-only', 'HEAD').splitlines()
    untracked = git(repo, 'ls-files', '--others', '--exclude-standard').splitlines()
    for name in set(changed + untracked):
        source, dest = repo / name, candidate / name
        if source.is_symlink():
            raise ValueError('Local symlink edit requires manual review')
        if source.is_file():
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, dest)
        elif dest.is_file():
            dest.unlink()
        else:
            raise ValueError('Non-file local change requires manual review')
    git(candidate, 'add', '-A')
    if git(candidate, 'status', '--porcelain'):
        git(candidate, 'commit', '-m', 'chore(candidate): preserve private local skill edits')
    common = git(candidate, 'merge-base', 'HEAD', target)
    result = run('git', '-C', candidate, 'rebase', '--onto', target, common, check=False)
    conflicts = git(candidate, 'diff', '--name-only', '--diff-filter=U').splitlines()
    record = {'status': 'conflict' if conflicts else 'local-review-required',
              'candidate': str(candidate), 'target': target, 'conflicts': conflicts,
              'rebase_exit': result.returncode,
              'policy': 'Reason only inside candidate; no live writes, credential reads, commit/push or activation.'}
    save(state / 'pending.json', record)
    return record


def recover_rollback(repo, before, target, branch):
    """Repair only recognizable rollback bytes; unknown edits remain untouched."""
    if git(repo, 'symbolic-ref', '--short', 'HEAD') != branch:
        raise RuntimeError('Branch changed during rollback; use saved receipt')
    head = git(repo, 'rev-parse', 'HEAD')
    if head not in {before, target}:
        raise RuntimeError('HEAD changed during rollback; use saved receipt')
    if git(repo, 'ls-files', '--others', '--exclude-standard'):
        raise RuntimeError('New local files prevent automatic rollback repair')
    names = set(git(repo, 'diff', '--name-only', 'HEAD').splitlines())
    names.update(git(repo, 'diff', '--cached', '--name-only', 'HEAD').splitlines())
    for name in names:
        path = repo / name
        if path.is_symlink() or (path.exists() and not path.is_file()):
            raise RuntimeError('Unknown file type during rollback; use saved receipt')
        current = (path.read_bytes(), bool(path.stat().st_mode & 0o111)) if path.exists() else None
        allowed = []
        for revision in [before, target]:
            entry = git(repo, 'ls-tree', revision, '--', name).split()
            if not entry:
                allowed.append(None)
            elif entry[0] in {'100644', '100755'}:
                blob = subprocess.check_output(['git', '-C', str(repo), 'cat-file', 'blob', entry[2]], timeout=90)
                allowed.append((blob, entry[0] == '100755'))
        if current not in allowed:
            raise RuntimeError('Concurrent edits prevent rollback repair; use saved receipt')
    git(repo, 'restore', '--source', head, '--staged', '--worktree', '--', '.')


def sync(settings):
    repo, home = Path(settings['repo']), Path(settings['home'])
    state, inbox = Path(settings['state']), Path(settings['inbox'])
    state.mkdir(parents=True, exist_ok=True, mode=0o700)
    with (state / 'sync.lock').open('w') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return {'status': 'busy'}
        delivery = inbox / 'delivery.json'
        if not delivery.is_file():
            result = {'status': 'no-new-bundle'}
            save(state / 'last-sync.json', result)
            return result
        item = json.loads(delivery.read_text())
        target = item['target']
        if len(target) != 40 or any(c not in '0123456789abcdef' for c in target):
            raise ValueError('Invalid target revision')
        bundle = inbox / (target + '.bundle')
        if hashlib.sha256(bundle.read_bytes()).hexdigest() != item['bundle_sha256']:
            raise ValueError('Delivery checksum mismatch')
        age = time.time() - item['created_at']
        if age < -300 or age > 7 * 86400:
            raise ValueError('Expired delivery')
        run('git', '-C', repo, 'bundle', 'verify', bundle)
        ref = item.get('bundle_ref', 'refs/heads/main')
        if not ref.startswith(('refs/heads/', 'refs/nightly-delivery/')) or any(c.isspace() for c in ref):
            raise ValueError('Invalid bundle ref')
        git(repo, 'fetch', bundle, ref)
        if git(repo, 'rev-parse', 'FETCH_HEAD') != target:
            raise ValueError('Bundle head differs from published pin')
        secret_gate.scan(repo, 'history', target, binary=settings.get('gitleaks', 'gitleaks'))
        secret_gate.scan(repo, 'tree', target, binary=settings.get('gitleaks', 'gitleaks'))
        before = git(repo, 'rev-parse', 'HEAD')
        branch = git(repo, 'symbolic-ref', '--quiet', '--short', 'HEAD', check=False)
        if not branch:
            raise ValueError('Automatic sync requires a named consumer branch')
        dirty = bool(git(repo, 'status', '--porcelain'))
        fast_forward = run('git', '-C', repo, 'merge-base', '--is-ancestor', before, target, check=False).returncode == 0
        if not fast_forward:
            rewind = run('git', '-C', repo, 'merge-base', '--is-ancestor', target, before, check=False).returncode == 0
            # A previous accepted pin is stale, not permission to rebase backwards.
            last = json.loads((state / 'last-sync.json').read_text()) if (state / 'last-sync.json').exists() else {}
            if rewind and last.get('target') == before:
                raise ValueError('Refusing published pin rewind')
        if dirty or not fast_forward:
            return stage_local(repo, target, state)
        if before == target:
            result = {'status': 'up-to-date', 'target': target, 'config_revision': item['config_revision']}
            save(state / 'last-sync.json', result)
            return result
        candidate = Path(tempfile.mkdtemp(prefix='validate-', dir=state)) / 'repo'
        run('git', 'clone', '--no-hardlinks', repo, candidate)
        git(candidate, 'checkout', '--detach', target)
        run(sys.executable, candidate / 'validate.py')
        probe(settings, candidate)
        backup = state / ('rollback-' + str(time.time_ns()))
        backup.mkdir(mode=0o700)
        shutil.copy2(home / 'config.yaml', backup / 'config.yaml')
        save(backup / 'revision.json', {'before': before, 'after': target, 'branch': branch})
        if git(repo, 'status', '--porcelain') or git(repo, 'rev-parse', 'HEAD') != before:
            raise ValueError('Checkout changed during validation')
        config_hash = hashlib.sha256((backup / 'config.yaml').read_bytes()).hexdigest()
        applied_hash = config_hash
        git(repo, 'merge', '--ff-only', target)
        try:
            if hashlib.sha256((home / 'config.yaml').read_bytes()).hexdigest() != config_hash:
                raise ValueError('Configuration changed during validation')
            counts = probe(settings, repo, 'apply')
            applied_hash = hashlib.sha256((home / 'config.yaml').read_bytes()).hexdigest()
            probe(settings, repo)
        except BaseException:
            git(repo, 'branch', 'failed-nightly-' + str(time.time_ns()), target)
            if (git(repo, 'status', '--porcelain') or
                    hashlib.sha256((home / 'config.yaml').read_bytes()).hexdigest() != applied_hash or
                    git(repo, 'rev-parse', 'HEAD') != target or
                    git(repo, 'symbolic-ref', '--short', 'HEAD') != branch):
                raise RuntimeError('Concurrent edits prevent rollback; preserve work and use receipt')
            try:
                git(repo, 'read-tree', '-m', '-u', target, before)
                git(repo, 'update-ref', 'refs/heads/' + branch, before, target)
            except BaseException:
                # A failed tree operation or CAS may leave old bytes under the new ref.
                # Reconcile to actual HEAD only when every changed byte is recognizable.
                recover_rollback(repo, before, target, branch)
                raise
            if hashlib.sha256((home / 'config.yaml').read_bytes()).hexdigest() != applied_hash:
                raise RuntimeError('Concurrent config edit preserved; use saved receipt')
            shutil.copy2(backup / 'config.yaml', home / 'config.yaml')
            raise
        result = {'status': 'applied', 'before': before, 'target': target,
                  'config_revision': item['config_revision'], 'rollback': str(backup), **counts}
        save(state / 'last-sync.json', result)
        (state / 'pending.json').unlink(missing_ok=True)
        return result


def consolidation(settings):
    """Deterministic evidence only: no model calls, vault writes or skill edits."""
    import re
    repo, state = Path(settings['repo']), Path(settings['state'])
    guides = []
    for p in sorted((repo / 'skills').glob('*/SKILL.md')):
        text = p.read_text()
        if not re.search(r'(?m)^  status: active\s*$', text):
            continue
        description = next((x for x in text.splitlines() if x.startswith('description:')), '')
        words = set(re.findall(r'[a-z]{4,}', description.lower())) - {'description', 'when', 'with', 'from', 'that', 'this', 'skills'}
        guides.append((p.parent.name, words))
    pairs = []
    for i, (a, left) in enumerate(guides):
        for b, right in guides[i + 1:]:
            shared = left & right
            score = len(shared) / max(1, len(left | right))
            if len(shared) >= 3 and score >= .25:
                pairs.append({'skills': [a, b], 'similarity': round(score, 3), 'shared_terms': sorted(shared)})
    result = {'revision': git(repo, 'rev-parse', 'HEAD'), 'status': 'proposals-only',
              'candidates': sorted(pairs, key=lambda x: -x['similarity'])[:10],
              'policy': 'Overlap is not proof of redundancy. Preserve triggers, runtime constraints, support files and notices. No live edits or publication.'}
    save(state / 'consolidation.json', result)
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--settings', type=Path, required=True)
    parser.add_argument('action', choices=['sync', 'consolidation'])
    args = parser.parse_args()
    settings = json.loads(args.settings.read_text())
    try:
        result = sync(settings) if args.action == 'sync' else consolidation(settings)
        print(json.dumps(result))
    except Exception as exc:
        save(Path(settings['state']) / 'last-error.json', {'error': str(exc), 'action': args.action})
        print('Volundr nightly blocked: ' + str(exc), file=sys.stderr)
        sys.exit(1)
