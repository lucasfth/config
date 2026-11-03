#!/usr/bin/env python3
"""Bounded deterministic vault hygiene. Only its dated Dream report is filed.

No raw note rewrites, deletion, git commit, identity changes, raw correction
writers or retired dream execution. Findings are evidence, never instructions.
"""
from datetime import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path
import time
import urllib.request
from zoneinfo import ZoneInfo
from report_outbox import save,run as report

HOME=Path('/Users/gimle/loki-data/live/hermes')
VAULT=Path('/Users/gimle/loki-data/loki-memory')
STATE=HOME/'state/nightly-hygiene'
RULES=('tech/vault-note-writing-rules.md','tech/Muninn-Maintenance-And-Capture-Review.md')
MAX_FILES=12000


def mcp(name,args):
    token=os.environ.get('MUNINN_MCP_TOKEN','')
    # The existing Hermes profile config uses the local Muninn service; the
    # interactive Pi URL is optional, not required in an unattended worker.
    url=os.environ.get('MUNINN_MCP_URL','http://127.0.0.1:8765/mcp')
    if not token or not url:raise ValueError('Existing MCP configuration unavailable')
    payload={'jsonrpc':'2.0','id':1,'method':'tools/call','params':{'name':name,'arguments':args}}
    request=urllib.request.Request(url,data=json.dumps(payload).encode(),
            headers={'Content-Type':'application/json','Authorization':'Bearer '+token})
    with urllib.request.urlopen(request,timeout=30) as response:
        raw=response.read(2*1024*1024+1)
    if len(raw)>2*1024*1024:raise ValueError('MCP result budget exceeded')
    result=json.loads(raw)
    if 'error' in result:raise ValueError('MCP protocol error')
    result=result['result']
    content=json.loads(next(c['text'] for c in result['content'] if c.get('type')=='text'))
    if result.get('isError') or 'error' in content:raise ValueError('MCP operation refused')
    return content


def inventory(vault,limit=MAX_FILES):
    notes=[];oversized=0;missing_yaml=0
    # Prune private and hidden trees BEFORE traversal/body reads.
    for root,dirs,files in os.walk(vault,followlinks=False):
        dirs[:]=sorted(d for d in dirs if not d.startswith('.') and d not in
            ('personal-notes','node_modules','_archive') and not (Path(root)/d).is_symlink())
        for name in sorted(files):
            p=Path(root)/name
            if p.is_symlink() or p.suffix.lower()!='.md':continue
            if len(notes)>=limit:raise ValueError('Inventory file budget exceeded; no partial success')
            with p.open('rb') as source:prefix=source.read(512)
            missing_yaml+=int(not prefix.startswith((b'---\n',b'---\r\n')))
            oversized+=int(p.stat().st_size>96000)
            notes.append(p.relative_to(vault).as_posix())
    return {'notes':len(notes),'missing_frontmatter':missing_yaml,'oversized_for_legacy_distill':oversized,
            'inventory_sha256':hashlib.sha256(json.dumps(notes,sort_keys=True).encode()).hexdigest(),
            'private_notes_excluded':True,'mutations':0,'semantic_review':False}


def execute(*,vault=VAULT,state=STATE,api=mcp,reporter=report,now=None):
    now=now or datetime.now(ZoneInfo('Europe/Copenhagen'))
    state.mkdir(parents=True,exist_ok=True,mode=0o700)
    with (state/'hygiene.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        receipt={'schema':1,'started':now.isoformat(),'state':'failed','semantic_review':False}
        try:
            rule_revisions={name:api('vault_read',{'filename':name})['sha256'] for name in RULES}
            result=inventory(vault)
            relative=f'dreams/{now.date().isoformat()}-Dream.md'
            note=vault/relative
            old=note.read_bytes() if note.exists() else None
            # Existing output from another owner is never overwritten automatically.
            owned=b'producer: bounded-nightly-hygiene-v1\n'
            if old is not None and owned not in old:
                raise ValueError('Dated Dream output belongs to another producer')
            content=(f'---\ntitle: Nightly vault hygiene {now.date()}\ntype: maintenance-report\n'
                f'tags: [vault-maintenance, nightly-hygiene]\nstatus: active\nupdated: {now.date()}\n'
                'producer: bounded-nightly-hygiene-v1\n---\n'
                f'# Nightly vault hygiene — {now.date()}\n\n'
                'Deterministic bounded inventory, not semantic synthesis or proof of skill effectiveness.\n\n'
                f"- Non-private active Markdown notes: {result['notes']}\n"
                f"- Notes lacking frontmatter: {result['missing_frontmatter']} (reported, not rewritten).\n"
                f"- Notes above the legacy byte budget: {result['oversized_for_legacy_distill']} (not truncated).\n"
                f"- Filename inventory SHA-256: `{result['inventory_sha256']}`.\n"
                '- No source-note edits, deletion, instruction promotion, git operations or external consequential actions.\n'
                '- AAR extraction and hash-review retain separate receipts; this report does not claim their success.\n')
            index=vault/'dreams/_INDEX.md'
            expected=hashlib.sha256(old).hexdigest() if old is not None else 'missing'
            index_before=index.read_bytes() if index.exists() else None
            args={'filename':relative,'content':content,
                  'expected_revision':expected,
                  'expected_index_revision':hashlib.sha256(index_before).hexdigest() if index_before else 'missing',
                  'index_entry':f'- [[{relative[:-3]}|Nightly vault hygiene {now.date()}]]'}
            if old!=content.encode():
                # Current file_note receipts do not expose overwritten-note archive
                # IDs. Preserve+verify through guarded vault_write first, then file
                # the identical readback through the supported filing transaction.
                preservation=None
                if old is not None:
                    written=api('vault_write',{'filename':relative,'content':content,'expected_revision':expected})
                    preservation=written.get('archive')
                    if not isinstance(preservation,dict) or not preservation.get('archive_id'):
                        receipt['state']='preservation-pending'
                        raise ValueError('Required prior-byte archive receipt unavailable')
                    preserved=api('vault_archive_read',{'archive_id':preservation['archive_id']})
                    if preserved.get('sha256')!=expected:raise ValueError('Prior-byte preservation readback mismatch')
                    args['expected_revision']=hashlib.sha256(content.encode()).hexdigest()
                filing=api('vault_file_note',args)
                if filing.get('filing')!='complete':raise ValueError('Guarded filing pending; evidence retained')
                if preservation:filing['verified_prior_archive']=preservation
            else:filing={'filing':'complete','unchanged':True}
            readback=api('vault_read',{'filename':relative})
            digest=hashlib.sha256(content.encode()).hexdigest()
            if readback.get('sha256')!=digest or note.read_bytes()!=content.encode():
                raise ValueError('Dream readback mismatch')
            index_readback=api('vault_read',{'filename':'dreams/_INDEX.md'})
            index_bytes=index.read_bytes()
            index_digest=hashlib.sha256(index_bytes).hexdigest()
            if index_readback.get('sha256')!=index_digest or args['index_entry'] not in index_bytes.decode().splitlines():
                raise ValueError('Guarded index readback mismatch')
            if filing.get('index_revision') and filing['index_revision']!=index_digest:
                raise ValueError('Filing receipt index revision mismatch')
            reporting=reporter({'night':str(now.date()),'kind':'vault','title':'Nightly bounded vault hygiene',
                'summary':'Verified deterministic inventory and guarded Dream filing; no semantic synthesis.',
                'details':result})
            receipt.update(state='degraded-reporting' if reporting['state']=='degraded' else 'complete',
                           note=relative,note_sha256=digest,inventory=result,rules=rule_revisions,
                           filing=filing,index_sha256=index_digest,reporting=reporting)
        except Exception as error:
            receipt['error_type']=type(error).__name__
            # No raw exceptions, note text, tokens, paths or server bodies in alerts.
        receipt['finished_epoch']=time.time()
        save(state/'latest.json',receipt)
        save(state/('runs/'+now.strftime('%Y%m%d-%H%M%S')+'.json'),receipt)
        return receipt


def main():
    result=execute()
    print(json.dumps({'state':result['state'],'semantic_review':False,
                      'note_verified':'note_sha256' in result,'error_type':result.get('error_type')}))
    return int(result['state'] not in ('complete','degraded-reporting'))

if __name__=='__main__':raise SystemExit(main())
