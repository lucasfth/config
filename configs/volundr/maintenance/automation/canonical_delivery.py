"""Exact reviewed payload adoption into existing Volundr routes, never Git refs.

Explicit local delivery records only. No publication, pin/root switches, model
calls or semantic approval. A changed destination fails CAS, never overwrites it.
"""
import fcntl
import hashlib
import json
from pathlib import Path
import re
from deploy_atomic import atomic

SOURCE_ROOT=Path('/Users/gimle/loki-data/live/hermes/cache/scratch/muninn-autonomous-loop/stage/canonical-delivery-payload')
TARGET_ROOTS={Path('/Users/gimle/loki-data/live/volundr'),Path('/Users/gimle/config/volundr')}
AUTO_STATE=Path('/Users/gimle/loki-data/live/hermes/volundr-nightly/aar-state/auto-review')


def sha(raw):return hashlib.sha256(raw).hexdigest()


def path_in(root,name):
    if not re.fullmatch(r'skills/[a-z0-9][a-z0-9-]*/(?:SKILL\.md|references/[a-z0-9][a-z0-9.-]*\.md)',name):raise ValueError('Unsupported payload path')
    p=root
    for part in Path(name).parts:
        p=p/part
        if p.is_symlink():raise ValueError('Symlink payload route')
    if root.is_symlink():raise ValueError('Symlink library root')
    return p


def digest(path):return sha(path.read_bytes()) if path.exists() else None


def apply(record,state):
    return _apply(record,state,SOURCE_ROOT)


def _apply(record,state,source_root):
    if record.get('scope')!='local-canonical-payload-delivery' or not record.get('review_evidence_sha256'):raise ValueError('Explicit review provenance required')
    evidence=Path(record['review_evidence_path'])
    if evidence.is_symlink() or sha(evidence.read_bytes())!=record['review_evidence_sha256']:raise ValueError('Review provenance changed')
    source=Path(record['source_root']);target=Path(record['target_root']);state=Path(state)
    if source!=source_root or target not in TARGET_ROOTS or source.is_symlink() or target.is_symlink():raise ValueError('Unapproved delivery root')
    state.mkdir(parents=True,exist_ok=True,mode=0o700)
    with (state/'delivery.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        binding=sha(json.dumps(record,sort_keys=True).encode());journal=state/'journal.json'
        if journal.exists():
            old=json.loads(journal.read_text())
            if old['record_sha256']!=binding:raise ValueError('Unresolved other delivery')
            rollback(record,state)
        # Preflight ALL source/destination paths before any consumer writes.
        for name,entry in record['files'].items():
            s=path_in(source,name);t=path_in(target,name)
            if digest(s)!=entry['after']:raise ValueError('Reviewed source changed')
            if digest(t) not in (entry['before'],entry['after']):raise ValueError('Concurrent target edit')
        final=state/'final.json'
        if final.exists():
            previous=json.loads(final.read_text())
            if previous['record_sha256']!=binding:raise ValueError('Delivery receipt binding changed')
            if any(digest(path_in(target,n))!=e['after'] for n,e in record['files'].items()):raise ValueError('Delivered bytes changed')
            return previous
        previous={}
        for name in record['files']:
            p=path_in(target,name);previous[name]=digest(p)
            if p.exists():atomic(state/'backup'/name,p.read_bytes())
        atomic(state/'record.json',(json.dumps(record,indent=2)+'\n').encode())
        atomic(journal,json.dumps({'record_sha256':binding,'previous':previous}).encode())
        try:
            for name,entry in record['files'].items():
                s=path_in(source,name);t=path_in(target,name)
                if digest(s)!=entry['after'] or digest(t)!=previous[name]:raise ValueError('Concurrent delivery edit')
                atomic(t,s.read_bytes())
                if digest(t)!=entry['after']:raise ValueError('Delivery readback mismatch')
            receipt={'state':'locally-delivered-unpublished','record_sha256':binding,'files':record['files'],
                'source_root':str(source),'target_root':str(target),'review_evidence_sha256':record['review_evidence_sha256'],
                'published':False,'loader_proven':False,'behavior_improvement':'unmeasured'}
            atomic(final,(json.dumps(receipt,indent=2)+'\n').encode());journal.unlink()
            return receipt
        except BaseException as error:
            try:rollback(record,state)
            except Exception as rollback_error:error.add_note('Rollback incomplete: '+str(rollback_error))
            raise


def rollback(record,state):
    journal=state/'journal.json';progress=json.loads(journal.read_text());failures=[]
    for name,entry in record['files'].items():
        try:
            p=path_in(Path(record['target_root']),name);before=progress['previous'][name]
            if digest(p)==before:continue
            if digest(p)!=entry['after']:raise ValueError('Concurrent rollback edit')
            if before is None:p.unlink()
            else:
                raw=(state/'backup'/name).read_bytes()
                if sha(raw)!=before:raise ValueError('Backup changed')
                atomic(p,raw)
        except Exception as error:failures.append(type(error).__name__+':'+name)
    if failures:raise RuntimeError('Delivery rollback incomplete; retained journal: '+','.join(failures))
    journal.unlink()

def loader_proof(target,expected):
    """Fresh native catalogues and exact resolved file bytes; no model requests."""
    import os,subprocess
    code=Path('/Users/gimle/loki-data/live/hermes/volundr-nightly/code')
    settings=json.loads((code/'settings.json').read_text());name=Path(target).parts[1]
    probe=('import json,hashlib;from pathlib import Path;from tools.skills_tool import _skill_catalog;'
        'rows=[r for r in _skill_catalog(include_hidden=True) if r["name"]=='+repr(name)+' and r.get("status") not in ("shadowed","collision")];'
        'assert len(rows)==1;path=Path(rows[0]["path"]).resolve();print(json.dumps({"path":str(path),"sha256":hashlib.sha256(path.read_bytes()).hexdigest()}))')
    env={**os.environ,**settings.get('runtime_env',{}),'HERMES_HOME':'/Users/gimle/loki-data/live/hermes','PYTHONDONTWRITEBYTECODE':'1'}
    loki=subprocess.run([settings['runtime_python'],'-c',probe],cwd=settings['runtime_source'],env=env,capture_output=True,text=True,timeout=60)
    package='/Users/gimle/config/configs/pi/node_modules/@earendil-works/pi-coding-agent/dist/index.js'
    node=('import {readFile,realpath} from "node:fs/promises";import {createHash} from "node:crypto";'
        'import {DefaultResourceLoader,SettingsManager} from '+json.dumps(package)+';'
        'const cwd="/Users/gimle/loki-data/live/hermes/cache/scratch/muninn-autonomous-loop",agentDir="/Users/gimle/.local/share/huginn-pi/agent";'
        'const loader=new DefaultResourceLoader({cwd,agentDir,settingsManager:SettingsManager.create(cwd,agentDir,{projectTrusted:true})});await loader.reload();'
        'const rows=loader.getSkills().skills.filter(s=>s.name==='+json.dumps(name)+');if(rows.length!==1)throw Error("missing/ambiguous");'
        'const path=await realpath(rows[0].filePath);console.log(JSON.stringify({path,sha256:createHash("sha256").update(await readFile(path)).digest("hex")}));')
    huginn=subprocess.run(['node','--input-type=module','-e',node],env=env,capture_output=True,text=True,timeout=60)
    result={}
    for who,proc,root in [('loki',loki,Path('/Users/gimle/loki-data/live/volundr')),('huginn',huginn,Path('/Users/gimle/config/volundr'))]:
        if proc.returncode:raise ValueError('Native loader failed: '+who)
        value=json.loads(proc.stdout)
        if value['path']!=str(root/target) or value['sha256']!=expected:raise ValueError('Native loader payload mismatch: '+who)
        result[who]=value
    return result


def adopt_reviewed(run,vault,library):
    """Trusted continuation from process review + exact private application only."""
    import canonical_apply,auto_review,review_runner,tempfile
    run=Path(run)
    if run.parent!=AUTO_STATE/'runs' or not re.fullmatch('[a-f0-9]{64}',run.name) or run.is_symlink():raise ValueError('Unowned automatic delivery run')
    review_runner.verify_record(run)
    application=canonical_apply.apply_reviewed(run,vault,library)
    bound=json.loads((run/'candidate.json').read_text());target=bound['target']
    canonical_apply.target_path(Path('/nonexistent'),target)
    # Re-run content/source checks even on cached application. No semantic caller flag.
    with tempfile.TemporaryDirectory() as folder:
        tree=Path(folder);p=path_in(tree,target);p.parent.mkdir(parents=True);p.write_text(bound['base'])
        proposal={k:bound[k] for k in ('target','quote','span_start','span_end','candidate')}
        proposal.update(diagnosis='missing-procedure',rationale='reviewed continuation')
        if auto_review.validate(vault,tree,bound['source'],bound['source_sha256'],proposal)!=bound:raise ValueError('Accepted candidate changed')
    payload=run/'canonical-application/payload'
    if digest(path_in(payload,target))!=bound['candidate_sha256']:raise ValueError('Applied payload changed')
    folder=run/'consumer-delivery';folder.mkdir(exist_ok=True,mode=0o700)
    evidence={n:sha((run/n).read_bytes()) for n in ('candidate.json','base.md','evaluation.json','reviewer.json','canonical-application/final.json')}
    proof=folder/'accepted.json';accepted={'evidence':evidence,'target':target,'candidate_sha256':bound['candidate_sha256']}
    if proof.exists():
        if json.loads(proof.read_text())!=accepted:raise ValueError('Accepted evidence binding changed')
    else:atomic(proof,(json.dumps(accepted,sort_keys=True)+'\n').encode())
    plans=folder/'plans.json'
    records=[]
    for root in sorted(TARGET_ROOTS):
        current=digest(path_in(root,target))
        if current not in (bound['base_sha256'],bound['candidate_sha256']):raise ValueError('Consumer target differs from reviewed base')
        records.append({'scope':'local-canonical-payload-delivery','source_root':str(payload),'target_root':str(root),
            'review_evidence_path':str(proof),'review_evidence_sha256':sha(proof.read_bytes()),
            'files':{target:{'before':bound['base_sha256'],'after':bound['candidate_sha256']}}})
    if plans.exists():
        if json.loads(plans.read_text())!=records:raise ValueError('Consumer plans changed')
    else:atomic(plans,(json.dumps(records,sort_keys=True)+'\n').encode())
    # Preflight above covers BOTH consumers before first write; partial delivery
    # retains per-consumer receipts and resumes without touching divergent edits.
    for index,record in enumerate(records):_apply(record,folder/str(index),payload)
    loaded=loader_proof(target,bound['candidate_sha256'])
    result={'state':'locally-delivered-unpublished','consumer_loaded':True,'fresh_loader_proof':loaded,
        'candidate_sha256':bound['candidate_sha256'],'accepted_evidence_sha256':sha(proof.read_bytes()),
        'published':False,'behavior_uplift':'unproven','provider_calls':0}
    atomic(folder/'final.json',(json.dumps(result,sort_keys=True)+'\n').encode());return result


if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--record',type=Path,required=True)
    parser.add_argument('--state',type=Path,required=True)
    args=parser.parse_args()
    result=apply(json.loads(args.record.read_text()),args.state)
    print(json.dumps({'state':result['state'],'published':False,'loader_proven':False}))
