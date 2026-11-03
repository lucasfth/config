"""Apply exact independently reviewed task-skill payload in an isolated library tree.

Never mutates the dirty shared clone, remote refs, pins or consumers. Local
commits are confined to the owned private clone. An
application here is locally applied/unpublished, NOT delivered or loaded.
"""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from deploy_atomic import atomic

PROTECTED=re.compile(r'(?i)(soul|identity|security|privacy|credential|permission|access|auth|personal-notes|salary|payroll)')

def sha(raw):return hashlib.sha256(raw).hexdigest()

def target_path(root,name):
    if not re.fullmatch(r'skills/[a-z0-9][a-z0-9-]*/SKILL\.md',name) or PROTECTED.search(name):
        raise ValueError('Protected or unsupported application target')
    path=root
    for part in Path(name).parts:
        path=path/part
        if path.is_symlink():raise ValueError('Symlink application target')
    return path


def command(argv,cwd,timeout=120):
    result=subprocess.run(argv,cwd=cwd,capture_output=True,timeout=timeout,
        env={**os.environ,'PYTHONDONTWRITEBYTECODE':'1','GIT_TERMINAL_PROMPT':'0'})
    if result.returncode:raise ValueError('Local gate failed: '+Path(argv[0]).name)
    return result.stdout


def prepare(library,run):
    """Fresh remote ref verified before a detached task-only worktree."""
    work=run/'canonical-worktree'
    if work.exists():
        registered=json.loads((run/'canonical-base.json').read_text())
        if registered.get('worktree')!=str(work) or registered.get('private_repository')!=str(run/'canonical-repository'):
            raise ValueError('Unowned existing worktree')
        if (run/'canonical-application/progress.json').exists() and not (run/'canonical-application/final.json').exists():
            recover_application(run)
        if command(['git','rev-parse','HEAD'],work).decode().strip()!=registered['revision']:
            raise ValueError('Existing worktree revision changed')
        if command(['git','status','--porcelain'],work).strip():raise ValueError('Existing worktree has unresolved application changes')
        return work
    # A private clone owns every fetched ref and task branch. Even origin/main
    # tracking updates must not touch the concurrent dirty shared checkout.
    import shutil
    free=shutil.disk_usage(run).free
    # Bounded library clone/worktree reservation; fail closed under disk pressure.
    if free<512*1024*1024:raise ValueError('Insufficient free space for isolated application')
    atomic(run/'storage-preflight.json',json.dumps({'free_bytes':free,'minimum_free_bytes':512*1024*1024}).encode())
    repo=run/'canonical-repository'
    remote_url=command(['git','remote','get-url','origin'],library).decode().strip()
    if not repo.exists():command(['git','clone','--no-hardlinks','--no-checkout',remote_url,str(repo)],run,180)
    command(['git','fetch','origin'],repo)
    revision=command(['git','rev-parse','refs/remotes/origin/main'],repo).decode().strip()
    remote=command(['git','ls-remote','origin','refs/heads/main'],repo).decode().split()[0]
    if revision!=remote:raise ValueError('Fresh origin/main verification mismatch')
    command(['git','worktree','add','--detach',str(work),revision],repo)
    if command(['git','rev-parse','HEAD'],work).decode().strip()!=revision:raise ValueError('Worktree base mismatch')
    atomic(run/'canonical-base.json',(json.dumps({'revision':revision,'remote_main':remote,'worktree':str(work),
        'private_repository':str(repo),'remote_url':remote_url,'published':False})+'\n').encode())
    return work


def verify_bound(bound,base,candidate,reviewer,evaluation):
    if reviewer.get('status')!='approved' or not reviewer.get('pid') or reviewer.get('exit_code')!=0:
        raise ValueError('Independent process review approval required')
    if not reviewer.get('session') or not reviewer.get('stdout_sha256'):raise ValueError('Review process evidence incomplete')
    if bound.get('base_sha256')!=sha(base) or bound.get('candidate_sha256')!=sha(candidate):
        raise ValueError('Exact candidate/base binding mismatch')
    if evaluation.get('status')!='passed' or evaluation.get('exit_code')!=0 or evaluation.get('base_sha256')!=sha(base) or evaluation.get('candidate_sha256')!=sha(candidate):
        raise ValueError('Passing exact regression required')
    if not bound.get('source_excerpt') or sha(bound['source_excerpt'].encode())!=bound.get('source_excerpt_sha256'):
        raise ValueError('Exact reviewed source excerpt required')
    if bound.get('quote') not in bound['source_excerpt']:raise ValueError('Quote outside reviewed source excerpt')


def refresh(tree,record):
    # Use canonical repository's own review-record/manifest check, not a parallel schema.
    script=tree/'scripts/refresh_manifest.py'
    if not script.is_file() or script.is_symlink():raise ValueError('Canonical manifest gate missing')
    command([sys.executable,str(script),'--root',str(tree),'--review',record],tree)


def apply_tree(tree,name,base,candidate,receipt,postcheck=None):
    """Transaction primitive; production caller must verify_bound first."""
    target=target_path(tree,name);receipt.mkdir(parents=True,exist_ok=True)
    mapping=tree/'docs/skill-mapping.json';old_manifest=mapping.read_bytes()
    if json.loads(old_manifest)['outputs'].get(name)!=sha(base):raise ValueError('Published manifest/base mismatch')
    record_name='docs/maintenance-auto-'+sha(candidate)[:20]+'.json';record=tree/record_name
    if record.exists():raise ValueError('Review record collision')
    with (receipt/'apply.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        if (receipt/'journal.json').exists():raise ValueError('Application recovery required')
        if target.read_bytes()!=base:raise ValueError('Canonical base CAS mismatch')
        atomic(receipt/'base.backup',base);atomic(receipt/'manifest.backup',old_manifest)
        journal={'target':name,'base':sha(base),'candidate':sha(candidate),'manifest_base':sha(old_manifest),'review_record':record_name}
        atomic(receipt/'journal.json',json.dumps(journal).encode())
        try:
            record_value={'review':'native-independent-'+sha(candidate)[:20],
                'limitations':'Same-UID independent native process; contract regressions passed; behavioral uplift unproven; local application only, no publication/delivery.',
                'outputs':{name:{'before':sha(base),'after':sha(candidate),'reason':'Exact source-bound independently reviewed missing task procedure'}}}
            if target.read_bytes()!=base:raise ValueError('Concurrent canonical target edit')
            atomic(target,candidate);atomic(record,(json.dumps(record_value,indent=2)+'\n').encode())
            refresh(tree,record_name)
            if postcheck:postcheck(tree)
            if target.read_bytes()!=candidate:raise ValueError('Canonical payload readback mismatch')
            if json.loads(mapping.read_text())['outputs'][name]!=sha(candidate):raise ValueError('Canonical manifest readback mismatch')
        except Exception:
            # Only our detached exclusive tree; never overwrite divergent target bytes.
            if target.read_bytes() not in (base,candidate):raise RuntimeError('Divergent application; journal retained')
            atomic(target,base);atomic(mapping,old_manifest);record.unlink(missing_ok=True)
            if target.read_bytes()!=base or mapping.read_bytes()!=old_manifest:raise RuntimeError('Rollback readback failed')
            (receipt/'journal.json').unlink();raise
        result={'state':'locally-applied-unpublished','target':name,'base_sha256':sha(base),
            'candidate_sha256':sha(candidate),'review_record':record_name,'manifest_sha256':sha(mapping.read_bytes()),
            'worktree':str(tree),'published':False,'consumer_delivered':False,'consumer_loaded':False,'behavior_uplift':'unproven'}
        atomic(receipt/'applied.json',(json.dumps(result,indent=2)+'\n').encode())
        (receipt/'journal.json').unlink();return result


def local_gates(tree):
    logs=[];folder=tree.parent/'canonical-gate-logs';folder.mkdir(mode=0o700,exist_ok=True)
    import shutil
    installed=Path('/Users/gimle/loki-data/live/hermes/volundr-nightly/bin/gitleaks')
    scanner=str(installed) if installed.is_file() and os.access(installed,os.X_OK) else shutil.which('gitleaks')
    if not scanner:raise ValueError('Required gitleaks gate unavailable')
    policy=Path('/Users/gimle/loki-data/live/hermes/volundr-nightly/code/gitleaks.toml')
    if sha(policy.read_bytes())!='20f9f5b3ccfce8e1f5bc8d61ef041f10486095b2a09642c92d1b808a5ec95922':raise ValueError('Trusted secret policy changed')
    python='/Users/gimle/loki-data/live/hermes/tools/python-3.14.7+20260901-darwin-arm64/bin/python3'
    yaml_path=Path('/Users/gimle/loki-data/live/hermes/installs/0cbb8880d4fa970c/environments/d72febf326b84dbc9327d09dafb10046/venv/lib/python3.14/site-packages/yaml')
    yaml_files={p.relative_to(yaml_path).as_posix():sha(p.read_bytes()) for p in yaml_path.rglob('*') if p.is_file() and '__pycache__' not in p.parts}
    yaml_hash=sha(json.dumps(yaml_files,sort_keys=True).encode())
    if yaml_hash!='a0e79a92a8054e2bede18308adeefea1f7aab850b50d378042adfcaee58d55f0':raise ValueError('Pinned PyYAML package changed')
    bootstrap=("import sys;from pathlib import Path;sys.path.insert(0,"+repr(str(yaml_path.parent))+");"
        "import yaml;assert yaml.__version__=='6.0.3';assert Path(yaml.__file__).resolve().is_relative_to(Path("+repr(str(yaml_path))+"));import runpy;")
    dependency={'interpreter':python,'yaml_version':'6.0.3','yaml_path':str(yaml_path),'yaml_tree_sha256':yaml_hash}
    commands=[('validate',[python,'-I','-c',bootstrap+"runpy.run_path('validate.py',run_name='__main__')"]),
        ('unittest',[python,'-I','-c',bootstrap+"sys.argv=['unittest','discover','-s','tests'];runpy.run_module('unittest',run_name='__main__')"]),
        ('gitleaks',[scanner,'--config',str(policy),'--redact=100','--no-banner','--ignore-gitleaks-allow',
        '--max-archive-depth=2','--max-target-megabytes=0','dir',str(tree)])]
    for name,argv in commands:
        gate_env={**os.environ,'PYTHONDONTWRITEBYTECODE':'1'}
        gate_env.pop('PYTHONPATH',None)
        result=subprocess.run(argv,cwd=tree,capture_output=True,timeout=180,env=gate_env)
        output=result.stdout+result.stderr
        # Private log retains diagnostics; credential-shaped literals defensively redacted.
        text=output.decode('utf-8',errors='replace')
        text=re.sub(r'(?i)(?:sbp_|sk-|sb_secret_)[A-Za-z0-9_.-]+','[REDACTED]',text)
        atomic(folder/(name+'.log'),text.encode())
        logs.append({'gate':name,'argv':argv,'exit_code':result.returncode,'stdout_sha256':sha(result.stdout),
            'stderr_sha256':sha(result.stderr),'private_redacted_log':str(folder/(name+'.log')),'dependency':dependency})
    atomic(folder/'receipt.json',(json.dumps(logs,indent=2)+'\n').encode())
    failed=[r['gate'] for r in logs if r['exit_code']]
    if failed:raise ValueError('Canonical gates failed: '+','.join(failed))
    return logs


def cleanup(library,tree,run):
    """Remove only our exact recorded worktree AFTER preserving applied bytes."""
    registered=json.loads((run/'canonical-base.json').read_text())
    if str(tree)!=registered['worktree'] or tree!=run/'canonical-worktree':
        raise ValueError('Refuse unrelated worktree cleanup')
    repo=Path(registered['private_repository'])
    if repo!=run/'canonical-repository':raise ValueError('Wrong private repository')
    command(['git','worktree','remove','--force',str(tree)],repo)
    command(['git','worktree','prune'],repo)

def recover_application(run):
    """Roll back only exact owned paths after interruption before final receipt."""
    progress=run/'canonical-application/progress.json'
    if not progress.exists():return
    info=json.loads(progress.read_text());tree=run/'canonical-worktree'
    if not tree.exists():raise ValueError('Missing interrupted application tree')
    head=command(['git','rev-parse','HEAD'],tree).decode().strip()
    if head!=info['base_revision']:
        parent=command(['git','rev-parse','HEAD^'],tree).decode().strip()
        if parent!=info['base_revision']:raise ValueError('Interrupted commit has unexpected parent')
    allowed=set(info['paths'])
    changed=set(command(['git','status','--porcelain','--untracked-files=all'],tree).decode().splitlines())
    if any(line[3:] not in allowed for line in changed):raise ValueError('Unrelated interrupted tree changes')
    target=target_path(tree,info['target'])
    if sha(target.read_bytes()) not in (info['base_sha256'],info['candidate_sha256']):raise ValueError('Interrupted target diverged')
    command(['git','restore','--source',info['base_revision'],'--staged','--worktree','--',info['target'],'docs/skill-mapping.json'],tree)
    record=tree/info['review_record']
    if record.exists():record.unlink()
    if head!=info['base_revision']:command(['git','update-ref','HEAD',info['base_revision'],head],tree)
    command(['git','reset',info['base_revision'],'--',info['review_record']],tree)
    if sha(target.read_bytes())!=info['base_sha256']:raise ValueError('Recovery payload mismatch')
    (run/'canonical-application/journal.json').unlink(missing_ok=True)
    progress.unlink()

def apply_reviewed(run,vault,library):
    final=run/'canonical-application/final.json'
    bound=json.loads((run/'candidate.json').read_text());reviewer=json.loads((run/'reviewer.json').read_text());evaluation=json.loads((run/'evaluation.json').read_text())
    paths=[run/'candidate.json',run/'base.md',run/'evaluation.json'];hashes=[sha(p.read_bytes()) for p in paths]
    if reviewer.get('input_sha256_before')!=hashes or reviewer.get('input_sha256_after')!=hashes:raise ValueError('Immutable review input binding changed')
    base=bound['base'].encode();candidate=bound['candidate'].encode();verify_bound(bound,base,candidate,reviewer,evaluation)
    source_snapshot={p.name:p.read_bytes() for p in paths+[run/'reviewer.json']}
    immutable=run/'immutable-review'
    if final.exists():
        previous=json.loads(final.read_text());registered=json.loads((run/'canonical-base.json').read_text())
        for name,raw in source_snapshot.items():
            if (immutable/name).read_bytes()!=raw:raise ValueError('Cached review provenance changed')
        repo=run/'canonical-repository';commit=previous['local_commit']
        if previous.get('private_repository')!=str(repo) or previous.get('candidate_sha256')!=sha(candidate) or previous.get('base_sha256')!=sha(base):raise ValueError('Cached application identity mismatch')
        if command(['git','rev-parse',commit+'^'],repo).decode().strip()!=registered['revision']:raise ValueError('Cached commit parent mismatch')
        if command(['git','rev-parse','refs/heads/'+previous['local_branch']],repo).decode().strip()!=commit:raise ValueError('Cached task branch mismatch')
        if set(previous['applied_payload'])!={bound['target'],previous['review_record'],'docs/skill-mapping.json'}:raise ValueError('Cached applied path mismatch')
        for name,digest in previous['applied_payload'].items():
            raw=(run/'canonical-application/payload'/name).read_bytes()
            if sha(raw)!=digest or sha(command(['git','show',commit+':'+name],repo))!=digest:raise ValueError('Cached payload/commit mismatch')
        if sha(command(['git','show',commit+':'+bound['target']],repo))!=sha(candidate):raise ValueError('Cached candidate mismatch')
        if (run/'canonical-worktree').exists():cleanup(library,run/'canonical-worktree',run)
        previous['worktree_removed']=True;atomic(final,(json.dumps(previous,indent=2)+'\n').encode());return previous
    recover_application(run)
    tree=prepare(library,run);registered=json.loads((run/'canonical-base.json').read_text())
    if tree.resolve()==library.resolve():raise ValueError('Wrong application tree')
    import auto_review
    proposal={k:bound[k] for k in ('target','quote','span_start','span_end','candidate')}
    proposal.update(diagnosis='missing-procedure',rationale='independently reviewed source evidence')
    if auto_review.validate(vault,tree,bound['source'],bound['source_sha256'],proposal)!=bound:raise ValueError('Canonical evidence/target drift after review')
    immutable.mkdir(mode=0o700,exist_ok=True)
    for name,raw in source_snapshot.items():
        dest=immutable/name
        if dest.exists():
            if dest.read_bytes()!=raw:raise ValueError('Immutable evidence drift')
        else:
            fd=os.open(dest,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o400)
            with os.fdopen(fd,'wb') as out:out.write(raw);out.flush();os.fsync(out.fileno())
    record_name='docs/maintenance-auto-'+sha(candidate)[:20]+'.json'
    files=(bound['target'],record_name,'docs/skill-mapping.json')
    progress=run/'canonical-application/progress.json'
    atomic(progress,json.dumps({'base_revision':registered['revision'],'base_sha256':sha(base),'candidate_sha256':sha(candidate),
        'target':bound['target'],'review_record':record_name,'paths':files}).encode())
    gate_receipt={}
    def gates(work):gate_receipt['checks']=local_gates(work)
    result=apply_tree(tree,bound['target'],base,candidate,run/'canonical-application',postcheck=gates)
    result['regression_gates']=gate_receipt['checks'];result['immutable_review_sha256']={n:sha(raw) for n,raw in source_snapshot.items()}
    payload=run/'canonical-application/payload';result['applied_payload']={}
    for name in files:
        raw=(tree/name).read_bytes();atomic(payload/name,raw);result['applied_payload'][name]=sha(raw)
    result['base_revision']=registered['revision'];branch='auto-reviewed/'+sha(candidate)[:20]
    command(['git','add','--',*files],tree)
    if set(command(['git','diff','--cached','--name-only'],tree).decode().splitlines())!=set(files):raise ValueError('Unexpected canonical commit path')
    command(['git','commit','-m','fix(skills): apply independently reviewed task correction'],tree)
    commit=command(['git','rev-parse','HEAD'],tree).decode().strip();repo=Path(registered['private_repository'])
    # Branch update is in the private repository only; permit idempotent crash retry.
    existing=subprocess.run(['git','rev-parse','--verify','refs/heads/'+branch],cwd=repo,capture_output=True)
    old=existing.stdout.decode().strip() if existing.returncode==0 else '0'*40
    command(['git','update-ref','refs/heads/'+branch,commit,old],repo)
    result.update(local_commit=commit,local_branch=branch,private_repository=str(repo))
    atomic(final,(json.dumps(result,indent=2)+'\n').encode())
    cleanup(library,tree,run);result['worktree_removed']=True
    atomic(final,(json.dumps(result,indent=2)+'\n').encode());progress.unlink(missing_ok=True)
    return result
