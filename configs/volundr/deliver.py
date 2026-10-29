#!/usr/bin/env python3
"""Deliver config's published Volundr pin to Loki on Gimle.

No remote credentials are exported. Local unpublished pins are never delivered.
"""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import secret_gate
import attestation


def run(*args):
    return subprocess.check_output([str(a) for a in args], text=True, timeout=90).strip()


def published_pin(config, library):
    run('git', '-C', config, 'fetch', 'origin', '+refs/heads/main:refs/remotes/origin/main')
    config_revision = run('git', '-C', config, 'rev-parse', 'origin/main')
    entry = run('git', '-C', config, 'ls-tree', config_revision, 'volundr').split()
    if len(entry) != 4 or entry[:2] != ['160000', 'commit']:
        raise ValueError('Published config has no Volundr gitlink')
    target = entry[2]
    run('git', '-C', library, 'fetch', 'origin', '+refs/heads/main:refs/remotes/origin/main')
    run('git', '-C', library, 'merge-base', '--is-ancestor', target, 'origin/main')
    return config_revision, target


def deliver(config, library, host, check=False, inbox=None):
    revision, target = published_pin(config, library)
    secret_gate.scan(library, 'history', target)
    secret_gate.scan(library, 'tree', target)
    if check:
        return {'status': 'checked', 'config_revision': revision, 'target': target, 'host': host}
    with tempfile.TemporaryDirectory(prefix='volundr-delivery-') as directory:
        directory = Path(directory)
        # A temporary ref includes even an older pinned revision without changing branches.
        ref = 'refs/nightly-delivery/' + str(os.getpid())
        run('git', '-C', library, 'update-ref', ref, target)
        bundle = directory / (target + '.bundle')
        try:
            run('git', '-C', library, 'bundle', 'create', bundle, ref)
        finally:
            run('git', '-C', library, 'update-ref', '-d', ref)
        item = {'config_revision': revision, 'target': target, 'created_at': time.time(),
                'bundle_ref': ref, 'bundle_sha256': hashlib.sha256(bundle.read_bytes()).hexdigest()}
        key = Path.home() / '.local/state/volundr/history-signing-key'
        if key.is_file():
            item['history_proof'] = attestation.sign(item, bundle, key)
        elif inbox is None:
            raise RuntimeError('Controller signing key missing; refusing unsigned remote delivery')
        receipt = directory / 'delivery.json'
        receipt.write_text(json.dumps(item) + '\n')
        if inbox is not None:
            inbox = Path(inbox)
            inbox.mkdir(parents=True, exist_ok=True, mode=0o700)
            for source, name in [(bundle, target + '.bundle'), (receipt, 'delivery.json')]:
                temporary = inbox / (name + '.tmp')
                temporary.write_bytes(source.read_bytes())
                temporary.replace(inbox / name)
        else:
            # Fixed remote destination; no credentials or host-key bypass.
            ssh = ['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', host]
            run(*ssh, 'mkdir -p "$HOME/.hermes/volundr-nightly/inbox"; chmod 700 "$HOME/.hermes/volundr-nightly/inbox"')
            dest = host + ':.hermes/volundr-nightly/inbox/'
            run('scp', '-q', '-o', 'BatchMode=yes', bundle, dest + target + '.bundle.tmp')
            run('scp', '-q', '-o', 'BatchMode=yes', receipt, dest + 'delivery.json.tmp')
            run(*ssh, 'cd "$HOME/.hermes/volundr-nightly/inbox" && mv ' + target + '.bundle.tmp ' + target + '.bundle && mv delivery.json.tmp delivery.json')
    return {'status': 'delivered', 'config_revision': revision, 'target': target}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', type=Path, required=True)
    parser.add_argument('--library', type=Path, required=True)
    parser.add_argument('--host', default='gimle')
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--inbox', type=Path, help='Local delivery destination for offline transport tests')
    args = parser.parse_args()
    lockdir = Path.home() / '.local/state/volundr'
    lockdir.mkdir(parents=True, exist_ok=True, mode=0o700)
    with (lockdir / 'delivery.lock').open('w') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise SystemExit('Delivery already running')
        print(json.dumps(deliver(args.config.resolve(), args.library.resolve(), args.host, args.check, args.inbox)))
