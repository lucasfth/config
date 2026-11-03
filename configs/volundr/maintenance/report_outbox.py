#!/usr/bin/env python3
"""Private durable report outbox. Invalid credentials never become remote success."""
import argparse
from datetime import datetime,timezone
import fcntl
import hashlib
import json
import os
from pathlib import Path
import tempfile
import time
import urllib.request
import urllib.error

DEFAULT_STATE=Path('/Users/gimle/loki-data/live/hermes/state/nightly-report-outbox')
ENV_FILE=Path('/Users/gimle/loki-data/live/hermes/env/supabase.local')


def save(path,value):
    path.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
    fd,tmp=tempfile.mkstemp(dir=path.parent,prefix='.pending-')
    try:
        with os.fdopen(fd,'w') as f:
            json.dump(value,f,sort_keys=True);f.write('\n');f.flush();os.fsync(f.fileno())
        os.replace(tmp,path)
        fd=os.open(path.parent,os.O_RDONLY)
        try:os.fsync(fd)
        finally:os.close(fd)
    finally:Path(tmp).unlink(missing_ok=True)


def credentials(path):
    env={}
    if path.exists():
        for line in path.read_text().splitlines():
            if line.strip() and not line.lstrip().startswith('#') and '=' in line:
                k,v=line.split('=',1);env[k.strip()]=v.strip().strip('\"\'')
    url=env.get('SUPABASE_URL','').rstrip('/')
    key=env.get('SUPABASE_SECRET_KEY','')
    kind=('management-personal-access-token' if key.startswith('sbp_') else
          'secret-data-api-key' if key.startswith('sb_secret_') else
          'legacy-jwt-data-api-key' if key.count('.')==2 else 'missing-or-unknown')
    return url,key,kind


def send(row,url,key):
    request=urllib.request.Request(url+'/rest/v1/admin_reports?on_conflict=night,kind,title',
        data=json.dumps(row).encode(),method='POST',headers={'apikey':key,
        'Authorization':'Bearer '+key,'Content-Type':'application/json',
        'Prefer':'return=representation,resolution=merge-duplicates'})
    with urllib.request.urlopen(request,timeout=20) as response:
        returned=json.loads(response.read(65537))
    if not isinstance(returned,list) or len(returned)!=1:
        raise ValueError('Unconfirmed remote representation')
    actual=returned[0]
    if not actual.get('id') or any(actual.get(k)!=row[k] for k in row):
        raise ValueError('Remote row content mismatch')
    return actual['id']


def run(row=None,*,state=DEFAULT_STATE,env_file=ENV_FILE,sender=send,budget=3,now=None):
    now=time.time() if now is None else now
    # Parent is a caller-selected trusted base (/var aliases /private/var on
    # macOS). Never follow links in the outbox itself or its owned children.
    if state.is_symlink():raise ValueError('Unsafe outbox path')
    state=state.parent.resolve()/state.name
    state.mkdir(parents=True,exist_ok=True,mode=0o700)
    if any(p.is_symlink() for p in state.iterdir()):raise ValueError('Unsafe outbox child')
    with (state/'outbox.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        if row is not None:
            if set(row)!={'night','kind','title','summary','details'}:raise ValueError('Invalid report row')
            identifier=hashlib.sha256(json.dumps(row,sort_keys=True).encode()).hexdigest()
            path=state/(identifier+'.json')
            if not path.exists():save(path,{'schema':1,'row':row,'status':'pending','attempts':0,'next_attempt':0})
        url,key,kind=credentials(env_file)
        sent=0;attempted=0
        for path in sorted(state.glob('*.json')):
            if path.name=='latest.json':continue
            item=json.loads(path.read_text())
            if item['status']=='delivered' or item['next_attempt']>now or attempted>=budget:continue
            attempted+=1;item['attempts']+=1
            try:
                if not url.startswith('https://') or kind not in ('secret-data-api-key','legacy-jwt-data-api-key'):
                    raise ValueError('credential-type-unavailable')
                item['remote_id']=sender(item['row'],url,key);item['status']='delivered';sent+=1
                item.pop('error',None)
            except Exception as error:
                item['status']='degraded';item['error']=('credential-type-unavailable' if kind not in
                    ('secret-data-api-key','legacy-jwt-data-api-key') else
                    'http-'+str(error.code) if isinstance(error,urllib.error.HTTPError) else type(error).__name__)
                item['next_attempt']=now+min(86400,300*2**min(item['attempts']-1,8))
            save(path,item)
        items=[json.loads(p.read_text()) for p in state.glob('*.json') if p.name!='latest.json']
        pending=sum(i['status']!='delivered' for i in items)
        result={'state':'degraded' if pending else 'remote-confirmed','pending':pending,
                'delivered_this_run':sent,'attempted':attempted,'credential_type':kind,
                'at':datetime.now(timezone.utc).isoformat()}
        save(state/'latest.json',result)
        return result


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--retry',action='store_true')
    parser.add_argument('--kind');parser.add_argument('--title');parser.add_argument('--summary',default='')
    parser.add_argument('--lines',default='');parser.add_argument('--details',default='{}');parser.add_argument('--night')
    args=parser.parse_args();row=None
    if not args.retry:
        from zoneinfo import ZoneInfo
        if not args.kind or not args.title:parser.error('--kind and --title required unless --retry')
        details=json.loads(args.details)
        if not isinstance(details,dict):parser.error('--details must be object')
        details.setdefault('lines',[s.strip() for s in args.lines.split('|') if s.strip()][:30])
        row={'night':args.night or datetime.now(ZoneInfo('Europe/Copenhagen')).date().isoformat(),
             'kind':args.kind,'title':args.title[:200],'summary':args.summary[:4000] or None,'details':details}
    result=run(row);print(json.dumps(result));return int(result['state']=='degraded')

if __name__=='__main__':raise SystemExit(main())
