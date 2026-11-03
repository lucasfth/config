#!/usr/bin/env python3
"""Existing Volundr review job: preserve overlap receipt + bounded AAR triage.

Exact approved local skill delivery only; no publication or raw correction writer.
"""
import json
from pathlib import Path
import runpy
import sys

HOME=Path('/Users/gimle/loki-data/live/hermes')
CODE=HOME/'volundr-nightly/code'
sys.path.insert(0,str(CODE))
sys.path.insert(0,str(CODE/'automation'))

if __name__=='__main__':
    # Preserve the existing deterministic overlap wakeAgent contract and agent
    # delivery path. AAR review is a separate bounded no-tools child process.
    import io
    from contextlib import redirect_stdout
    from loki_job import execute
    with redirect_stdout(io.StringIO()) as captured:
        execute(CODE/'settings.json','review')
    previous=json.loads(captured.getvalue().strip())
    from auto_review import cycle
    result=cycle()
    summary={'aar_review_state':result['state'],'reviewed':result['reviewed'],
        'staged':result['staged'],'publication_authorized':False,'live_skills_changed':result.get('live_skills_changed',False),
        'consumer_delivered':result.get('consumer_delivered',False),'consumer_loaded':result.get('consumer_loaded',False),
        'overlap_review_required':previous.get('wakeAgent') is not False}
    if previous.get('wakeAgent') is not False:
        # Evidence JSON without wakeAgent is the original script's wake path;
        # do NOT manufacture wakeAgent:false or suppress the configured prompt.
        if 'prompt' in previous:
            previous['prompt'] += '\nAAR bounded cycle receipt: '+json.dumps(summary)+'. Never apply or publish its proposals.'
    previous['aar_cycle']=summary
    print(json.dumps(previous))
    raise SystemExit(int(result['state'] in ('held','review-unverified','delivery-pending','delivery-blocked')))
