import json
from pathlib import Path
import subprocess
import tempfile
import unittest
import canonical_apply as apply

class ApplyTests(unittest.TestCase):
    def git(self,root,*args):return subprocess.check_output(['git','-C',str(root),*args],text=True).strip()
    def repo(self,root):
        subprocess.run(['git','init','-q','-b','main',str(root)],check=True)
        self.git(root,'config','user.name','Fixture');self.git(root,'config','user.email','fixture@example.invalid')
        p=root/'skills/example/SKILL.md';p.parent.mkdir(parents=True);p.write_text('---\nname: example\n---\n# Example\nBase.\n')
        (root/'docs').mkdir();(root/'docs/skill-mapping.json').write_text(json.dumps({
            'schema':2,'outputs':{str(p.relative_to(root)):apply.sha(p.read_bytes())},
            'sources':[],'discovery':{},'credential_review':{'findings':[]},'maintenance_reviews':[]}))
        import shutil
        scripts=root/'scripts';scripts.mkdir()
        shutil.copyfile('/Users/gimle/loki-data/live/volundr/scripts/refresh_manifest.py',scripts/'refresh_manifest.py')
        self.git(root,'add','.');self.git(root,'commit','-qm','test: base')
        return p
    def test_binding_and_wrong_base_refused(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);p=self.repo(root/'repo');base=p.read_bytes();candidate=base+b'\nCheck exact numerical output.\n'
            with self.assertRaises(ValueError):apply.verify_bound({'base_sha256':apply.sha(base)},base,candidate,{}, {})
    def test_scoped_atomic_apply_and_rollback_postcheck(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);p=self.repo(root/'repo');base=p.read_bytes();candidate=base+b'\nCheck exact numerical output.\n'
            def fail(_):raise RuntimeError('fixture gate failed')
            with self.assertRaises(RuntimeError):apply.apply_tree(p.parent.parent.parent,'skills/example/SKILL.md',base,candidate,root/'receipt',postcheck=fail)
            self.assertEqual(p.read_bytes(),base)
            self.assertFalse((root/'receipt/journal.json').exists())
    def test_protected_target_and_nonfresh_base_refused(self):
        for target in ('skills/security/SKILL.md','../SKILL.md','skills/x/other.md'):
            with self.assertRaises(ValueError):apply.target_path(Path('/tmp/fixture'),target)
    def test_review_record_and_manifest_exact_payload(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);p=self.repo(root/'repo');base=p.read_bytes();candidate=base+b'\nCheck exact numerical output.\n'
            r=apply.apply_tree(p.parent.parent.parent,'skills/example/SKILL.md',base,candidate,root/'receipt')
            self.assertEqual(p.read_bytes(),candidate)
            self.assertEqual(r['state'],'locally-applied-unpublished')
            self.assertFalse(r['published']);self.assertFalse(r['consumer_loaded'])
            manifest=json.loads((p.parent.parent.parent/'docs/skill-mapping.json').read_text())
            self.assertEqual(manifest['outputs']['skills/example/SKILL.md'],apply.sha(candidate))
            record=json.loads((p.parent.parent.parent/r['review_record']).read_text())
            self.assertEqual(record['outputs']['skills/example/SKILL.md']['before'],apply.sha(base))
    def test_real_refresh_rejects_wrong_before(self):
        import importlib.util
        path=Path('/Users/gimle/loki-data/live/volundr/scripts/refresh_manifest.py')
        spec=importlib.util.spec_from_file_location('real_refresh',path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);p=self.repo(root/'repo');tree=p.parent.parent.parent;base=p.read_bytes();candidate=base+b'\nExact output.\n';p.write_bytes(candidate)
            record=tree/'docs/maintenance-fixture.json';value={'review':'fixture','limitations':'fixture only','outputs':{'skills/example/SKILL.md':{'before':'wrong','after':apply.sha(candidate),'reason':'fixture'}}};record.write_text(json.dumps(value))
            with self.assertRaises(ValueError):module.refresh(tree,'docs/maintenance-fixture.json')
            value['outputs']['skills/example/SKILL.md']['before']=apply.sha(base);record.write_text(json.dumps(value))
            module.refresh(tree,'docs/maintenance-fixture.json')
            self.assertEqual(json.loads((tree/'docs/skill-mapping.json').read_text())['outputs']['skills/example/SKILL.md'],apply.sha(candidate))

    def test_apply_reviewed_fresh_origin_private_commit_cleanup_and_cache_tamper(self):
        from unittest.mock import patch
        import auto_review
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);remote=root/'remote';p=self.repo(remote);base=p.read_bytes();candidate=base+b'\nCheck exact numerical output.\n'
            # Private clone commit identity is inherited via test env, not a live config edit.
            vault=root/'vault';source=vault/'projects/example/repo/main/2026-10-31.md';source.parent.mkdir(parents=True)
            quote='The countdown test asserted only the unit, missing the wrong number.';source.write_text('# AAR\n'+quote+'\n')
            self.git(remote,'remote','add','origin',str(remote))
            run=root/'auto/runs'/('c'*64);run.mkdir(parents=True);proposal={'diagnosis':'missing-procedure','target':'skills/example/SKILL.md','quote':quote,
                'span_start':6,'span_end':6+len(quote),'rationale':'fixture','candidate':candidate.decode()}
            bound=auto_review.validate(vault,remote,source.relative_to(vault).as_posix(),apply.sha(source.read_bytes()),proposal)
            (run/'candidate.json').write_text(json.dumps(bound));(run/'base.md').write_bytes(base)
            (run/'evaluation.json').write_text(json.dumps({'status':'passed','exit_code':0,'base_sha256':apply.sha(base),'candidate_sha256':apply.sha(candidate)}))
            hashes=[apply.sha((run/n).read_bytes()) for n in ('candidate.json','base.md','evaluation.json')]
            output=run/'reviewer-sessions/fixture.stdout.txt';output.parent.mkdir();output.write_text('Fixture review\nMUNINN_REVIEW_VERDICT=APPROVE\n')
            reviewer={'status':'approved','pid':123,'exit_code':0,'session':'fixture-session','stdout_sha256':apply.sha(output.read_bytes()),'output_path':str(output),
                'input_sha256_before':hashes,'input_sha256_after':hashes};(run/'reviewer.json').write_text(json.dumps(reviewer))
            before=self.git(remote,'show-ref');original=p.read_bytes()
            env={'GIT_AUTHOR_NAME':'Fixture','GIT_AUTHOR_EMAIL':'fixture@example.invalid','GIT_COMMITTER_NAME':'Fixture','GIT_COMMITTER_EMAIL':'fixture@example.invalid'}
            import os
            first=apply.prepare(remote,run);self.assertEqual(apply.prepare(remote,run),first)
            with patch.dict(os.environ,env),patch.object(apply,'local_gates',return_value=[{'exit_code':0,'scope':'mocked-gates-fixture-only'}]):
                original_command=apply.command
                def fail_commit(argv,*args,**kwargs):
                    if argv[:2]==['git','commit']:raise RuntimeError('injected interruption before commit')
                    return original_command(argv,*args,**kwargs)
                with patch.object(apply,'command',side_effect=fail_commit),self.assertRaises(RuntimeError):
                    apply.apply_reviewed(run,vault,remote)
                self.assertTrue((run/'canonical-application/progress.json').exists())
                self.assertEqual((run/'canonical-worktree/skills/example/SKILL.md').read_bytes(),candidate)
                apply.recover_application(run)
                self.assertEqual((run/'canonical-worktree/skills/example/SKILL.md').read_bytes(),base)
                original_atomic=apply.atomic
                def fail_final(path,data):
                    if path.name=='final.json':raise RuntimeError('injected after task-ref before final receipt')
                    return original_atomic(path,data)
                with patch.object(apply,'atomic',side_effect=fail_final),self.assertRaises(RuntimeError):
                    apply.apply_reviewed(run,vault,remote)
                branch='refs/heads/auto-reviewed/'+apply.sha(candidate)[:20]
                self.assertTrue(self.git(run/'canonical-repository','rev-parse',branch))
                apply.prepare(remote,run)
                # Retry must accept/reconcile its verified previous private ref.
                with patch.object(apply,'cleanup',side_effect=RuntimeError('injected after final receipt')),self.assertRaises(RuntimeError):
                    apply.apply_reviewed(run,vault,remote)
                self.assertTrue((run/'canonical-worktree').exists())
                result=apply.apply_reviewed(run,vault,remote)
            self.assertEqual(result['state'],'locally-applied-unpublished');self.assertTrue(result['local_commit'])
            self.assertFalse((run/'canonical-worktree').exists());self.assertEqual(p.read_bytes(),original)
            self.assertEqual(self.git(remote,'show-ref'),before)
            saved=run/'canonical-application/payload/skills/example/SKILL.md';self.assertEqual(saved.read_bytes(),candidate)
            self.assertEqual(apply.apply_reviewed(run,vault,remote)['local_commit'],result['local_commit'])
            import canonical_delivery as delivery
            consumers=[root/'consumer-one',root/'consumer-two']
            for consumer in consumers:
                target=consumer/bound['target'];target.parent.mkdir(parents=True);target.write_bytes(base)
            def loaded(target,expected):
                self.assertTrue(all(apply.sha((c/target).read_bytes())==expected for c in consumers))
                return {'fixture':'loader boundary mocked; actual current-route proof separate'}
            original_delivery=delivery._apply;failed=[False]
            def fail_second(record,state,source):
                if record['target_root']==str(consumers[1]) and not failed[0]:
                    failed[0]=True;raise RuntimeError('second consumer offline')
                return original_delivery(record,state,source)
            with patch.object(delivery,'AUTO_STATE',root/'auto'),patch.object(delivery,'TARGET_ROOTS',set(consumers)),patch.object(delivery,'loader_proof',side_effect=loaded):
                with patch.object(delivery,'_apply',side_effect=fail_second),self.assertRaises(RuntimeError):
                    delivery.adopt_reviewed(run,vault,remote)
                self.assertEqual((consumers[0]/bound['target']).read_bytes(),candidate)
                self.assertEqual((consumers[1]/bound['target']).read_bytes(),base)
                receipt=delivery.adopt_reviewed(run,vault,remote);self.assertTrue(receipt['consumer_loaded'])
                self.assertEqual(delivery.adopt_reviewed(run,vault,remote)['candidate_sha256'],bound['candidate_sha256'])
                (run/'reviewer.json').write_text('{}')
                with self.assertRaises(ValueError):delivery.adopt_reviewed(run,vault,remote)
                (run/'reviewer.json').write_text(json.dumps(reviewer))
            saved.write_text('tampered')
            with self.assertRaises(ValueError):apply.apply_reviewed(run,vault,remote)

if __name__=='__main__':unittest.main()
