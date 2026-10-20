#!/usr/bin/env python3
"""Disable only the legacy correction writer; no dream/cron execution.

Run without --apply to check the candidate. An approved live operation takes the
existing sync lock, backs up the script/receipt, and updates the expected hash.
"""
import argparse
import ast
import fcntl
import hashlib
import json
from pathlib import Path
import os
import shutil
import tempfile
import time

MARKER = '    # Disabled by Lucas: generated corrections must not rewrite guidance.\n    return\n'
FUNCTION = '_update_coding_style_corrections'


def disabled_source(source):
    tree = ast.parse(source)
    node = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == FUNCTION)
    if not (isinstance(node.body[0], ast.Expr) and
            isinstance(node.body[0].value, ast.Constant) and
            isinstance(node.body[0].value.value, str)):
        raise ValueError('Expected correction-writer docstring')
    if isinstance(node.body[1], ast.Return) and node.body[1].value is None:
        return source
    lines = source.splitlines(keepends=True)
    lines.insert(node.body[0].end_lineno, MARKER)
    candidate = ''.join(lines)
    changed = ast.parse(candidate)
    updated = next(n for n in changed.body if isinstance(n, ast.FunctionDef) and n.name == FUNCTION)
    if not isinstance(updated.body[1], ast.Return) or updated.body[1].value is not None:
        raise ValueError('Writer does not return immediately after its docstring')
    del updated.body[1]
    if ast.dump(tree, include_attributes=False) != ast.dump(changed, include_attributes=False):
        raise ValueError('Unexpected semantic changes outside the early return')
    return candidate


def digest(data):
    return hashlib.sha256(data).hexdigest()


def atomic_write(path, data, mode):
    fd, name = tempfile.mkstemp(prefix=path.name + '.', dir=path.parent)
    temporary = Path(name)
    try:
        with os.fdopen(fd, 'wb') as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        temporary.chmod(mode)
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def apply(script, deployment, expected):
    root = deployment.parent
    with (root / 'state/sync.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        original = script.read_bytes()
        receipt_bytes = deployment.read_bytes()
        receipt = json.loads(receipt_bytes)
        if digest(original) != expected or receipt['dream_guard']['after'] != expected:
            raise ValueError('Live script or rollback baseline changed; inspect before applying')
        candidate = disabled_source(original.decode()).encode()
        if candidate == original:
            return {'state': 'already-disabled', 'after': expected, 'dream_run': False}
        home = script.parent.parent
        jobs_path = home / 'cron/jobs.json'
        jobs_before = jobs_path.read_bytes()
        jobs = json.loads(jobs_before)
        jobs = jobs if isinstance(jobs, list) else jobs['jobs']
        job_id = receipt['original_dream_job']['id']
        job = next(j for j in jobs if j['id'] == job_id)
        if job.get('running') or job.get('state') == 'running':
            raise ValueError('Dream job is running; retry after completion')
        backup = root / ('correction-writer-backup-' + str(time.time_ns()))
        backup.mkdir(mode=0o700)
        shutil.copy2(script, backup / script.name)
        shutil.copy2(deployment, backup / deployment.name)
        report = {'before': expected, 'after': digest(candidate), 'backup': str(backup),
                  'dream_run': False, 'cron_sha256': digest(jobs_before),
                  'scope': 'Disable only the legacy correction writer; older backups retain the writer.'}
        receipt['dream_guard']['after'] = report['after']
        receipt.setdefault('maintenance', []).append(report)
        updated_receipt = (json.dumps(receipt, indent=2) + '\n').encode()
        (backup / 'receipt.json').write_text(json.dumps(report, indent=2) + '\n')
        if (script.read_bytes() != original or deployment.read_bytes() != receipt_bytes or
                (backup / script.name).read_bytes() != original or
                (backup / deployment.name).read_bytes() != receipt_bytes):
            raise ValueError('Concurrent change or backup mismatch')
        try:
            atomic_write(script, candidate, script.stat().st_mode & 0o777)
            if deployment.read_bytes() != receipt_bytes:
                raise ValueError('Deployment receipt changed during update')
            atomic_write(deployment, updated_receipt, deployment.stat().st_mode & 0o777)
        except BaseException:
            # Restore only our recognizable candidate, never overwrite concurrent work.
            if script.read_bytes() == candidate:
                atomic_write(script, original, script.stat().st_mode & 0o777)
            raise
        if script.read_bytes() != candidate or deployment.read_bytes() != updated_receipt:
            raise ValueError('Post-update readback differs')
        if jobs_path.read_bytes() != jobs_before:
            raise ValueError('Cron store changed concurrently; inspect separately')
        return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--script', type=Path, required=True)
    parser.add_argument('--deployment', type=Path)
    parser.add_argument('--expected', required=True)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    if args.apply:
        if args.deployment is None:
            parser.error('--deployment is required for --apply')
        print(json.dumps(apply(args.script, args.deployment, args.expected)))
    else:
        original = args.script.read_bytes()
        if digest(original) != args.expected:
            raise ValueError('Captured source hash differs')
        candidate = disabled_source(original.decode()).encode()
        print(json.dumps({'before': args.expected, 'after': digest(candidate), 'applied': False}))
