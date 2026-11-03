#!/usr/bin/env python3
"""Watch the CURRENT nightly hygiene output and verified chain receipts."""
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo
import hashlib
import json
import os
import fcntl
import sys

HOME=Path('/Users/gimle/loki-data/live/hermes')
VAULT=Path('/Users/gimle/loki-data/loki-memory')
STATE=HOME/'state/nightly-hygiene'
JOB='718cfbc7dbfa'


def assess(vault,state,now=None):
    now=now or datetime.now(ZoneInfo('Europe/Copenhagen'))
    # The job fires 23:30: at the morning watch the expected producer date
    # is yesterday, never whichever historical file was recently touched.
    expected=(now.date() if (now.hour,now.minute)>=(23,45) else now.date()-timedelta(days=1))
    receipt_path=state/'latest.json'
    receipt=json.loads(receipt_path.read_text()) if receipt_path.exists() else None
    # A verified same-day manual producer run is newer than the last scheduled
    # deadline; accept its exact date-bound output, never an arbitrary mtime.
    today=f'dreams/{now.date().isoformat()}-Dream.md'
    if receipt and receipt.get('note')==today and receipt.get('state') in ('complete','degraded-reporting'):
        expected=now.date()
    target=vault/f'dreams/{expected.isoformat()}-Dream.md'
    findings=[]
    latest=target if target.is_file() and not target.is_symlink() else None
    if latest is None:findings.append('nightly-dream-missing')
    else:
        age=(now.timestamp()-latest.stat().st_mtime)/3600
        if age>36 or age < -1:findings.append('nightly-dream-stale')
    if receipt is None:findings.append('verified-chain-receipt-missing')
    else:
        if receipt.get('state') not in ('complete','degraded-reporting'):findings.append('hygiene-chain-failed')
        if now.timestamp()-receipt.get('finished_epoch',0)>36*3600:findings.append('hygiene-chain-stale')
        if latest and receipt.get('note')==str(latest.relative_to(vault)):
            if hashlib.sha256(latest.read_bytes()).hexdigest()!=receipt.get('note_sha256'):
                findings.append('dream-output-revision-changed')
        elif latest:findings.append('dream-output-not-bound-to-receipt')
        index=vault/'dreams/_INDEX.md'
        if receipt.get('index_sha256') and (not index.is_file() or hashlib.sha256(index.read_bytes()).hexdigest()!=receipt['index_sha256']):
            findings.append('dream-index-revision-changed')
        if receipt.get('reporting',{}).get('state')=='degraded':findings.append('remote-reporting-degraded')
    return {'producer_job':JOB,'note':str(latest.relative_to(vault)) if latest else None,
            'findings':findings,'state':'healthy' if not findings else 'degraded'}


def main():
    from report_outbox import save
    STATE.mkdir(parents=True,exist_ok=True,mode=0o700)
    with (STATE/'watch.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        result=assess(VAULT,STATE)
        marker=STATE/'watch.json'
        old=json.loads(marker.read_text()) if marker.exists() else {}
        fingerprint=hashlib.sha256(json.dumps(result,sort_keys=True).encode()).hexdigest()
        changed=old.get('fingerprint')!=fingerprint
        save(marker,{'fingerprint':fingerprint,'result':result})
        if changed and result['findings']:
            print('Nightly Muninn hygiene degraded: '+', '.join(result['findings'])+
                  '. Inspect nightly-hygiene/latest.json; producer job '+JOB+'. Hash/output checks, not semantic synthesis.')
        elif changed and old.get('result',{}).get('findings'):
            print('Nightly Muninn hygiene recovered: Dream output and chain receipt verified.')
        return 0

if __name__=='__main__':raise SystemExit(main())
