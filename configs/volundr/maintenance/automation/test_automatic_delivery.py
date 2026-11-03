"""Unattended continuation fixtures, never live learning evidence."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import auto_review as auto
import canonical_delivery as delivery

class ContinuationTests(unittest.TestCase):
    def reviewed(self,run):
        for name in ('candidate.json','base.md','evaluation.json'):
            if not (run/name).exists():(run/name).write_text('{}')
        hashes=[auto.sha((run/n).read_bytes()) for n in ('candidate.json','base.md','evaluation.json')]
        output=run/'reviewer-sessions/fixture.stdout.txt';output.parent.mkdir(exist_ok=True);output.write_text('Fixture evidence\nMUNINN_REVIEW_VERDICT=APPROVE\n')
        receipt={'status':'approved','exit_code':0,'pid':123,'session':'fixture-session','stdout_sha256':auto.sha(output.read_bytes()),'output_path':str(output),'input_sha256_before':hashes,'input_sha256_after':hashes}
        (run/'reviewer.json').write_text(json.dumps(receipt));return receipt

    def test_pending_approved_delivery_retries_before_cap_without_model_turns(self):
        with tempfile.TemporaryDirectory() as d:
            state=Path(d);run=state/'runs'/('a'*64);run.mkdir(parents=True)
            self.reviewed(run)
            (state.parent/'aar-learning.json').write_text(json.dumps({'records':{}}))
            from datetime import datetime
            from zoneinfo import ZoneInfo
            budget={'date':str(datetime.now(ZoneInfo('Europe/Copenhagen')).date()),'used':4,'limit':3}
            (state/'model-budget.json').write_text(json.dumps(budget));before=(state/'model-budget.json').read_bytes()
            with patch.object(auto,'propose',side_effect=AssertionError('no learning')),patch.object(delivery,'adopt_reviewed',side_effect=[RuntimeError('consumer unavailable'),{'state':'locally-delivered-unpublished','consumer_loaded':True}]) as adopt:
                self.assertEqual(auto.cycle(state=state,vault=state/'v',library=state/'l')['state'],'delivery-pending')
                self.assertEqual(auto.cycle(state=state,vault=state/'v',library=state/'l')['state'],'locally-delivered-unpublished')
                self.assertEqual(adopt.call_count,2)
                self.assertEqual(auto.cycle(state=state,vault=state/'v',library=state/'l')['state'],'budget-exhausted')
            self.assertEqual(before,(state/'model-budget.json').read_bytes())

    def test_denied_run_never_adopts(self):
        with tempfile.TemporaryDirectory() as d:
            state=Path(d)/'auto';run=state/'runs'/('b'*64);run.mkdir(parents=True)
            (run/'reviewer.json').write_text(json.dumps({'status':'denied'}))
            (state.parent/'aar-learning.json').write_text(json.dumps({'records':{}}))
            with patch.object(delivery,'adopt_reviewed',side_effect=AssertionError('must not adopt')):
                self.assertEqual(auto.cycle(state=state,vault=state/'v',library=state/'l')['state'],'idle')

    def test_approved_branch_continues_immediately_and_blocked_retry_is_bounded(self):
        import test_auto_review,canonical_apply
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);v,s,state,p,t,b=test_auto_review.PipelineTests().tree(root);state.mkdir()
            source={'source':{'path':p.relative_to(v).as_posix(),'sha256':auto.sha(p.read_bytes()),'date':'2026-10-31'}}
            (state/'aar-learning.json').write_text(json.dumps({'records':{'fixture':source}}))
            def evaluation(bound,run):
                value={};auto.save(run/'evaluation.json',value);return value
            def review(candidate,*args):return self.reviewed(candidate.parent)
            with patch.object(auto,'propose',return_value={'decision':'inspect','target':'skills/countdown/SKILL.md'}),patch.object(canonical_apply,'prepare',return_value=s),patch.object(auto,'model_json',return_value=test_auto_review.PipelineTests().proposal(p,b)),patch.object(auto,'regress',side_effect=evaluation),patch.object(auto,'reserve_model'),patch.object(auto.review_runner,'review',side_effect=review),patch.object(delivery,'adopt_reviewed',side_effect=RuntimeError('retry')) as adopt:
                for expected in ['delivery-pending','delivery-pending','delivery-blocked']:
                    self.assertEqual(auto.cycle(state=state/'auto',vault=v,library=s)['state'],expected)
                self.assertEqual(auto.cycle(state=state/'auto',vault=v,library=s)['state'],'idle')
                self.assertEqual(adopt.call_count,3)

    def test_bare_approval_cannot_call_adoption(self):
        with tempfile.TemporaryDirectory() as d:
            run=Path(d);(run/'reviewer.json').write_text(json.dumps({'status':'approved'}))
            with patch.object(delivery,'adopt_reviewed') as adopt:
                self.assertEqual(auto.continue_approved(run,run,run)['state'],'delivery-pending')
                adopt.assert_not_called()

    def test_captured_output_or_inputs_tamper_never_adopts(self):
        for mode in ('output','verdict','input'):
            with self.subTest(mode=mode),tempfile.TemporaryDirectory() as d:
                run=Path(d);receipt=self.reviewed(run)
                if mode=='input':(run/'candidate.json').write_text('changed')
                else:
                    output=Path(receipt['output_path']);output.write_text('no verdict' if mode=='verdict' else 'MUNINN_REVIEW_VERDICT=DENY\n')
                    if mode=='verdict':receipt['stdout_sha256']=auto.sha(output.read_bytes());(run/'reviewer.json').write_text(json.dumps(receipt))
                with patch.object(delivery,'adopt_reviewed') as adopt:
                    self.assertEqual(auto.continue_approved(run,run,run)['state'],'delivery-pending');adopt.assert_not_called()

if __name__=='__main__':unittest.main()
