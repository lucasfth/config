#!/usr/bin/env python3
"""Trusted fail-closed Gitleaks gate. Never print findings or candidate content."""
import argparse
import hashlib
import os
from pathlib import Path
import subprocess
import tempfile
import tarfile

POLICY = Path(__file__).with_name('gitleaks.toml')
POLICY_SHA256 = '20f9f5b3ccfce8e1f5bc8d61ef041f10486095b2a09642c92d1b808a5ec95922'


def scan(repo, mode='tree', revision=None, binary='gitleaks', policy=None):
    repo = Path(repo).resolve()
    # Runtime code/policy are installed from config, never imported from the candidate repo.
    policy = Path(policy).resolve() if policy else POLICY
    if not policy.is_file() or hashlib.sha256(policy.read_bytes()).hexdigest() != POLICY_SHA256:
        raise RuntimeError('Missing or modified trusted scanner policy')
    with tempfile.TemporaryDirectory(prefix='volundr-secret-gate-') as folder:
        folder = Path(folder)
        command = [binary, '--config', str(policy), '--redact=100', '--no-banner',
                   '--ignore-gitleaks-allow', '--gitleaks-ignore-path', str(folder),
                   '--max-archive-depth=2', '--max-target-megabytes=0']
        if mode == 'tree':
            # Export only a selected Git tree; scanner never sees .git or local secrets.
            archive = folder / 'tree.tar'
            with archive.open('wb') as output:
                subprocess.run(['git', '-C', str(repo), 'archive', revision or 'HEAD'], stdout=output, check=True)
            tree = folder / 'tree'; tree.mkdir()
            with tarfile.open(archive) as source:
                for member in source.getmembers():
                    # Inspect link text as data; never follow host or candidate symlinks.
                    if member.issym() or member.islnk():
                        raise RuntimeError('Symbolic link requires review: ' + member.name)
                    else:
                        source.extract(member, tree, filter='data')
            command += ['dir', str(tree)]
        elif mode == 'staged':
            command += ['git', '--pre-commit', '--staged', str(repo)]
        elif mode == 'history':
            command += ['git', '--log-opts=' + (revision or '--all'), str(repo)]
        else:
            raise ValueError('Unknown scan mode')
        result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                timeout=300, env={**os.environ, 'GITLEAKS_CONFIG': str(policy)})
        if result.returncode:
            raise RuntimeError('Secret gate blocked: findings, scanner error or missing coverage; inspect a private redacted report')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=['tree', 'staged', 'history'])
    parser.add_argument('repo', type=Path)
    parser.add_argument('--revision')
    parser.add_argument('--policy', type=Path, help='Explicit trusted policy path; required in CI')
    args = parser.parse_args()
    if os.environ.get('CI') and not args.policy:parser.error('--policy is required in CI')
    scan(args.repo, args.mode, args.revision, policy=args.policy)
    print('Secret gate passed: ' + args.mode)
