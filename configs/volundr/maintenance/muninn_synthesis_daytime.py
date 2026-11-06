"""Existing daytime route: dependency inventory plus eligible semantic continuation.

No retired Dreaming, schedule mutation or increased model allowance.
"""
import json
from pathlib import Path
import sys

HOME=Path('/Users/gimle/loki-data/live/hermes')
sys.path.insert(0,str(HOME/'volundr-nightly/code/automation'))
sys.path.insert(0,str(HOME/'mcp-vault-server'))
import semantic_synthesis

def installed_hash_consumer(*args, **kwargs):
    # Resolve the installed dependency lazily; fixture-only semantic checks do
    # not import or contact the production vault/indexer.
    import synthesis_consumer
    inventory = synthesis_consumer.consume(*args, **kwargs)
    return inventory, synthesis_consumer.alert_text(inventory)


def execute(*,api=semantic_synthesis.mcp,state=semantic_synthesis.STATE,
            budget_state=semantic_synthesis.auto.STATE,names=None,hash_consume=installed_hash_consumer):
    receipt={'hash_review':{'status':'unavailable'},'semantic':{'state':'unavailable'}}
    try:
        inventory, alert_text=hash_consume(HOME/'mcp-vault-server/temporal.db',Path('/Users/gimle/loki-data/loki-memory'),
            HOME/'state/muninn-synthesis/review-consumption',max_items=20)
        receipt['hash_review']={'status':inventory['status'],'semantic_review_performed':False,
            'alert_text':alert_text}
    except Exception as error:receipt['hash_review']['error_type']=type(error).__name__
    try:
        # Only deterministic intake until an endpoint/data-class approval exists.
        # No public packet can reach proposer/reviewer/application through this gate.
        try:semantic_synthesis.provider_preflight()
        except semantic_synthesis.ProviderBlocked:
            receipt['semantic']=semantic_synthesis.stage_public_intake(api,state)
        else:receipt['semantic']=semantic_synthesis.cycle(api=api,state=state,budget_state=budget_state,names=names)
    except Exception as error:receipt['semantic']={'state':'unavailable','error_type':type(error).__name__}
    return receipt


def main():
    result=execute()
    # Preserve the existing alerts-only scheduler contract.
    alerts=[];hash_text=result['hash_review'].get('alert_text','Muninn dependency checker unavailable.')
    if hash_text!='[SILENT]':alerts.append(hash_text)
    semantic=result['semantic'];status=semantic['state']
    state=semantic_synthesis.STATE;state.mkdir(parents=True,exist_ok=True)
    path=state/'scheduled-alert.json'
    previous=json.loads(path.read_text()) if path.exists() else {}
    fingerprint={k:semantic.get(k) for k in ('state','filename','sha256','error_type')}
    if status not in ('idle','budget-exhausted') and fingerprint!=previous:
        alerts.append('Muninn eligible task synthesis: '+status+'. Exact receipt: state/muninn-synthesis/semantic/latest.json.')
    semantic_synthesis.save(path,fingerprint)
    print('\n'.join(alerts) if alerts else '[SILENT]')
    return int(result['semantic']['state'] in ('held','unavailable'))

if __name__=='__main__':raise SystemExit(main())