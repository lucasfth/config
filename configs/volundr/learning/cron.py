"""Private extraction receipts and count-only cron output; opt-in activation.

Does not install schedules or run ordinary Dreaming. Unlike the historical wrapper,
actual partial failures remain nonzero and output never contains private paths,
model text, error messages or candidate IDs.
"""
from datetime import datetime, timezone
import json
from pathlib import Path
from uuid import uuid4
from . import extract


def run(config_path):
    try:
        config = json.loads(config_path.read_text())
        if config.get('enabled') is not True:
            print(json.dumps({'state':'disabled'}))
            return 0
        state = Path(config['state'])
        if not state.is_absolute():
            raise ValueError('External absolute state required')
        if config.get('vault') and state.resolve().is_relative_to(Path(config['vault']).resolve()):
            raise ValueError('State must be outside vault')
        started = datetime.now(timezone.utc).isoformat()
        try:
            result = extract.nightly(config_path)
            boundary = (result.get('guidance_applied') is not False or
                        result.get('skills_changed') is not False or
                        'archive_result' in result or 'archive_plan' in result)
            status = ('boundary-violation' if boundary else 'partial-failure' if result.get('errors')
                      else 'manual-review-required' if result.get('deferred') else 'complete')
            summary = {'state':status,'processed':len(result.get('processed',[])),
                'skipped':len(result.get('skipped',[])), 'errors':len(result.get('errors',[])),
                'deferred':len(result.get('deferred',[])),
                'guidance_applied':False,'skills_changed':False}
            receipt = {'schema':1,'started':started,'finished':datetime.now(timezone.utc).isoformat(),
                       'status':status,'result':result}
        except Exception as error:
            summary = {'state':'failed','error_type':type(error).__name__}
            receipt = {'schema':1,'started':started,'finished':datetime.now(timezone.utc).isoformat(),
                       'status':'failed','error_type':type(error).__name__}
        name = 'runs/' + uuid4().hex + '.json'
        extract.save(extract.safe(state,name),json.dumps(receipt,indent=2)+'\n')
        extract.save(extract.safe(state,'last-run.json'),json.dumps({'receipt':name,'summary':summary})+'\n')
        print(json.dumps(summary))
        return 0 if summary['state'] in ('complete', 'manual-review-required') else 1
    except Exception as error:
        print(json.dumps({'state':'failed','error_type':type(error).__name__}))
        return 1
