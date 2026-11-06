"""Durable model phases and honest coverage; fixtures are not live lessons."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import auto_review as auto
import test_auto_review as fixtures

class ReviewContinuationTests(unittest.TestCase):
    def setUp(self):
        guard=patch.object(auto.review_runner,'launch',side_effect=AssertionError('no native process in unit tests'))
        guard.start();self.addCleanup(guard.stop)

    def fixture(self, root):
        v, library, state, source, target, base = fixtures.PipelineTests().tree(root)
        state.mkdir()
        record = {'source': {'path':source.relative_to(v).as_posix(),
                            'sha256':auto.sha(source.read_bytes()),'date':'2026-10-31'}}
        auto.save(state/'aar-learning.json', {'records':{'one':record}})
        return v, library, state/'auto', source, target, base

    def test_approved_nochange_resumes_after_receipt_loss_without_delivery_or_model(self):
        from types import SimpleNamespace
        import canonical_delivery
        with tempfile.TemporaryDirectory() as d:
            v, library, state, source, target, base = self.fixture(Path(d))
            with patch.object(auto,'propose',return_value={'decision':'no-change','reason':'runtime defect'}), \
                 patch.object(auto.review_runner,'launch',return_value=SimpleNamespace(pid=324,returncode=0,stdout='MUNINN_REVIEW_VERDICT=APPROVE\n',stderr='')):
                self.assertEqual(auto.cycle(state=state,vault=v,library=library)['state'],'independently-reviewed-no-change')
            run=next((state/'runs').iterdir())
            self.assertFalse((run/'reviewer.json').exists())
            budget=(state/'model-budget.json').read_bytes()
            with patch.object(canonical_delivery,'adopt_reviewed',side_effect=AssertionError('no-change never applies')):
                self.assertEqual(auto.cycle(state=state,vault=v,library=library)['state'],'idle')
                self.assertNotIn('delivery_attempts',json.loads((run/'receipt.json').read_text()))
                (state/'seen.json').unlink();(run/'receipt.json').unlink()
                result=auto.cycle(state=state,vault=v,library=library)
            self.assertEqual(result['state'],'independently-reviewed-no-change')
            self.assertNotIn('delivery_attempts',result)
            self.assertEqual((state/'model-budget.json').read_bytes(),budget)

    def test_source_cited_reference_is_supplied_and_denial_not_automatically_retried(self):
        from types import SimpleNamespace
        with tempfile.TemporaryDirectory() as d:
            v, library, state, source, target, base = self.fixture(Path(d))
            reference=library/'skills/countdown/references/boundaries.md'
            reference.parent.mkdir();reference.write_text('Assert the numeric value at boundaries.\n')
            source.write_text(source.read_text()+'\nSee countdown/references/boundaries.md.\n')
            records={'one':{'source':{'path':source.relative_to(v).as_posix(),
                'sha256':auto.sha(source.read_bytes()),'date':'2026-10-31'}}}
            auto.save(state.parent/'aar-learning.json',{'records':records})
            def child(argv, **kwargs):
                inputs=next((state/'runs').glob('*/nochange/base.md'))
                guidance=json.loads(inputs.read_text())
                self.assertEqual(guidance['skills/countdown/references/boundaries.md'],reference.read_text())
                return SimpleNamespace(pid=325,returncode=0,stdout='Missing evidence\nMUNINN_REVIEW_VERDICT=DENY\n',stderr='')
            with patch.object(auto,'propose',return_value={'decision':'no-change','reason':'already covered'}), \
                 patch.object(auto.review_runner,'launch',side_effect=child) as launch:
                result=auto.cycle(state=state,vault=v,library=library)
                self.assertEqual(result['state'],'nochange-contested')
                self.assertEqual(auto.cycle(state=state,vault=v,library=library)['state'],'idle')
                self.assertEqual(launch.call_count,1)

    def test_contested_nochange_retries_only_changed_evidence_and_preserves_denial(self):
        from types import SimpleNamespace
        import canonical_delivery
        with tempfile.TemporaryDirectory() as d:
            v, library, state, source, target, base = self.fixture(Path(d))
            source.write_text(source.read_text()+'\nSee countdown.\n')
            auto.save(state.parent/'aar-learning.json',{'records':{'one':{'source':{
                'path':source.relative_to(v).as_posix(),'sha256':auto.sha(source.read_bytes()),'date':'2026-10-31'}}}})
            with patch.object(auto,'propose',return_value={'decision':'no-change','reason':'already covered'}), \
                 patch.object(auto.review_runner,'launch',return_value=SimpleNamespace(pid=326,returncode=0,stdout='MUNINN_REVIEW_VERDICT=DENY\n',stderr='')):
                self.assertEqual(auto.cycle(state=state,vault=v,library=library)['state'],'nochange-contested')
            run=next((state/'runs').iterdir());original=run/'nochange'
            denied={p.relative_to(original):p.read_bytes() for p in original.rglob('*') if p.is_file()}
            with patch.object(auto,'propose',side_effect=AssertionError('never re-propose denied no-change')), \
                 patch.object(canonical_delivery,'adopt_reviewed',side_effect=AssertionError('no-change cannot apply')):
                self.assertEqual(auto.cycle(state=state,vault=v,library=library)['state'],'idle')
                target.write_text(base+'\nAssert exact boundary values.\n')
                with patch.object(auto,'reserve_model',side_effect=auto.BudgetExhausted('pause')):
                    self.assertEqual(auto.cycle(state=state,vault=v,library=library)['state'],'budget-exhausted')
                seen=json.loads((state/'seen.json').read_text());self.assertEqual(next(iter(seen.values()))['attempts'],1)
                with patch.object(auto.review_runner,'launch',return_value=SimpleNamespace(pid=327,returncode=0,stdout='MUNINN_REVIEW_VERDICT=DENY\n',stderr='')) as launch:
                    self.assertEqual(auto.cycle(state=state,vault=v,library=library)['state'],'nochange-contested')
                    self.assertEqual(launch.call_count,1)
                self.assertEqual(auto.cycle(state=state,vault=v,library=library)['state'],'idle')
                target.write_text(base+'\nAnother correction after attempts exhausted.\n')
                self.assertEqual(auto.cycle(state=state,vault=v,library=library)['state'],'idle')
                (state/'seen.json').unlink()  # durable denials still bound attempts after a crash
                with patch.object(auto.review_runner,'launch') as launch, patch.object(auto,'reserve_model') as reserve:
                    self.assertEqual(auto.cycle(state=state,vault=v,library=library)['state'],'idle')
                launch.assert_not_called();reserve.assert_not_called()
            self.assertEqual(denied,{p.relative_to(original):p.read_bytes() for p in original.rglob('*') if p.is_file()})
            attempt,=run.glob('nochange-attempt-*')
            receipt=json.loads((attempt/'receipt.json').read_text())
            self.assertEqual(receipt['prior_denied_attempt'],str(original))
            self.assertEqual(attempt.name,'nochange-attempt-'+receipt['evidence_sha256'])
            self.assertFalse((run/'reviewer.json').exists())
            self.assertEqual(json.loads((state/'model-budget.json').read_text())['used'],2)

    def test_denied_nochange_tamper_does_not_authorize_retry(self):
        from types import SimpleNamespace
        with tempfile.TemporaryDirectory() as d:
            v, library, state, source, target, base = self.fixture(Path(d))
            with patch.object(auto,'propose',return_value={'decision':'no-change','reason':'runtime defect'}), \
                 patch.object(auto.review_runner,'launch',return_value=SimpleNamespace(pid=328,returncode=0,stdout='MUNINN_REVIEW_VERDICT=DENY\n',stderr='')):
                self.assertEqual(auto.cycle(state=state,vault=v,library=library)['state'],'nochange-contested')
            run=next((state/'runs').iterdir())
            packet=json.loads((run/'nochange/candidate.json').read_text())
            packet['proposer']['reason']='tampered evidence'
            auto.save(run/'nochange/candidate.json',packet)
            with patch.object(auto.review_runner,'launch') as launch:
                result=auto.cycle(state=state,vault=v,library=library)
            launch.assert_not_called()
            self.assertEqual(result['state'],'held')
            self.assertEqual(result['error_type'],'ValueError')

    def test_denial_status_tamper_or_missing_record_holds_before_reservation(self):
        from types import SimpleNamespace
        for mutation in ('status','missing','legacy-status','legacy-missing'):
            with self.subTest(mutation=mutation), tempfile.TemporaryDirectory() as d:
                v, library, state, source, target, base = self.fixture(Path(d))
                with patch.object(auto,'propose',return_value={'decision':'no-change','reason':'runtime defect'}), \
                     patch.object(auto.review_runner,'launch',return_value=SimpleNamespace(pid=331,returncode=0,stdout='MUNINN_REVIEW_VERDICT=DENY\n',stderr='')):
                    self.assertEqual(auto.cycle(state=state,vault=v,library=library)['state'],'nochange-contested')
                run=next((state/'runs').iterdir());record=run/'nochange/reviewer.json'
                if mutation.startswith('legacy'): (run/'nochange/receipt.json').unlink()
                if mutation.endswith('status'):
                    value=json.loads(record.read_text());value['status']='unverified';auto.save(record,value)
                else:record.unlink()
                with patch.object(auto.review_runner,'launch') as launch, patch.object(auto,'reserve_model') as reserve:
                    result=auto.cycle(state=state,vault=v,library=library)
                launch.assert_not_called();reserve.assert_not_called()
                self.assertEqual(result['state'],'held')
                self.assertEqual(result['error_type'],'ValueError')

    def test_interrupted_launched_nochange_holds_without_another_turn(self):
        with tempfile.TemporaryDirectory() as d:
            v, library, state, source, target, base = self.fixture(Path(d))
            with patch.object(auto,'propose',return_value={'decision':'no-change','reason':'runtime defect'}), \
                 patch.object(auto.review_runner,'review',side_effect=KeyboardInterrupt('controller crash')):
                with self.assertRaises(KeyboardInterrupt):auto.cycle(state=state,vault=v,library=library)
            with patch.object(auto.review_runner,'launch') as launch, patch.object(auto,'reserve_model') as reserve:
                result=auto.cycle(state=state,vault=v,library=library)
            launch.assert_not_called();reserve.assert_not_called()
            self.assertEqual(result['state'],'held')
            self.assertEqual(json.loads((state/'model-budget.json').read_text())['used'],1)

    def test_legacy_denial_changed_reference_approves_without_reproposal_and_recovers(self):
        from types import SimpleNamespace
        import canonical_delivery
        with tempfile.TemporaryDirectory() as d:
            v, library, state, source, target, base = self.fixture(Path(d))
            reference=library/'skills/countdown/references/boundaries.md'
            reference.parent.mkdir();reference.write_text('Incomplete guidance.\n')
            source.write_text(source.read_text()+'\nSee countdown/references/boundaries.md.\n')
            auto.save(state.parent/'aar-learning.json',{'records':{'one':{'source':{
                'path':source.relative_to(v).as_posix(),'sha256':auto.sha(source.read_bytes()),'date':'2026-10-31'}}}})
            with patch.object(auto,'propose',return_value={'decision':'no-change','reason':'already covered'}), \
                 patch.object(auto.review_runner,'launch',return_value=SimpleNamespace(pid=329,returncode=0,stdout='MUNINN_REVIEW_VERDICT=DENY\n',stderr='')):
                self.assertEqual(auto.cycle(state=state,vault=v,library=library)['state'],'nochange-contested')
            run=next((state/'runs').iterdir());(run/'choice.json').unlink()  # legacy code deleted choice
            original={p.relative_to(run/'nochange'):p.read_bytes() for p in (run/'nochange').rglob('*') if p.is_file()}
            reference.write_text('Corrected boundary guidance.\n')
            with patch.object(auto,'propose',side_effect=AssertionError('recover exact saved choice')), \
                 patch.object(canonical_delivery,'adopt_reviewed',side_effect=AssertionError('no-change never delivers')), \
                 patch.object(auto.review_runner,'launch',return_value=SimpleNamespace(pid=330,returncode=0,stdout='MUNINN_REVIEW_VERDICT=APPROVE\n',stderr='')) as launch:
                self.assertEqual(auto.cycle(state=state,vault=v,library=library)['state'],'independently-reviewed-no-change')
                attempt,=run.glob('nochange-attempt-*');auto.review_runner.verify_record(attempt)
                (run/'receipt.json').unlink();(state/'seen.json').unlink()
                self.assertEqual(auto.cycle(state=state,vault=v,library=library)['state'],'independently-reviewed-no-change')
                self.assertEqual(launch.call_count,1)
            self.assertEqual(original,{p.relative_to(run/'nochange'):p.read_bytes() for p in (run/'nochange').rglob('*') if p.is_file()})
            self.assertFalse((run/'reviewer.json').exists())

    def test_guidance_selected_from_exact_source_tokens_not_proposer_reason(self):
        from types import SimpleNamespace
        with tempfile.TemporaryDirectory() as d:
            v, library, state, source, target, base = self.fixture(Path(d))
            source.write_text(source.read_text()+'\nSee countdown, not countdownish.\n')
            extra=library/'skills/unrelated/SKILL.md';extra.parent.mkdir();extra.write_text('unrelated')
            packet=auto.context(v,library,source.relative_to(v).as_posix(),auto.sha(source.read_bytes()))
            run=state/'runs'/'one';run.mkdir(parents=True)
            with patch.object(auto.review_runner,'launch',return_value=SimpleNamespace(pid=323,returncode=0,stdout='MUNINN_REVIEW_VERDICT=APPROVE\n',stderr='')):
                auto.review_nochange(packet,{'decision':'no-change','reason':'already covered by unrelated'},run,library)
            evidence=json.loads((run/'nochange/evaluation.json').read_text())
            self.assertEqual(evidence['selected_skills'],['skills/countdown/SKILL.md'])
            self.assertEqual(evidence['guidance_sha256'],{'skills/countdown/SKILL.md':auto.sha(base.encode())})
            self.assertEqual(json.loads((run/'nochange/base.md').read_text()),{'skills/countdown/SKILL.md':base})

    def test_nochange_reviewer_binding_is_checked_before_terminal_decision(self):
        from types import SimpleNamespace
        with tempfile.TemporaryDirectory() as d:
            v, library, state, source, target, base = self.fixture(Path(d))
            def child(argv, **kwargs):
                packet=next((state/'runs').glob('*/nochange/candidate.json'))
                packet.write_text('tampered during review')
                return SimpleNamespace(pid=322,returncode=0,stdout='MUNINN_REVIEW_VERDICT=APPROVE\n',stderr='')
            with patch.object(auto,'propose',return_value={'decision':'no-change','reason':'runtime defect'}), \
                 patch.object(auto.review_runner,'launch',side_effect=child):
                result=auto.cycle(state=state,vault=v,library=library)
            self.assertEqual(result['state'],'review-unverified')
            self.assertEqual(result['coverage']['independently_reviewed'],0)

    def test_proposer_nochange_requires_independent_review_and_reports_queue(self):
        with tempfile.TemporaryDirectory() as d:
            v, library, state, source, target, base = self.fixture(Path(d))
            with patch.object(auto, 'propose', return_value={'decision':'no-change','reason':'runtime defect'}), \
                 patch.object(auto, 'review_nochange', return_value={'status':'approved'}) as review:
                result = auto.cycle(state=state,vault=v,library=library)
            review.assert_called_once()
            self.assertEqual(result['state'],'independently-reviewed-no-change')
            self.assertEqual(result['reviewed'],1)
            self.assertEqual(result['coverage']['source_revisions'],1)
            self.assertEqual(result['coverage']['independently_reviewed'],1)
            self.assertEqual(result['coverage']['unreviewed'],0)
            self.assertEqual(target.read_text(),base)

    def test_budget_pause_retains_choice_without_spending_retry(self):
        with tempfile.TemporaryDirectory() as d:
            v, library, state, source, target, base = self.fixture(Path(d))
            with patch.object(auto,'propose',return_value={'decision':'no-change','reason':'runtime defect'}) as propose, \
                 patch.object(auto,'review_nochange',side_effect=auto.BudgetExhausted('Daily native model budget exhausted')):
                result=auto.cycle(state=state,vault=v,library=library)
            self.assertEqual(result['state'],'budget-exhausted')
            with patch.object(auto,'propose',side_effect=AssertionError('must resume saved choice')), \
                 patch.object(auto,'review_nochange',return_value={'status':'approved'}):
                result=auto.cycle(state=state,vault=v,library=library)
            self.assertEqual(result['state'],'independently-reviewed-no-change')
            self.assertEqual(propose.call_count,1)

    def test_unreviewed_legacy_nochange_is_not_terminal(self):
        with tempfile.TemporaryDirectory() as d:
            v, library, state, source, target, base = self.fixture(Path(d))
            key=auto.sha((source.relative_to(v).as_posix()+auto.sha(source.read_bytes())).encode())
            run=state/'runs'/key;run.mkdir(parents=True)
            old={'state':'no-change','reason':'runtime defect','source':source.relative_to(v).as_posix(),
                 'source_sha256':auto.sha(source.read_bytes()),'reviewed':0}
            auto.save(run/'receipt.json',old)
            auto.save(state/'seen.json',{key:{'state':'no-change','receipt':str(run/'receipt.json')}})
            with patch.object(auto,'propose',side_effect=AssertionError('reuse proposer decision')), \
                 patch.object(auto,'review_nochange',return_value={'status':'approved'}) as review:
                result=auto.cycle(state=state,vault=v,library=library)
            review.assert_called_once()
            self.assertEqual(result['state'],'independently-reviewed-no-change')

    def test_candidate_survives_budget_pause_before_independent_review(self):
        import canonical_apply
        with tempfile.TemporaryDirectory() as d:
            v, library, state, source, target, base = self.fixture(Path(d))
            def evaluation(bound, run):
                auto.save(run/'evaluation.json',{'status':'passed'});return {'status':'passed'}
            with patch.object(auto,'propose',return_value={'decision':'inspect','target':'skills/countdown/SKILL.md'}), \
                 patch.object(auto,'model_json',return_value=fixtures.PipelineTests().proposal(source,base)), \
                 patch.object(canonical_apply,'prepare',return_value=library), \
                 patch.object(auto,'regress',side_effect=evaluation), \
                 patch.object(auto,'reserve_model',side_effect=auto.BudgetExhausted('Daily native model budget exhausted')):
                self.assertEqual(auto.cycle(state=state,vault=v,library=library)['state'],'budget-exhausted')
            with patch.object(auto,'propose',side_effect=AssertionError('cached choice')), \
                 patch.object(auto,'model_json',side_effect=AssertionError('cached candidate')), \
                 patch.object(canonical_apply,'prepare',return_value=library), \
                 patch.object(auto,'reserve_model'), \
                 patch.object(auto.review_runner,'review',return_value={'status':'denied'}) as review:
                self.assertEqual(auto.cycle(state=state,vault=v,library=library)['state'],'review-denied')
            review.assert_called_once()

    def test_real_nochange_review_uses_distinct_prompt_and_bound_output(self):
        from types import SimpleNamespace
        with tempfile.TemporaryDirectory() as d:
            v, library, state, source, target, base = self.fixture(Path(d))
            def child(argv, **kwargs):
                system=argv[argv.index('--system-prompt')+1]
                self.assertIn('proposed NO-CHANGE',system)
                self.assertNotEqual(system,auto.review_runner.SYSTEM)
                return SimpleNamespace(pid=321,returncode=0,stdout='Source runtime passage cited.\nMUNINN_REVIEW_VERDICT=APPROVE\n',stderr='')
            with patch.object(auto,'propose',return_value={'decision':'no-change','reason':'runtime defect'}), \
                 patch.object(auto.review_runner,'launch',side_effect=child):
                result=auto.cycle(state=state,vault=v,library=library)
            self.assertEqual(result['state'],'independently-reviewed-no-change')
            run=next((state/'runs').iterdir())
            record=auto.review_runner.verify_record(run/'nochange')
            self.assertEqual(record['pid'],321)
            (run/'nochange/candidate.json').write_text('tampered')
            with self.assertRaises(ValueError):auto.review_runner.verify_record(run/'nochange')

    def test_large_source_is_bounded_not_a_manual_approval_hold(self):
        with tempfile.TemporaryDirectory() as d:
            v, library, state, source, target, base = self.fixture(Path(d))
            source.write_text(source.read_text()+'x'*20000)
            packet=auto.context(v,library,source.relative_to(v).as_posix(),auto.sha(source.read_bytes()))
            self.assertEqual(packet['source_text'],source.read_text())

if __name__=='__main__':unittest.main()