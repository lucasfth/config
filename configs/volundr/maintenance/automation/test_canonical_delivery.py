"""Scoped payload CAS test; fixture roots only, no model/provider calls."""
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
import canonical_delivery as delivery

sha=lambda b:hashlib.sha256(b).hexdigest()

class CanonicalDeliveryTests(unittest.TestCase):
    def test_unapproved_roots_fail_before_state_creation(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);p=root/'review.txt';p.write_text('review')
            record={'scope':'local-canonical-payload-delivery','source_root':str(root/'unapproved'),'target_root':str(root/'target'),'review_evidence_path':str(p),'review_evidence_sha256':sha(p.read_bytes()),'files':{}}
            with self.assertRaisesRegex(ValueError,'root'):delivery.apply(record,root/'state')
            self.assertFalse((root/'state').exists())

    def evidence(self,record,root):
        p=root/'review.txt';p.write_text('Fixture engineering review only, not production approval.')
        record['review_evidence_path']=str(p);record['review_evidence_sha256']=sha(p.read_bytes())
        from unittest.mock import patch
        for name,value in [('SOURCE_ROOT',Path(record['source_root'])),('TARGET_ROOTS',{Path(record['target_root'])})]:
            mock=patch.object(delivery,name,value);mock.start();self.addCleanup(mock.stop)
        return record

    def test_exact_reviewed_package_cas_idempotence_and_preservation(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);source=root/'source';target=root/'target';state=root/'state'
            names=['skills/improvement-loop-audit/SKILL.md','skills/improvement-loop-audit/references/evidence-map.md']
            for n in names:
                p=source/n;p.parent.mkdir(parents=True,exist_ok=True);p.write_text('reviewed '+n)
            base=target/names[0];base.parent.mkdir(parents=True);base.write_text('old guide')
            other=target/'skills/other/SKILL.md';other.parent.mkdir(parents=True);other.write_text('other actor')
            record={'scope':'local-canonical-payload-delivery','source_root':str(source),'target_root':str(target),'review_evidence_sha256':'fixture',
                'files':{n:{'before':sha((target/n).read_bytes()) if (target/n).exists() else None,'after':sha((source/n).read_bytes())} for n in names}}
            self.evidence(record,root)
            receipt=delivery.apply(record,state);self.assertEqual(receipt['state'],'locally-delivered-unpublished')
            self.assertEqual(delivery.apply(record,state)['files'],receipt['files'])
            self.assertEqual(other.read_text(),'other actor')
            (source/names[0]).write_text('changed after review')
            with self.assertRaises(ValueError):delivery.apply(record,state)
            self.assertEqual(base.read_text(),'reviewed '+names[0])
            (source/names[0]).write_text('reviewed '+names[0])
            (root/'review.txt').write_text('mutated provenance')
            with self.assertRaises(ValueError):delivery.apply(record,state)

    def test_concurrent_target_and_failure_roll_back_only_owned_paths(self):
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);s=root/'s';t=root/'t';n='skills/improvement-loop-audit/SKILL.md'
            for base,text in [(s,'new'),(t,'old')]:p=base/n;p.parent.mkdir(parents=True);p.write_text(text)
            r={'scope':'local-canonical-payload-delivery','source_root':str(s),'target_root':str(t),'review_evidence_sha256':'fixture','files':{n:{'before':sha(b'old'),'after':sha(b'new')}}}
            self.evidence(r,root)
            (t/n).write_text('other');
            with self.assertRaises(ValueError):delivery.apply(r,root/'state')
            self.assertEqual((t/n).read_text(),'other')

    def test_second_payload_failure_rolls_back_and_journal_recovers(self):
        from unittest.mock import patch
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);s=root/'s';t=root/'t';state=root/'state'
            names=['skills/improvement-loop-audit/SKILL.md','skills/improvement-loop-audit/references/evidence-map.md']
            for n in names:
                for base,text in [(s,'new '+n),(t,'old '+n)]:
                    p=base/n;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(text)
            r={'scope':'local-canonical-payload-delivery','source_root':str(s),'target_root':str(t),'review_evidence_sha256':'fixture','files':{n:{'before':sha((t/n).read_bytes()),'after':sha((s/n).read_bytes())} for n in names}}
            self.evidence(r,root)
            original=delivery.atomic;interrupted=[False]
            def fail_second(path,data):
                if path==t/names[1] and not interrupted[0]:
                    interrupted[0]=True;raise RuntimeError('second payload write interrupted')
                original(path,data)
            with patch.object(delivery,'atomic',side_effect=fail_second),self.assertRaises(RuntimeError):
                delivery.apply(r,state)
            self.assertEqual((t/names[0]).read_text(),'old '+names[0]);self.assertEqual((t/names[1]).read_text(),'old '+names[1])
            self.assertFalse((state/'journal.json').exists())
            interrupted[0]=False
            with patch.object(delivery,'atomic',side_effect=fail_second),patch.object(delivery,'rollback',side_effect=RuntimeError('process ended')),self.assertRaises(RuntimeError):
                delivery.apply(r,state)
            self.assertTrue((state/'journal.json').exists());self.assertEqual((t/names[0]).read_text(),'new '+names[0])
            result=delivery.apply(r,state);self.assertEqual(result['state'],'locally-delivered-unpublished')
            self.assertFalse((state/'journal.json').exists());self.assertEqual(delivery.apply(r,state),result)

if __name__=='__main__':unittest.main()
