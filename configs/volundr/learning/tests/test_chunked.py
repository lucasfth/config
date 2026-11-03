"""Lossless resumable oversized extraction; no source/vault mutation."""
import json
from pathlib import Path
import tempfile
import unittest
from learning import extract
from learning import chunked


class ChunkTests(unittest.TestCase):
    def test_full_coverage_retry_resume_and_revision_identity(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); vault = root/'vault'; state = root/'state'
            path = vault/'projects/example/repo/main/2026-10-28.md'
            path.parent.mkdir(parents=True)
            body = '# AAR\n' + 'Æ observed evidence.\n'*4000 + 'TAIL-EVIDENCE\n'
            path.write_text(body)
            calls = []
            def model(prompt):
                calls.append(prompt)
                return {'lessons': [], 'open_items': []}
            first = chunked.drain(vault, state, model, budget=1)
            self.assertEqual(first['calls'], 1)
            self.assertEqual(first['pending'], 1)
            self.assertEqual(extract.load_state(state)['records'], {})
            second = chunked.drain(vault, state, model, budget=20)
            self.assertEqual(second['pending'], 0)
            self.assertEqual(len(second['processed']), 1)
            ledger = extract.load_state(state)
            record = next(iter(ledger['records'].values()))
            manifest = json.loads((state/record['extraction']['manifest']).read_text())
            self.assertEqual(''.join(x['text'] for x in manifest['chunks']), body)
            self.assertEqual(record['source']['sha256'], extract.sha(path.read_bytes()))
            self.assertIn('TAIL-EVIDENCE', calls[-1])
            self.assertEqual(chunked.drain(vault,state,lambda _:self.fail('duplicate'),budget=20)['calls'],0)
            path.write_text(body+'changed\n')
            self.assertEqual(chunked.drain(vault,state,model,budget=20)['pending'],0)
            self.assertEqual(len(extract.load_state(state)['records']),2)
            self.assertEqual(len(list((state/'chunked').glob('*/manifest.json'))),2)

    def test_malformed_retry_is_bounded_and_observable(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);vault=root/'vault';state=root/'state'
            p=vault/'projects/example/repo/main/2026-10-28.md';p.parent.mkdir(parents=True)
            p.write_text('# AAR\n'+'x'*25000)
            result=chunked.drain(vault,state,lambda _:'{bad',budget=2)
            self.assertEqual(result['calls'],2)
            self.assertEqual(result['pending'],1)
            self.assertEqual(result['processed'],[])
            self.assertTrue(result['errors'])
            manifest=json.loads(next((state/'chunked').glob('*/manifest.json')).read_text())
            self.assertEqual(manifest['chunks'][0]['attempts'],2)
            self.assertEqual(manifest['chunks'][0]['status'],'failed')
            self.assertNotIn('result',manifest['chunks'][0])
            last=chunked.drain(vault,state,lambda _:'{bad',budget=8)
            self.assertEqual(last['calls'],1)
            manifest=json.loads(next((state/'chunked').glob('*/manifest.json')).read_text())
            self.assertEqual(manifest['status'],'review-required')
            self.assertEqual(chunked.drain(vault,state,lambda _:self.fail('exhausted retry'),budget=8)['calls'],0)

    def test_source_mutation_during_model_cannot_finalize(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);vault=root/'vault';state=root/'state'
            p=vault/'projects/example/repo/main/2026-10-28.md';p.parent.mkdir(parents=True)
            p.write_text('# AAR\n'+'x'*25000)
            def model(_):
                p.write_text('# AAR\nchanged')
                return {'lessons':[],'open_items':[]}
            result=chunked.drain(vault,state,model,budget=8)
            self.assertTrue(result['errors'])
            self.assertEqual(result['processed'],[])
            self.assertEqual(extract.load_state(state)['records'],{})

    def test_merged_overflow_preserves_all_results_without_invalid_candidate(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);vault=root/'vault';state=root/'state'
            p=vault/'projects/example/repo/main/2026-10-28.md';p.parent.mkdir(parents=True)
            p.write_text('# AAR\n'+'x'*25000)
            counter=[]
            def model(_):
                counter.append(1)
                return {'lessons':[{'text':f'lesson {len(counter)} {i}',
                    'coverage':'unknown','evidence':'quote'} for i in range(5)],'open_items':[]}
            result=chunked.drain(vault,state,model,budget=8)
            self.assertEqual(len(result['processed']),2)
            manifest=json.loads(next((state/'chunked').glob('*/manifest.json')).read_text())
            self.assertEqual(manifest['totals']['lessons'],10)
            self.assertEqual(manifest['status'],'complete')
            self.assertEqual(sum(len(c['result']['lessons']) for c in manifest['chunks']),10)
            records=extract.load_state(state)['records']
            self.assertEqual(sum(len(r['lessons']) for r in records.values()),10)
            for r in records.values():
                extract.validate_proposal({k:r[k] for k in ('lessons','open_items')})
            self.assertEqual(chunked.drain(vault,state,lambda _:self.fail('duplicate'),budget=8)['calls'],0)

    def test_non_aar_skip_and_runtime_provider_failure(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);vault=root/'vault';state=root/'state'
            p=vault/'projects/example/repo/main/2026-10-28.md';p.parent.mkdir(parents=True)
            p.write_text('# Ordinary note\n'+'x'*25000)
            r=chunked.drain(vault,state,lambda _:self.fail('non AAR call'),budget=2)
            self.assertEqual(len(r['skipped']),1)
            self.assertEqual(r['errors'],[])
            self.assertEqual(r['pending'],0)
            p.write_text('# AAR\n'+'x'*25000)
            def broken(_): raise RuntimeError('private provider detail')
            r=chunked.drain(vault,state,broken,budget=2)
            self.assertEqual(r['calls'],2)
            self.assertEqual(r['errors'][0]['error_type'],'RuntimeError')
            self.assertNotIn('private provider detail',(state/'chunked-last-run.json').read_text())

    def test_crash_after_ledger_repairs_manifest_and_queue_without_provider(self):
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);vault=root/'vault';state=root/'state'
            p=vault/'projects/example/repo/main/2026-10-28.md';p.parent.mkdir(parents=True)
            p.write_text('# AAR\n'+'x'*25000)
            extract.distil(vault,state,lambda _:self.fail('oversized call'))
            original=extract.save
            def crash(path,value):
                if path.name=='manifest.json' and json.loads(value).get('status')=='complete':
                    raise OSError('injected crash after ledger')
                return original(path,value)
            with patch.object(extract,'save',side_effect=crash):
                first=chunked.drain(vault,state,lambda _:{'lessons':[],'open_items':[]},budget=8)
            self.assertTrue(first['errors'])
            self.assertTrue(extract.load_state(state)['records'])
            again=chunked.drain(vault,state,lambda _:self.fail('provider after commit'),budget=8)
            self.assertEqual(again['errors'],[]);self.assertEqual(again['calls'],0)
            self.assertEqual(again['processed'],[])
            manifest=json.loads(next((state/'chunked').glob('*/manifest.json')).read_text())
            self.assertEqual(manifest['status'],'complete')
            self.assertTrue(manifest['record_ids'])
            queue=json.loads((state/'manual-review.json').read_text())
            self.assertEqual(next(iter(queue['records'].values()))['status'],'extracted')

    def test_nightly_new_queue_reconciliation_and_absent_queue(self):
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);vault=root/'vault';state=root/'state';vault.mkdir()
            cfg=root/'config.json';cfg.write_text(json.dumps({'enabled':True,'vault':str(vault),'state':str(state),
                'dream_script':'unused','chunked_enabled':True,'chunk_call_budget':8}))
            with patch.object(extract,'dream_model',return_value=lambda _:{'lessons':[],'open_items':[]}):
                self.assertEqual(extract.nightly(cfg)['status'],'complete')
                p=vault/'projects/example/repo/main/2026-10-28.md';p.parent.mkdir(parents=True)
                p.write_text('# AAR\n'+'x'*25000)
                r=extract.nightly(cfg)
            self.assertEqual(r['status'],'complete')
            q=json.loads((state/'manual-review.json').read_text())
            self.assertEqual(next(iter(q['records'].values()))['status'],'extracted')
            manifest=next((state/'chunked').glob('*/manifest.json'))
            content=json.loads(manifest.read_text());content['status']='pending';manifest.write_text(json.dumps(content))
            q['records'][next(iter(q['records']))]['status']='manual-review-required'
            (state/'manual-review.json').write_text(json.dumps(q))
            with patch('learning.chunked.drain',return_value={'processed':[],'errors':[]}),patch.object(extract,'dream_model',return_value=lambda _:self.fail('already committed')):
                r=extract.nightly(cfg)
            self.assertEqual(r['status'],'manual-review-required')
            q=json.loads((state/'manual-review.json').read_text())
            self.assertEqual(next(iter(q['records'].values()))['status'],'manual-review-required')

if __name__=='__main__': unittest.main()
