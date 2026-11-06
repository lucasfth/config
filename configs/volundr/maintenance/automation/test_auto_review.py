import json
from pathlib import Path
import tempfile
import unittest
import auto_review as auto

class PipelineTests(unittest.TestCase):
    def tree(self,root):
        v=root/'vault';skills=root/'library';state=root/'state'
        p=v/'projects/example/repo/main/2026-10-31.md';p.parent.mkdir(parents=True)
        p.write_text('# AAR\n## Corrections\nThe countdown test asserted only the unit, missing the wrong number.\n')
        target=skills/'skills/countdown/SKILL.md';target.parent.mkdir(parents=True)
        base='---\nname: countdown\ndescription: Use when checking countdowns.\n---\n# Countdown\nCheck results.\n';target.write_text(base)
        return v,skills,state,p,target,base
    def proposal(self,p,base):
        text=p.read_text();quote='The countdown test asserted only the unit, missing the wrong number.'
        return {'diagnosis':'missing-procedure','target':'skills/countdown/SKILL.md','quote':quote,
            'span_start':text.index(quote),'span_end':text.index(quote)+len(quote),'rationale':'Specific numeric regression missing.',
            'candidate':base+'\nAssert the numeric countdown value at unit boundaries.\n'}
    def test_no_candidate_no_model_no_mutation(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);v,s,state,p,t,b=self.tree(root)
            r=auto.validate(v,s,p.relative_to(v).as_posix(),auto.sha(p.read_bytes()),self.proposal(p,b))
            self.assertTrue(r['eligible']);self.assertEqual(t.read_text(),b)
            self.assertEqual(r['source_excerpt'],p.read_text()[r['span_start']:r['span_end']])
            self.assertIn(r['quote'],r['source_excerpt'])
            self.assertEqual(r['source_excerpt_sha256'],auto.sha(r['source_excerpt'].encode()))
    def test_stale_quote_protected_and_duplicate_refused(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);v,s,state,p,t,b=self.tree(root);proposal=self.proposal(p,b)
            for key,val in [('quote','absent'),('target','skills/security/SKILL.md'),('candidate',b),('diagnosis','runtime')]:
                altered={**proposal,key:val}
                with self.assertRaises(ValueError):auto.validate(v,s,p.relative_to(v).as_posix(),auto.sha(p.read_bytes()),altered)
    def test_self_attestation_cannot_apply(self):
        self.assertFalse(hasattr(auto,'accept_attestation'))
    def test_atomic_scoped_apply_cas_and_rollback(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);p=root/'skills/x/SKILL.md';p.parent.mkdir(parents=True);p.write_bytes(b'base')
            with self.assertRaises(RuntimeError):auto.transaction(p,b'base',b'candidate',root,postcheck=lambda _:(_ for _ in ()).throw(RuntimeError('fixture')))
            self.assertEqual(p.read_bytes(),b'base')
            self.assertFalse((root/'journal.json').exists())
            with self.assertRaises(ValueError):auto.transaction(p,b'wrong',b'candidate',root)
    def test_source_revision_and_specific_span_checked(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);v,s,state,p,t,b=self.tree(root);proposal=self.proposal(p,b)
            proposal['span_end']=proposal['span_start']+2
            with self.assertRaises(ValueError):auto.validate(v,s,p.relative_to(v).as_posix(),auto.sha(p.read_bytes()),proposal)

    def test_cycle_bounded_retry_and_nochange_never_promotes(self):
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);v,s,state,p,t,b=self.tree(root);state.mkdir()
            record={'source':{'path':p.relative_to(v).as_posix(),'sha256':auto.sha(p.read_bytes()),'date':'2026-10-31'}}
            (state/'aar-learning.json').write_text(json.dumps({'records':{'fixture':record}}))
            with patch.object(auto,'propose',side_effect=RuntimeError('transient')) as proposer:
                self.assertEqual(auto.cycle(state=state/'auto',vault=v,library=s)['state'],'held')
                self.assertEqual(auto.cycle(state=state/'auto',vault=v,library=s)['state'],'held')
                self.assertEqual(auto.cycle(state=state/'auto',vault=v,library=s)['state'],'idle')
                self.assertEqual(proposer.call_count,2)
            other=state/'other'
            with patch.object(auto,'propose',return_value={'decision':'no-change','reason':'already covered'}),patch.object(auto,'review_nochange',return_value={'status':'approved'}) as review,patch.object(auto.review_runner,'launch',side_effect=AssertionError('no model in fixtures')):
                r=auto.cycle(state=other,vault=v,library=s)
            review.assert_called_once()
            self.assertEqual(r['state'],'independently-reviewed-no-change');self.assertEqual(r['staged'],0)
            self.assertEqual(t.read_text(),b)
    def test_read_no_follow_inside_symlink(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);(root/'actual').mkdir();(root/'actual/note').write_text('fixture')
            (root/'link').symlink_to(root/'actual')
            with self.assertRaises(OSError):auto.read_safe(root,'link/note')

    def test_daily_native_turn_budget_shared_proposer_reviewer_retry(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);a=root/'runs/one/sessions';b=root/'runs/two/reviewer-sessions'
            a.mkdir(parents=True);b.mkdir(parents=True)
            auto.reserve_model(a);auto.reserve_model(a);auto.reserve_model(b)
            with self.assertRaises(ValueError):auto.reserve_model(b)
            value=json.loads((root/'model-budget.json').read_text());self.assertEqual(value['used'],3)

    def test_cycle_denial_cleans_worktree_but_progress_preserves_it(self):
        from unittest.mock import patch
        import canonical_apply
        for interrupted in (False,True):
            with self.subTest(interrupted=interrupted),tempfile.TemporaryDirectory() as d:
                root=Path(d);v,s,state,p,t,b=self.tree(root);state.mkdir()
                record={'source':{'path':p.relative_to(v).as_posix(),'sha256':auto.sha(p.read_bytes()),'date':'2026-10-31'}}
                (state/'aar-learning.json').write_text(json.dumps({'records':{'fixture':record}}))
                work=[]
                def prepare(library,run):
                    import shutil
                    tree=run/'canonical-worktree';shutil.copytree(library,tree);work.append(tree)
                    if interrupted:
                        (run/'canonical-application').mkdir();(run/'canonical-application/progress.json').write_text('{}')
                    return tree
                def cleanup(library,tree,run):
                    import shutil
                    shutil.rmtree(tree)
                with patch.object(auto,'propose',return_value={'decision':'inspect','target':'skills/countdown/SKILL.md'}),patch.object(auto,'model_json',return_value=self.proposal(p,b)),patch.object(canonical_apply,'prepare',side_effect=prepare),patch.object(canonical_apply,'cleanup',side_effect=cleanup),patch.object(auto,'regress',return_value={}),patch.object(auto.review_runner,'review',return_value={'status':'denied'}):
                    r=auto.cycle(state=state/'auto',vault=v,library=s)
                self.assertEqual(r['state'],'review-denied')
                self.assertEqual(work[0].exists(),interrupted)

if __name__=='__main__':unittest.main()
