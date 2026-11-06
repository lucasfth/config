"""Isolated fixtures, not live lesson/application evidence."""
import hashlib
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import semantic_synthesis as sem


def note(kind,body):
    return ('---\ntitle: Boundary arithmetic\ntype: '+kind+'\ntags: [arithmetic, task-guidance]\n'
        'status: active\nupdated: 2026-11-04\ndata_class: public\nsynthesis_scope: ordinary-task\n---\n'
        '# Boundary arithmetic\n\n'+body+'\n')


class FakeMCP:
    def __init__(self):
        self.summary='tech/task-guidance/countdown.md';self.source='tech/task-guidance/countdown-reference.md'
        self.notes={self.summary:note('task-synthesis','Compare the countdown.'),
                    self.source:note('task-reference','Check positive, zero and negative countdown values separately.')}
        self.notes.update({p:'Canonical rule body.\n' for p in sem.RULES})
        self.calls=[];self.archives={};self.registration=None
    def read(self,name):
        content=self.notes[name];return {'filename':name,'content':content,'sha256':sem.sha(content.encode())}
    def __call__(self,name,args):
        self.calls.append((name,args.copy()))
        if name=='vault_read':return self.read(args['filename'])
        if name=='vault_synthesis_status':
            value={'filename':self.summary,'status':'current' if self.registration else 'stale',
                   'sources':[{'filename':self.source,'sha256':'0'*64}]}
            if self.registration:value.update(self.registration)
            return value
        if name=='vault_write':
            assert args['expected_revision']==self.read(args['filename'])['sha256']
            if args.get('dry_run'):return {'valid':True,'current_revision':args['expected_revision'],'capture_warnings':[]}
            old=self.read(args['filename']);self.archives['archive-fixture']=old
            self.notes[args['filename']]=args['content']
            return {'sha256':sem.sha(args['content'].encode()),'archive':{'archive_id':'archive-fixture','sha256':old['sha256']},'capture_warnings':[]}
        if name=='vault_archive_read':return self.archives[args['archive_id']]
        if name=='vault_synthesis_register':
            assert args['summary_sha256']==self.read(self.summary)['sha256']
            assert args['sources']==[{'filename':self.source,'sha256':self.read(self.source)['sha256']}]
            self.registration={'summary_sha256':args['summary_sha256'],'sources':args['sources'],'status':'current'}
            return {'registration_id':'synthesis-fixture',**self.registration}
        raise AssertionError(name)


class SemanticTests(unittest.TestCase):
    def setUp(self):
        # Fixture-only provider approval. Production preflight remains fail-closed.
        self.provider=patch.object(sem,'provider_preflight',return_value=None)
        self.provider.start();self.addCleanup(self.provider.stop)

    def test_automatic_proposal_review_write_readback_then_registration(self):
        with tempfile.TemporaryDirectory() as d:
            api=FakeMCP();state=Path(d)/'semantic';budget=Path(d)/'budget'
            choice={'decision':'append','addition':'Check positive, zero and negative countdown values separately.',
                    'source':api.source,'quote':'Check positive, zero and negative countdown values separately.'}
            with patch.object(sem,'propose',return_value=choice), patch.object(sem.review_runner,'launch',return_value=SimpleNamespace(pid=412,returncode=0,stdout='MUNINN_REVIEW_VERDICT=APPROVE\n',stderr='')):
                result=sem.cycle(api=api,state=state,budget_state=budget,names=[api.summary])
            self.assertEqual(result['state'],'applied')
            self.assertTrue(result['consumer_readback']);self.assertTrue(result['registered'])
            operations=[n for n,a in api.calls];self.assertLess(operations.index('vault_write'),operations.index('vault_synthesis_register'))
            with patch.object(sem,'propose',side_effect=AssertionError('no proposer replay')),patch.object(sem.review_runner,'launch',side_effect=AssertionError('no review replay')):
                self.assertEqual(sem.cycle(api=api,state=state,budget_state=budget,names=[api.summary])['state'],'idle')

    def test_lost_write_receipt_recovers_archive_without_models_or_second_write(self):
        with tempfile.TemporaryDirectory() as d:
            api=FakeMCP();state=Path(d)/'semantic';budget=Path(d)/'budget'
            choice={'decision':'append','addition':'Check positive, zero and negative countdown values separately.',
                    'source':api.source,'quote':'Check positive, zero and negative countdown values separately.'}
            original=sem.save
            def crash(path,value):
                if path.name=='write-receipt.json':raise KeyboardInterrupt('lost response receipt')
                return original(path,value)
            with patch.object(sem,'propose',return_value=choice),patch.object(sem,'save',side_effect=crash), \
                 patch.object(sem.review_runner,'launch',return_value=SimpleNamespace(pid=413,returncode=0,stdout='MUNINN_REVIEW_VERDICT=APPROVE\n',stderr='')):
                with self.assertRaises(KeyboardInterrupt):sem.cycle(api=api,state=state,budget_state=budget,names=[api.summary])
            self.assertIsNone(api.registration)
            with patch.object(sem,'propose',side_effect=AssertionError('no proposer replay')), \
                 patch.object(sem.review_runner,'launch',side_effect=AssertionError('no review replay')), \
                 patch.object(sem,'archive_for',return_value='archive-fixture'):
                result=sem.cycle(api=api,state=state,budget_state=budget,names=[api.summary])
            self.assertEqual(result['state'],'applied')
            self.assertEqual(sum(n=='vault_write' and not a.get('dry_run') for n,a in api.calls),1)

    def test_budget_pauses_preserve_proposal_and_share_aar_allowance(self):
        from datetime import datetime
        from zoneinfo import ZoneInfo
        with tempfile.TemporaryDirectory() as d:
            api=FakeMCP();state=Path(d)/'semantic';budget=Path(d)/'budget';budget.mkdir()
            today=str(datetime.now(ZoneInfo('Europe/Copenhagen')).date())
            sem.save(budget/'model-budget.json',{'date':today,'used':3,'limit':3})
            with patch.object(sem.review_runner,'launch') as launch:
                self.assertEqual(sem.cycle(api=api,state=state,budget_state=budget,names=[api.summary])['state'],'budget-exhausted')
            launch.assert_not_called();run=next((state/'runs').iterdir())
            self.assertFalse((run/'proposer-started.json').exists())
            self.assertEqual(json.loads((run/'receipt.json').read_text())['failures'],0)
            self.assertEqual(json.loads((budget/'model-budget.json').read_text())['used'],3)

    def test_nochange_is_independently_reviewed_and_registered_without_write(self):
        with tempfile.TemporaryDirectory() as d:
            api=FakeMCP();state=Path(d)/'semantic';budget=Path(d)/'budget'
            with patch.object(sem,'propose',return_value={'decision':'no-change','reason':'already covered'}), \
                 patch.object(sem.review_runner,'launch',return_value=SimpleNamespace(pid=414,returncode=0,stdout='MUNINN_REVIEW_VERDICT=APPROVE\n',stderr='')) as launch:
                result=sem.cycle(api=api,state=state,budget_state=budget,names=[api.summary])
            self.assertEqual(result['state'],'independently-reviewed-no-change');self.assertEqual(launch.call_count,1)
            self.assertFalse(any(n=='vault_write' for n,a in api.calls));self.assertTrue(result['registered'])

    def test_denied_unverified_protected_and_drift_cannot_write(self):
        for verdict in ('DENY','INVALID'):
            with self.subTest(verdict=verdict), tempfile.TemporaryDirectory() as d:
                api=FakeMCP()
                with patch.object(sem,'propose',return_value={'decision':'no-change','reason':'already covered'}), \
                     patch.object(sem.review_runner,'launch',return_value=SimpleNamespace(pid=415,returncode=0,stdout='MUNINN_REVIEW_VERDICT='+verdict+'\n',stderr='')):
                    result=sem.cycle(api=api,state=Path(d)/'semantic',budget_state=Path(d)/'budget',names=[api.summary])
                self.assertEqual(result['state'],'rejected' if verdict=='DENY' else 'held')
                self.assertFalse(any(n in ('vault_write','vault_synthesis_register') for n,a in api.calls))
        for mutation in ('private','company','policy'):
            with self.subTest(mutation=mutation),tempfile.TemporaryDirectory() as d:
                api=FakeMCP()
                api.notes[api.source]=api.notes[api.source].replace('data_class: public','data_class: private') if mutation=='private' else api.notes[api.source]+mutation+' access credentials\n'
                with patch.object(sem,'propose') as proposer,patch.object(sem.review_runner,'launch') as launch:
                    result=sem.cycle(api=api,state=Path(d)/'semantic',budget_state=Path(d)/'budget',names=[api.summary,'personal-notes/private.md'])
                proposer.assert_not_called();launch.assert_not_called();self.assertEqual(result['state'],'idle')

    def test_source_and_base_cas_drift_hold_after_review_before_write(self):
        for target in ('source','summary'):
            with self.subTest(target=target),tempfile.TemporaryDirectory() as d:
                api=FakeMCP();name=getattr(api,target)
                def launch(*a,**kw):
                    api.notes[name]+='Changed after model launch.\n'
                    return SimpleNamespace(pid=416,returncode=0,stdout='MUNINN_REVIEW_VERDICT=APPROVE\n',stderr='')
                with patch.object(sem,'propose',return_value={'decision':'no-change','reason':'already covered'}),patch.object(sem.review_runner,'launch',side_effect=launch):
                    result=sem.cycle(api=api,state=Path(d)/'semantic',budget_state=Path(d)/'budget',names=[api.summary])
                self.assertEqual(result['state'],'held');self.assertFalse(any(n=='vault_write' for n,a in api.calls))

    def test_two_concurrent_routes_cannot_overreserve(self):
        from concurrent.futures import ThreadPoolExecutor
        from datetime import datetime
        from zoneinfo import ZoneInfo
        with tempfile.TemporaryDirectory() as d:
            budget=Path(d);sem.save(budget/'model-budget.json',{'date':str(datetime.now(ZoneInfo('Europe/Copenhagen')).date()),'used':2,'limit':3})
            def reserve(aar):
                try:
                    if aar:sem.auto.reserve_model(budget/'runs/fixture/sessions')
                    else:sem.auto.reserve_budget(budget)
                    return True
                except (sem.auto.BudgetExhausted,BlockingIOError):return False
            with ThreadPoolExecutor(2) as executor:results=list(executor.map(reserve,(True,False)))
            self.assertEqual(sum(results),1);self.assertEqual(json.loads((budget/'model-budget.json').read_text())['used'],3)

    def test_real_proposer_phase_is_budgeted_durable_then_reviewed_after_renewal(self):
        with tempfile.TemporaryDirectory() as d:
            api=FakeMCP();state=Path(d)/'semantic';budget=Path(d)/'budget'
            choice={'decision':'no-change','reason':'already covered'}
            def launch(argv,**kw):
                text=json.dumps(choice) if argv[3]=='muninn-task-proposer' else 'MUNINN_REVIEW_VERDICT=APPROVE\n'
                return SimpleNamespace(pid=417,returncode=0,stdout=text,stderr='')
            with patch.object(sem.review_runner,'launch',side_effect=launch) as model:
                result=sem.cycle(api=api,state=state,budget_state=budget,names=[api.summary])
            self.assertEqual(result['state'],'independently-reviewed-no-change');self.assertEqual(model.call_count,2)
            self.assertEqual(json.loads((budget/'model-budget.json').read_text())['used'],2)

    def test_crashed_proposer_and_reviewer_hold_without_relaunch(self):
        for phase in ('proposer','reviewer'):
            with self.subTest(phase=phase),tempfile.TemporaryDirectory() as d:
                api=FakeMCP();state=Path(d)/'semantic';budget=Path(d)/'budget'
                def launch(argv,**kw):
                    if phase=='reviewer' and argv[3]=='muninn-task-proposer':return SimpleNamespace(pid=418,returncode=0,stdout=json.dumps({'decision':'no-change','reason':'covered'}),stderr='')
                    raise KeyboardInterrupt('crash before response persisted')
                with patch.object(sem.review_runner,'launch',side_effect=launch):
                    with self.assertRaises(KeyboardInterrupt):sem.cycle(api=api,state=state,budget_state=budget,names=[api.summary])
                with patch.object(sem.review_runner,'launch') as model,patch.object(sem.auto,'reserve_budget') as reserve:
                    result=sem.cycle(api=api,state=state,budget_state=budget,names=[api.summary])
                model.assert_not_called();reserve.assert_not_called();self.assertEqual(result['state'],'held')

    def test_registration_retry_uses_exact_approved_inputs_and_no_second_write(self):
        with tempfile.TemporaryDirectory() as d:
            api=FakeMCP();state=Path(d)/'semantic';budget=Path(d)/'budget'
            count=0
            def flaky(name,args):
                nonlocal count
                if name=='vault_synthesis_register' and count==0:count+=1;raise OSError('unavailable')
                return api(name,args)
            choice={'decision':'append','addition':'Check positive, zero and negative countdown values separately.',
                    'source':api.source,'quote':'Check positive, zero and negative countdown values separately.'}
            with patch.object(sem,'propose',return_value=choice),patch.object(sem.review_runner,'launch',return_value=SimpleNamespace(pid=419,returncode=0,stdout='MUNINN_REVIEW_VERDICT=APPROVE\n',stderr='')):
                self.assertEqual(sem.cycle(api=flaky,state=state,budget_state=budget,names=[api.summary])['state'],'held')
            with patch.object(sem,'propose') as proposer,patch.object(sem.review_runner,'launch') as model:
                result=sem.cycle(api=flaky,state=state,budget_state=budget,names=[api.summary])
            proposer.assert_not_called();model.assert_not_called();self.assertEqual(result['state'],'applied')
            self.assertEqual(sum(n=='vault_write' and not a.get('dry_run') for n,a in api.calls),1)

    def test_current_registration_noop_has_no_model_and_no_run(self):
        with tempfile.TemporaryDirectory() as d:
            api=FakeMCP();api.registration={'summary_sha256':api.read(api.summary)['sha256'],
                'sources':[{'filename':api.source,'sha256':api.read(api.source)['sha256']}],'status':'current'}
            state=Path(d)/'semantic'
            with patch.object(sem,'propose') as proposer,patch.object(sem.review_runner,'launch') as model:
                result=sem.cycle(api=api,state=state,budget_state=Path(d)/'budget',names=[api.summary])
            proposer.assert_not_called();model.assert_not_called();self.assertEqual(result['state'],'idle')
            self.assertEqual(list((state/'runs').iterdir()),[])

    def test_tampered_review_packet_blocks_registration_retry(self):
        with tempfile.TemporaryDirectory() as d:
            api=FakeMCP();state=Path(d)/'semantic';budget=Path(d)/'budget'
            def unavailable(name,args):
                if name=='vault_synthesis_register':raise OSError('unavailable')
                return api(name,args)
            with patch.object(sem,'propose',return_value={'decision':'no-change','reason':'covered'}),patch.object(sem.review_runner,'launch',return_value=SimpleNamespace(pid=420,returncode=0,stdout='MUNINN_REVIEW_VERDICT=APPROVE\n',stderr='')):
                self.assertEqual(sem.cycle(api=unavailable,state=state,budget_state=budget,names=[api.summary])['state'],'held')
            run=next((state/'runs').iterdir());(run/'review/candidate.json').write_text('{}\n')
            with patch.object(sem.review_runner,'launch') as model:
                result=sem.cycle(api=api,state=state,budget_state=budget,names=[api.summary])
            model.assert_not_called();self.assertEqual(result['state'],'held');self.assertIsNone(api.registration)

    def test_aar_extraction_provider_uses_same_daily_budget(self):
        from datetime import datetime
        from zoneinfo import ZoneInfo
        import sys
        sys.path.insert(0,str(Path(__file__).parents[1]))
        from learning import extract
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);script=root/'dream.py'
            script.write_text('def _deepseek_api_call(*args, **kwargs):\n    raise AssertionError("no paid call")\n')
            budget=root/'budget';budget.mkdir()
            sem.save(budget/'model-budget.json',{'date':str(datetime.now(ZoneInfo('Europe/Copenhagen')).date()),'used':3,'limit':3})
            with self.assertRaises(sem.auto.BudgetExhausted):extract.dream_model(script,budget_state=budget)('fixture')

    def test_exhausted_extraction_is_pause_not_error_or_semantic_attempt(self):
        import sys
        sys.path.insert(0,str(Path(__file__).parents[1]))
        from learning import extract,chunked
        for large in (False,True):
            with self.subTest(large=large),tempfile.TemporaryDirectory() as d:
                root=Path(d);vault=root/'vault';state=root/'state'
                source=vault/'projects/example/repo/main/2026-10-31.md';source.parent.mkdir(parents=True)
                source.write_text('# AAR\n\n## Corrections\nA countdown boundary was not checked.\n'+('ordinary evidence\n'*1800 if large else ''))
                before=source.read_bytes()
                def paused(prompt):raise extract.BudgetExhausted('pause before provider')
                result=chunked.drain(vault,state,paused) if large else extract.distil(vault,state,paused)
                self.assertTrue(result.get('budget_paused'));self.assertEqual(result['errors'],[])
                self.assertEqual(source.read_bytes(),before);self.assertEqual(extract.load_state(state)['records'],{})
                if large:
                    manifest=json.loads(next((state/'chunked').glob('*/manifest.json')).read_text())
                    self.assertTrue(all(c['attempts']==0 for c in manifest['chunks']))

    def test_exhausted_apply_failures_are_bounded_without_model_replays(self):
        with tempfile.TemporaryDirectory() as d:
            api=FakeMCP();state=Path(d)/'semantic';budget=Path(d)/'budget'
            def failed(name,args):
                if name=='vault_synthesis_register':raise OSError('unavailable')
                return api(name,args)
            with patch.object(sem,'propose',return_value={'decision':'no-change','reason':'covered'}),patch.object(sem.review_runner,'launch',return_value=SimpleNamespace(pid=421,returncode=0,stdout='MUNINN_REVIEW_VERDICT=APPROVE\n',stderr='')):
                self.assertEqual(sem.cycle(api=failed,state=state,budget_state=budget,names=[api.summary])['state'],'held')
            with patch.object(sem,'propose') as proposer,patch.object(sem.review_runner,'launch') as model:
                self.assertEqual(sem.cycle(api=failed,state=state,budget_state=budget,names=[api.summary])['state'],'held')
                capped=sem.cycle(api=failed,state=state,budget_state=budget,names=[api.summary])
                self.assertEqual(capped['state'],'failure-cap-reached');self.assertEqual(capped['failures'],3)
                self.assertTrue(capped['cap_reached'])
                self.assertEqual(sem.cycle(api=failed,state=state,budget_state=budget,names=[api.summary])['state'],'failure-cap-reached')
            proposer.assert_not_called();model.assert_not_called()
            # A new exact source revision is independent work; the capped run cannot starve it.
            api.notes[api.source]+='More ordinary boundary evidence.\n'
            with patch.object(sem,'propose',return_value={'decision':'no-change','reason':'covered'}),patch.object(sem.review_runner,'launch',return_value=SimpleNamespace(pid=422,returncode=0,stdout='MUNINN_REVIEW_VERDICT=APPROVE\n',stderr='')):
                self.assertEqual(sem.cycle(api=api,state=state,budget_state=budget,names=[api.summary])['state'],'independently-reviewed-no-change')

    def test_real_public_archive_discovery_stages_durable_intake_without_metadata_queue(self):
        import public_intake
        with tempfile.TemporaryDirectory() as d:
            api=FakeMCP();source='archives/2026-06-10-commit-mono-neutral-programming-typeface.md'
            api.notes[source]='---\ntitle: Commit Mono\ntype: reference\ntags: []\n---\n#archived #web #reference #font\n**URL:** [https://commitmono.com/](https://commitmono.com/)\n## Summary\nA monospace editor font.\n### Recommended Settings\nWeight 400 for dark mode, 450 for light mode.\n## Source\n\nFull content scraped from https://commitmono.com/'
            api.notes.update({'tech/learning/_INDEX.md':'Fixture index.\n','tech/_INDEX.md':'[[tech/learning/_INDEX]]\n','_INDEX.md':'[[tech/_INDEX]]\n'})
            def fixture(name,args):
                if name=='vault_list':return {'files':[source,'personal-notes/private.md']}
                if name=='vault_read' and args['filename']==public_intake.target(source):return {'error':'File not found'}
                return api(name,args)
            state=Path(d)/'semantic'
            with patch.object(sem.auto,'reserve_budget',side_effect=sem.auto.BudgetExhausted('pause')),patch.object(sem.review_runner,'launch') as model:
                result=sem.stage_public_intake(fixture,state)
            model.assert_not_called();self.assertEqual(result['state'],'provider-blocked')
            run=next((state/'intake').iterdir());packet=json.loads((run/'packet.json').read_text())
            self.assertEqual(packet['sources'][0]['filename'],source)
            self.assertEqual(packet['admission']['kind'],'verified-public-origin')
            self.assertFalse(any(n in ('vault_write','vault_file_note') for n,a in api.calls))

    def test_provider_boundary_blocks_before_model_or_budget(self):
        self.provider.stop()
        with tempfile.TemporaryDirectory() as d:
            api=FakeMCP();bound,_=sem.packet(api,api.summary,{n:api.read(n)['sha256'] for n in sem.RULES})
            with patch.object(sem.auto,'model_json') as proposer,patch.object(sem.review_runner,'launch') as reviewer,patch.object(sem.auto,'reserve_budget') as reserve:
                with self.assertRaises(sem.ProviderBlocked):sem.propose(bound,Path(d)/'sessions',Path(d)/'budget')
                with self.assertRaises(sem.ProviderBlocked):sem.review(bound,{},'',Path(d),Path(d)/'budget')
            proposer.assert_not_called();reviewer.assert_not_called();reserve.assert_not_called()

    def test_transport_missing_note_is_narrow_and_auth_failure_propagates(self):
        import io,sys,urllib.error
        sys.path.insert(0,str(sem.HOME/'scripts'))
        import nightly_hygiene
        def response(error):
            return io.BytesIO(json.dumps({'result':{'isError':True,'content':[{'type':'text','text':json.dumps({'error':error})}]}}).encode())
        with patch.dict(nightly_hygiene.os.environ,{'MUNINN_MCP_TOKEN':'fixture'}):
            with patch.object(nightly_hygiene.urllib.request,'urlopen',return_value=response('File not found: tech/fixture.md')):
                self.assertEqual(nightly_hygiene.mcp('vault_read',{'filename':'tech/fixture.md'},allow_missing=True),{'error':'File not found'})
            with patch.object(nightly_hygiene.urllib.request,'urlopen',side_effect=urllib.error.HTTPError('fixture',401,'unauthorized',{},None)):
                with self.assertRaises(urllib.error.HTTPError):nightly_hygiene.mcp('vault_read',{'filename':'tech/fixture.md'},allow_missing=True)

    def test_actual_wrapper_cannot_reach_cycle_when_provider_blocked(self):
        import importlib.util
        path=Path(__file__).parents[1]/'muninn_synthesis_daytime.py'
        if not path.exists():path=Path('/Users/gimle/config/configs/volundr/maintenance/muninn_synthesis_daytime.py')
        spec=importlib.util.spec_from_file_location('daytime_fixture',path);wrapper=importlib.util.module_from_spec(spec);spec.loader.exec_module(wrapper)
        with tempfile.TemporaryDirectory() as d,patch.object(sem,'provider_preflight',side_effect=sem.ProviderBlocked('fixture')), \
             patch.object(sem,'stage_public_intake',return_value={'state':'provider-blocked','model_calls':0}) as intake,patch.object(sem,'cycle') as cycle:
            result=wrapper.execute(api=FakeMCP(),state=Path(d),budget_state=Path(d)/'budget',hash_consume=lambda *a,**k:{'status':'quiet','alerts':[]})
        cycle.assert_not_called();intake.assert_called_once();self.assertEqual(result['semantic']['state'],'provider-blocked')

if __name__=='__main__':unittest.main()