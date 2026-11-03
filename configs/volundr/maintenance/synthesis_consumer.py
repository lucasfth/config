"""Consume one bounded hash-review page into local durable receipts.

No model calls, note writes, retired Dreaming imports or scheduler mutation.
An independent operator must review findings; persistence is not approval.
"""
import argparse
from datetime import datetime, timezone
import fcntl
import hashlib
import re
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import uuid

import synthesis_review

MAX_PENDING = 100
MAX_PENDING_BYTES = 32768


def _safe(path):
    path = Path(os.path.abspath(path))
    if any(p.is_symlink() for p in (path, *path.parents)):
        raise ValueError('consumer paths must not contain symlinks')
    return path


def _atomic(path, payload):
    _safe(path)
    data = json.dumps(payload, sort_keys=True).encode()
    fd, temporary = tempfile.mkstemp(prefix='.pending-', dir=path.parent)
    try:
        with os.fdopen(fd, 'wb') as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
        directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        Path(temporary).unlink(missing_ok=True)


def _report(ledger, vault, max_items, after):
    command = [sys.executable, str(Path(__file__).with_name('synthesis_review.py')),
               '--ledger', str(ledger), '--vault', str(vault), '--max-items', str(max_items)]
    if after is not None:
        command += ['--after', after]
    # The fixed reviewed child caps JSON at 64 KiB. A subprocess timeout also
    # bounds filesystem/SQLite calls that cooperative evaluation cannot stop.
    result = subprocess.run(command, capture_output=True, timeout=5, check=False)
    if len(result.stdout) > 65536:
        raise ValueError('oversized_report')
    payload = json.loads(result.stdout)
    if result.returncode or payload.get('status') == 'unavailable':
        raise ValueError('report_unavailable')
    if payload.get('status') not in ('complete', 'partial', 'no_registrations'):
        raise ValueError('invalid_report')
    return payload


def _alert(receipt, previous):
    blocked = receipt['status'] in ('unavailable', 'retry')
    # Only a completed full scan cycle may replace the stale inventory.
    # Partial pages accumulate separately; never announce early recovery.
    report = receipt.get('report', {})
    findings = dict(previous.get('stale_findings', {}))
    cycle = {} if receipt.get('after') is None else dict(previous.get('cycle_stale', {}))
    for item in report.get('items', []):
        if item.get('status') == 'stale':
            cycle[item['filename']] = hashlib.sha256(json.dumps({
                'registration':item.get('registration_id'), 'warnings':item.get('warnings', [])},
                sort_keys=True).encode()).hexdigest()
    full = report.get('status', receipt['status']) in ('complete', 'no_registrations') and not blocked
    if full: findings = cycle
    elif blocked: findings.update(cycle)  # Retry discoveries survive a restarted cycle.
    if len(findings) > MAX_PENDING:
        raise ValueError('stale alert inventory budget exceeded')
    key = None
    if blocked or findings:
        pending = receipt.get('pending', {})
        issue = [receipt['status'] if blocked else 'stale', receipt.get('error'),
                 bool(any(receipt.get('overflow', {}).values())),
                 None if pending or findings else receipt.get('after'),
                 sorted((name, item['status']) for name, item in pending.items()),
                 sorted(findings.items())]
        key = hashlib.sha256(json.dumps(issue, sort_keys=True).encode()).hexdigest()
    same = key is not None and key == previous.get('fingerprint')
    return {'fingerprint': key, 'emit': (not same if key else bool(previous.get('fingerprint'))),
            'streak': previous.get('streak', 0) + 1 if same else int(key is not None),
            'stale_findings': findings, 'cycle_stale': cycle}


def alert_text(receipt):
    if not receipt['alert']['emit']:
        return '[SILENT]'
    stale = receipt['alert'].get('stale_findings', {})
    if stale and receipt['status'] not in ('unavailable', 'retry'):
        return ('Muninn hash review: ' + str(len(stale)) + ' stale registered summaries. '
                'Inspect latest.json; historical evidence retained, no automatic rewrites or semantic review.')
    if receipt['status'] not in ('unavailable', 'retry'):
        return 'Muninn synthesis review recovered. Bounded scanning resumed; no automatic rewrites.'
    overflow = receipt.get('overflow', {})
    detail = ('Queue overflow: current cycle ' + str(overflow.get('cycle_count', 0))
              + ', last completed cycle ' + str(overflow.get('last_cycle_count', 0))
              + ' incomplete evaluations not individually queued; all rows retried next cycle. '
              if any(overflow.values()) else '')
    return ('Muninn synthesis review unresolved: ' + receipt.get('error', 'incomplete evaluation')
            + '. ' + detail
            + ('Scanning continues; unresolved findings revisited next cycle. Retry count: '
               if not receipt.get('error') and 'examined_paths' in receipt.get('report', {}) else
               'Cursor retained; later findings not yet evaluated. Retry count: ')
            + str(receipt['alert']['streak'])
            + '. Inspect latest.json; operator review needed if persistent.')


def _retain(receipts, current):
    # Keep at most 100 operational receipts, not dependency evidence. Only our
    # exact UUID filenames qualify; unrelated operator files are untouched.
    candidates = [_safe(p) for p in receipts.iterdir()
                  if re.fullmatch(r'[0-9a-f]{32}\.json', p.name) and p.name != current]
    candidates.sort(key=lambda p: (p.stat().st_mtime_ns, p.name), reverse=True)
    for path in candidates[99:]:
        if not path.is_file():
            raise ValueError('invalid receipt type')
        path.unlink()


def consume(ledger, vault, state_dir, *, max_items=20):
    if type(max_items) is not int or not 1 <= max_items <= 100:
        raise ValueError('max_items must be an integer between 1 and 100')
    vault, state_dir = _safe(vault), _safe(state_dir)
    ledger = _safe(ledger)
    if state_dir == vault or vault in state_dir.parents:
        raise ValueError('consumer state must be outside the vault')
    state_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    receipts = _safe(state_dir / 'receipts')
    receipts.mkdir(exist_ok=True, mode=0o700)
    lock = os.open(_safe(state_dir / 'consumer.lock'), os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        state_path = _safe(state_dir / 'state.json')
        state = json.loads(state_path.read_text()) if state_path.exists() else {}
        # Reusing a cursor for a different ledger or vault could hide work.
        identity = {'ledger': str(ledger), 'vault': str(vault)}
        if state and state.get('identity') != identity:
            raise ValueError('consumer state belongs to a different ledger or vault')
        after = state.get('next_after')
        if after is not None:
            synthesis_review.validate_cursor(after)
        pending = state.get('pending', {})
        if not isinstance(pending, dict) or len(pending) > MAX_PENDING:
            raise ValueError('invalid pending state')
        for name, item in pending.items():
            synthesis_review.validate_cursor(name)
            if not isinstance(item, dict) or item.get('filename') != name or item.get('status') not in ('incomplete', 'unavailable'):
                raise ValueError('invalid pending item')
        if len(json.dumps(pending).encode()) > MAX_PENDING_BYTES:
            raise ValueError('oversized pending state')
        overflow = state.get('overflow', {'cycle_count': 0, 'last_cycle_count': 0})
        if (not isinstance(overflow, dict) or set(overflow) != {'cycle_count', 'last_cycle_count'}
                or any(type(n) is not int or not 0 <= n <= 2**63 - 1 for n in overflow.values())):
            raise ValueError('invalid overflow state')
        receipt = {'id': uuid.uuid4().hex, 'at': datetime.now(timezone.utc).isoformat(),
                   'identity': identity, 'after': after, 'next_after': after,
                   'status': 'unavailable', 'pending': pending, 'overflow': overflow,
                   'automatic_rewrites': False}
        try:
            report = _report(ledger, vault, max_items, after)
            receipt['report'] = report
            incomplete = any(i.get('status') in ('incomplete', 'unavailable') for i in report['items'])
            next_after = report.get('next_after')
            if next_after is not None:
                synthesis_review.validate_cursor(next_after)
            examined = report.get('examined_paths')
            if examined is not None:
                if not isinstance(examined, list) or len(examined) > max_items:
                    raise ValueError('invalid examined paths')
                for name in examined:
                    synthesis_review.validate_cursor(name)
                ordered = ([after] if after is not None else []) + examined
                if (len(set(examined)) != len(examined) or after in examined
                        or any(left >= right for left, right in zip(ordered, ordered[1:])
                               if not synthesis_review.is_row_cursor(left) and not synthesis_review.is_row_cursor(right))):
                    raise ValueError('invalid examined order')
                # Opaque row references carry no lexical filename information.
                # SQL in the fixed reviewed child enforces ordering across them.
                if next_after != (examined[-1] if examined else None):
                    raise ValueError('invalid examination cursor')
                updated = {name: item for name, item in pending.items() if name not in examined}
                omitted = 0
                for item in report['items']:
                    if item['filename'] not in examined:
                        raise ValueError('unexamined finding')
                    if item['status'] in ('incomplete', 'unavailable'):
                        updated[item['filename']] = item
                        if len(updated) > MAX_PENDING or len(json.dumps(updated).encode()) > MAX_PENDING_BYTES:
                            del updated[item['filename']]
                            omitted += 1
                # Retain the bounded queue plus a saturating per-cycle count.
                # Overflow names remain in this page receipt, not the queue.
                # Advancing avoids starving later stale findings; the next full
                # cycle retries ALL rows, including overflow, without a name list.
                count = min(2**63 - 1, overflow['cycle_count'] + omitted)
                complete = report['status'] != 'partial'
                receipt['overflow'] = {'cycle_count': 0 if complete else count,
                                       'last_cycle_count': count if complete else overflow['last_cycle_count']}
                receipt['pending'] = updated
                receipt['status'] = 'retry' if updated or any(receipt['overflow'].values()) else report['status']
                receipt['next_after'] = next_after if not complete else None
            elif pending or incomplete or (report['status'] == 'partial' and
                              (next_after is None or (after is not None and next_after <= after))):
                receipt['status'] = 'retry'
            else:
                receipt['status'] = report['status']
                receipt['next_after'] = next_after if report['status'] == 'partial' else None
        except subprocess.TimeoutExpired:
            receipt['error'] = 'report_timeout'
        except (ValueError, OSError, KeyError, TypeError):
            receipt['error'] = 'report_unavailable'
        # Commit evidence before publishing/advancing the cursor. A crash can
        # duplicate a page, never acknowledge a page whose receipt was lost.
        receipt['alert'] = _alert(receipt, state.get('alert', {}))
        _atomic(receipts / (receipt['id'] + '.json'), receipt)
        _atomic(state_dir / 'latest.json', receipt)
        _atomic(state_path, {'identity': identity, 'next_after': receipt['next_after'],
                             'receipt_id': receipt['id'], 'alert': receipt['alert'], 'pending': receipt['pending'],
                             'overflow': receipt['overflow']})
        _retain(receipts, receipt['id'] + '.json')
        return receipt
    finally:
        os.close(lock)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for option in ('ledger', 'vault', 'state-dir'):
        parser.add_argument('--' + option, type=Path, required=True)
    parser.add_argument('--max-items', type=int, default=20)
    parser.add_argument('--alerts-only', action='store_true', help='deduplicated cron output; persisted failures are output, not process failures')
    args = parser.parse_args()
    try:
        receipt = consume(args.ledger, args.vault, args.state_dir, max_items=args.max_items)
    except (ValueError, OSError):
        print(json.dumps({'status': 'unavailable', 'error': 'consumer_state_unavailable'}))
        return 1
    if args.alerts_only:
        print(alert_text(receipt))
        return 0
    print(json.dumps(receipt))
    return int(receipt['status'] in ('unavailable', 'retry'))


if __name__ == '__main__':
    raise SystemExit(main())
