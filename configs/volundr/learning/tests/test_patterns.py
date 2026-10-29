"""Evidence routing fixtures: no live vault, models, publication or skill writes."""
from datetime import date
import json
from pathlib import Path
import tempfile
import unittest

from learning import extract as learning
from learning import patterns


class PatternTests(unittest.TestCase):
    def fixture(self, root, day='2026-10-28', text='The report said success despite a failed write.'):
        vault, state = root / 'vault', root / 'state'
        path = vault / f'projects/example/repo/main/{day}.md'
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text('# Fixture AAR\n\n' + text + '\n')
        source, _ = learning.read_source(vault, path.relative_to(vault).as_posix())
        record = learning.proposal_record(source, {'lessons': [{'text': 'Check downstream writes.',
            'coverage': 'unknown', 'evidence': 'line 3'}], 'open_items': []})
        ledger = learning.load_state(state)
        ledger['records'][record['id']] = record
        learning.store_state(state, ledger)
        finding = {'record_id': record['id'], 'lesson_index': 0, 'quote': text,
            'incident': 'incident-' + day, 'pattern': 'scheduler-only-success',
            'workflow': 'nightly-audit', 'system': 'job-reporting',
            'diagnosis': 'missing-procedure', 'target': 'skills/cron-audit/SKILL.md',
            'coverage_quote': '# Cron audit', 'reference': 'Fixture operator triage'}
        skills = root / 'skills-repo'
        target = skills / finding['target']
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text('# Cron audit\nCheck execution.\n')
        return vault, state, skills, finding, path

    def test_independent_incidents_qualify_but_copied_incident_does_not(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            vault, state, skills, first, _ = self.fixture(root)
            _, _, _, second, _ = self.fixture(root, '2026-10-29',
                'A separate job reported success while its delivery failed.')
            # Incident identity is reviewed, never inferred from the number of notes.
            second['incident'] = first['incident']
            report = patterns.assess(vault, state, skills, [first, second])
            self.assertEqual(report['patterns'][0]['independent_incidents'], 1)
            self.assertEqual(report['patterns'][0]['status'], 'watch')
            second['incident'] = 'separate-observed-incident'
            report = patterns.assess(vault, state, skills, [first, second])
            self.assertEqual(report['patterns'][0]['status'], 'review-ready')
            self.assertEqual(report, patterns.assess(vault, state, skills, [first, second]))

    def test_stale_source_and_invented_evidence_fail_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            vault, state, skills, finding, path = self.fixture(Path(tmp))
            for replacement in [{**finding, 'quote': 'invented'}, {**finding, 'approved_by': 'Lucas'}]:
                with self.assertRaises(ValueError):
                    patterns.assess(vault, state, skills, [replacement])
            path.write_text(path.read_text() + 'new evidence\n')
            with self.assertRaisesRegex(ValueError, 'Source changed'):
                patterns.assess(vault, state, skills, [finding])

    def test_existing_coverage_routes_to_enforcement_not_another_rule(self):
        with tempfile.TemporaryDirectory() as tmp:
            vault, state, skills, finding, _ = self.fixture(Path(tmp))
            ledger = learning.load_state(state)
            ledger['records'][finding['record_id']]['lessons'][0]['coverage'] = 'existing'
            learning.store_state(state, ledger)
            with self.assertRaisesRegex(ValueError, 'covered'):
                patterns.assess(vault, state, skills, [finding])
            finding['diagnosis'] = 'enforcement'
            report = patterns.assess(vault, state, skills, [finding])
            self.assertEqual(report['patterns'][0]['route'], 'enforcement-review')

    def test_target_quote_and_path_checked_and_duplicate_observation_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            vault, state, skills, finding, _ = self.fixture(Path(tmp))
            for key, value in [('target', '../escape'), ('coverage_quote', 'missing'),
                               ('reference', ''), ('diagnosis', 'auto-approve')]:
                with self.subTest(key=key), self.assertRaises(ValueError):
                    patterns.assess(vault, state, skills, [{**finding, key: value}])
            with self.assertRaisesRegex(ValueError, 'Duplicate'):
                patterns.assess(vault, state, skills, [finding, finding])

    def test_overlapping_copy_groups_count_as_one_incident(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            vault, state, skills, first, _ = self.fixture(root)
            _, _, _, duplicate, _ = self.fixture(root, '2026-10-29')
            duplicate['incident'] = 'different-label-same-bytes'
            _, _, _, continuation, _ = self.fixture(root, '2026-10-27', 'A second account of the same incident.')
            continuation['incident'] = first['incident']
            group = patterns.assess(vault, state, skills, [first, duplicate, continuation])['patterns'][0]
            self.assertEqual(group['independent_incidents'], 1)

    def test_changed_skill_invalidates_prior_binding(self):
        with tempfile.TemporaryDirectory() as tmp:
            vault, state, skills, finding, _ = self.fixture(Path(tmp))
            first = patterns.assess(vault, state, skills, [finding])
            (skills / finding['target']).write_text('# Cron audit\nChanged rule.\n')
            second = patterns.assess(vault, state, skills, [finding])
            self.assertNotEqual(first['patterns'][0]['binding'], second['patterns'][0]['binding'])


if __name__ == '__main__':
    unittest.main()
