#!/usr/bin/env python3
"""Provision controller files and bare repositories; never load/restart launchd."""
import argparse
import os
from pathlib import Path
import shutil
import subprocess

ORIGINS = {'config': 'git@github.com:lucasfth/config.git',
           'library': 'git@github.com:lucasfth/volundr.git'}
FILES = ('controller.sh', 'controller.py', 'deliver.py', 'secret_gate.py', 'gitleaks.toml')


def prepare(home, source=Path(__file__).resolve().parent, origins=ORIGINS):
    home, source = Path(home), Path(source)
    code = home / '.local/libexec/volundr'
    state = home / '.local/state/volundr'
    for path in [code, state]:
        if path.is_symlink():
            raise ValueError('Refusing symlink runtime directory')
        path.mkdir(parents=True, exist_ok=True, mode=0o700)
        path.chmod(0o700)
    # Verify all existing repositories before changing runtime code.
    for name, origin in origins.items():
        repo = state / (name + '.git')
        if repo.is_symlink():
            raise ValueError('Refusing symlink repository')
        if not repo.exists():
            subprocess.run(['git', 'init', '--bare', str(repo)], check=True, capture_output=True)
            subprocess.run(['git', '-C', str(repo), 'remote', 'add', 'origin', origin], check=True)
        bare = subprocess.check_output(['git', '-C', str(repo), 'rev-parse', '--is-bare-repository'], text=True).strip()
        actual = subprocess.check_output(['git', '-C', str(repo), 'remote', 'get-url', 'origin'], text=True).strip()
        if bare != 'true' or actual != origin:
            raise ValueError('Unexpected controller repository origin/type: ' + name)
    for name in FILES:
        temporary = code / (name + '.new')
        with temporary.open('wb') as output:
            output.write((source / name).read_bytes())
        temporary.chmod(0o600)
        temporary.replace(code / name)
    return code


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true', required=True)
    args = parser.parse_args()
    print(prepare(Path.home()))
