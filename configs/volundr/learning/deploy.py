#!/usr/bin/env python3
"""Scoped Gimle deployment from a locally exported, published config revision.

Run only with explicit deployment approval. Never resets/stashes a checkout,
changes job definitions or touches vault content. Preserve every replaced runtime
file and fail if a selected source target has uncommitted edits. Unrelated dirty
files remain untouched. A whole-checkout update can still be blocked separately.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile


def deploy(staged, revision, root):
    config = root / 'config'
    home = root / '.hermes'
    code = home / 'volundr-nightly/code'
    source = staged / 'configs'
    if len(revision) != 40 or any(c not in '0123456789abcdef' for c in revision):
        raise ValueError('Expected exact published config revision')
    selected = [p for p in (source/'pi').rglob('*') if p.is_file()]
    selected += [p for p in (source/'volundr/learning').rglob('*') if p.is_file()]
    selected += [source/'volundr/aar_learning.py']
    mappings = []
    for path in selected:
        relative = path.relative_to(staged)
        target = config / relative
        # Never overwrite a selected config source carrying another actor's edits.
        tracked = subprocess.run(['git','-C',str(config),'ls-files','--error-unmatch',str(relative)],capture_output=True).returncode == 0
        if target.exists():
            if target.is_symlink():
                raise ValueError('Selected source is a symlink: '+str(relative))
            if tracked:
                old = subprocess.check_output(['git','-C',str(config),'show','HEAD:'+str(relative)])
                if target.read_bytes() not in (old, path.read_bytes()):
                    raise ValueError('Selected source has pending edits: '+str(relative))
            elif target.read_bytes() != path.read_bytes():
                raise ValueError('Untracked source collision: '+str(relative))
        mappings.append((path,target))
        if relative.parts[:3] == ('configs','volundr','learning'):
            mappings.append((path,code/'learning'/path.relative_to(source/'volundr/learning')))
    mappings.append((source/'volundr/aar_learning.py',code/'aar_learning.py'))
    mappings.append((source/'volundr/learning/cron_entry.py',home/'scripts/aar_distill_nightly.py'))
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    backup = home/'volundr-nightly/deployments'/(stamp+'-'+revision[:12])
    backup.mkdir(parents=True,mode=0o700)
    receipt = {'schema':1,'config_revision':revision,'backup':str(backup),'files':[]}
    # Backup before mutation; exact copied bytes and hashes remain in private state.
    for index,(payload,target) in enumerate(mappings):
        before = None
        if target.exists():
            if target.is_symlink() or not target.is_file():
                raise ValueError('Unsafe runtime target: '+str(target))
            old=target.read_bytes();before=hashlib.sha256(old).hexdigest()
            (backup/f'{index}.before').write_bytes(old)
        receipt['files'].append({'target':str(target),'before':before,
            'after':hashlib.sha256(payload.read_bytes()).hexdigest(),'backup_index':index})
    (backup/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
    for payload,target in mappings:
        target.parent.mkdir(parents=True,exist_ok=True)
        with tempfile.NamedTemporaryFile(dir=target.parent,delete=False) as handle:
            handle.write(payload.read_bytes());temporary=Path(handle.name)
        temporary.chmod(0o644)
        temporary.replace(target)
    for item in receipt['files']:
        if hashlib.sha256(Path(item['target']).read_bytes()).hexdigest()!=item['after']:
            raise ValueError('Installed payload readback differs')
    print(json.dumps({'status':'installed','revision':revision,'files':len(mappings),'receipt':str(backup/'receipt.json')}))


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--staged',type=Path,required=True)
    parser.add_argument('--revision',required=True)
    args=parser.parse_args()
    deploy(args.staged,args.revision,Path.home())
