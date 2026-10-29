"""A complete offline reviewed cycle, with immutable receipts and no model calls."""
from datetime import date
import json
from pathlib import Path
import tempfile
import unittest
from learning import cycle, extract


class CycleTests(unittest.TestCase):
    def fixture(self, root):
        vault, state, skills = root/'vault', root/'state', root/'skills'
        target = 'skills/fixture-audit/SKILL.md'
        body = '---\nname: fixture-audit\ndescription: Audit fixture jobs.\n---\n# Audit\nCheck execution.\n'
        (skills/target).parent.mkdir(parents=True)
        (skills/target).write_text(body)
        findings = []
        for day, text in [('2026-10-28','Write failed.'), ('2026-10-29','Delivery failed.')]:
            relative = f'projects/example/repo/main/{day}.md'
            source = vault/relative; source.parent.mkdir(parents=True, exist_ok=True)
            source.write_text('# Fixture AAR\n\n'+text+'\n')
        proposal = {'lessons':[{'text':'Verify downstream.', 'coverage':'unknown','evidence':'line 3'}],'open_items':[]}
        extract.distil(vault, state, lambda _: proposal, date(2026,10,29))
        for record in extract.load_state(state)['records'].values():
            findings.append({'record_id':record['id'], 'lesson_index':0, 'quote':(vault/record['source']['path']).read_text().splitlines()[2],
                'incident':record['source']['date'], 'pattern':'false-success', 'workflow':'audit',
                'system':'scheduler','diagnosis':'missing-procedure','target':target,
                'coverage_quote':'Check execution.', 'reference':'Explicit fixture review'})
        candidate = root/'candidate.md'; candidate.write_text(body+'Check downstream writes.\n')
        return vault,state,skills,findings,{target:str(candidate)}

    def test_cycle_produces_fresh_pattern_packet_and_redacted_digest_idempotently(self):
        with tempfile.TemporaryDirectory() as tmp:
            vault,state,skills,findings,candidates=self.fixture(Path(tmp))
            original=(skills/next(iter(candidates))).read_bytes()
            result=cycle.run(vault,state,skills,findings,candidates)
            self.assertEqual(result['summary']['review_ready'],1)
            self.assertEqual(result['summary']['packets'],1)
            self.assertEqual(result['summary']['state'],'awaiting-evaluation-and-review')
            self.assertFalse(result['summary']['publication_authorized'])
            self.assertNotIn('fixture-audit',json.dumps(result['summary']))
            receipt=state/'cycles'/f"{result['receipt_sha256']}.json"
            before=receipt.read_bytes()
            self.assertEqual(cycle.run(vault,state,skills,findings,candidates),result)
            self.assertEqual(receipt.read_bytes(),before)
            self.assertEqual((skills/next(iter(candidates))).read_bytes(),original)
            self.assertFalse((vault/'tech').exists())

    def test_stale_evidence_fails_without_overwriting_last_good_receipt(self):
        with tempfile.TemporaryDirectory() as tmp:
            vault,state,skills,findings,candidates=self.fixture(Path(tmp))
            cycle.run(vault,state,skills,findings,candidates)
            marker=state/'last-cycle.json';before=marker.read_bytes()
            source=vault/extract.load_state(state)['records'][findings[0]['record_id']]['source']['path']
            source.write_text(source.read_text()+'Changed\n')
            with self.assertRaisesRegex(ValueError,'Source changed'):
                cycle.run(vault,state,skills,findings,candidates)
            self.assertEqual(marker.read_bytes(),before)

    def test_unmatched_candidate_and_internal_state_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            vault,state,skills,findings,candidates=self.fixture(Path(tmp))
            for supplied in [{**candidates,'skills/unknown/SKILL.md':next(iter(candidates.values()))}]:
                with self.assertRaisesRegex(ValueError,'Unmatched'):
                    cycle.run(vault,state,skills,findings,supplied)
            with self.assertRaisesRegex(ValueError,'outside'):
                cycle.run(vault,vault/'state',skills,[],{})

    def test_digest_does_not_claim_unprovided_patch_or_complete_learning(self):
        with tempfile.TemporaryDirectory() as tmp:
            vault,state,skills,findings,_=self.fixture(Path(tmp))
            result=cycle.run(vault,state,skills,findings,{})
            self.assertEqual(result['summary']['packets'],0)
            self.assertEqual(result['summary']['state'],'awaiting-patch-review')
            self.assertFalse(result['summary']['skills_changed'])


class DiagnosisDigestTests(unittest.TestCase):
    def test_covered_recurring_failure_waits_for_diagnosis_not_patch(self):
        with tempfile.TemporaryDirectory() as tmp:
            vault,state,skills,findings,_=CycleTests().fixture(Path(tmp))
            ledger=extract.load_state(state)
            for record in ledger['records'].values(): record['lessons'][0]['coverage']='existing'
            extract.store_state(state,ledger)
            for finding in findings: finding['diagnosis']='enforcement'
            summary=cycle.run(vault,state,skills,findings,{})['summary']
            self.assertEqual(summary['state'],'awaiting-diagnosis-review')
            self.assertEqual(summary['routes'],{'enforcement-review':1})
            self.assertEqual(summary['packets'],0)

if __name__ == '__main__': unittest.main()
