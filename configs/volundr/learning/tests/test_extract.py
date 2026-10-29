"""Candidate-only extraction; all writes stay outside the fixture vault."""
from datetime import date
from pathlib import Path
import json
import tempfile
import unittest
from unittest.mock import patch
from learning import extract as learning


class LearningTests(unittest.TestCase):
    def fixture(self, root, day='2026-10-28', project='example/repo', text='Observed failure.'):
        vault, state = root / 'vault', root / 'state'
        source = vault / f'projects/{project}/main/{day}.md'
        source.parent.mkdir(parents=True, exist_ok=True)
        source.write_text('# Fixture AAR\n\n' + text + '\n')
        value = {'lessons': [{'text': 'Check downstream results.', 'coverage': 'unknown',
            'evidence': 'line 3'}], 'open_items': []}
        return vault, state, source, value

    def test_candidate_only_external_artifacts_and_idempotence(self):
        with tempfile.TemporaryDirectory() as tmp:
            vault, state, source, value = self.fixture(Path(tmp))
            before = source.read_bytes()
            result = learning.distil(vault, state, lambda _: value, date(2026, 10, 29))
            self.assertEqual(len(result['processed']), 1)
            identifier = result['processed'][0]
            artifact = state / 'candidates' / (identifier + '.md')
            self.assertIn('UNAPPROVED', artifact.read_text())
            self.assertIn('title:', artifact.read_text())
            self.assertFalse((vault / 'dreams').exists())
            self.assertFalse((vault / 'tech').exists())
            self.assertEqual(source.read_bytes(), before)
            self.assertEqual(learning.distil(vault, state, lambda _: self.fail('duplicate call'),
                date(2026, 10, 29))['processed'], [])

    def test_recent_first_with_one_oldest_backlog_slot(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            vault, state, _, value = self.fixture(root, '2026-07-01', 'aaa/old')
            for day in range(1, 11):
                self.fixture(root, f'2026-10-{day:02}', 'zzz/new', f'incident {day}')
            result = learning.distil(vault, state, lambda _: value, date(2026, 10, 29))
            records = learning.load_state(state)['records']
            dates = [records[i]['source']['date'] for i in result['processed']]
            self.assertEqual(dates, ['2026-10-10','2026-10-09','2026-10-08','2026-10-07',
                                    '2026-10-06','2026-10-05','2026-10-04','2026-07-01'])

    def test_skips_separate_from_real_errors_and_model_attempts_bounded(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            vault, state, _, _ = self.fixture(root)
            for day in range(1, 12):
                self.fixture(root, f'2026-10-{day:02}')
            self.fixture(root, '2026-09-01', 'example/contracts')
            _, _, ordinary, _ = self.fixture(root, '2026-09-02')
            ordinary.write_text('# Ordinary note\n')
            _, _, huge, _ = self.fixture(root, '2026-09-03')
            huge.write_text('# AAR\n' + 'x' * learning.MAX_SOURCE)
            calls = []
            def broken(_):
                calls.append(1)
                return '{invalid'
            result = learning.distil(vault, state, broken, date(2026, 10, 29))
            self.assertEqual(len(calls), learning.MAX_NOTES)
            self.assertEqual(len(result['skipped']), 2)
            self.assertEqual(len(result['errors']), learning.MAX_NOTES + 1)
            self.assertEqual(result['status'], 'partial-failure')
            self.assertFalse((vault / 'tech').exists())

    def test_invalid_or_stale_model_output_never_writes_candidate(self):
        with tempfile.TemporaryDirectory() as tmp:
            vault, state, source, value = self.fixture(Path(tmp))
            invalid = {**value, 'approved_by': 'Lucas'}
            self.assertEqual(learning.distil(vault, state, lambda _: invalid)['processed'], [])
            def racing(_):
                source.write_text(source.read_text() + 'Changed\n')
                return value
            self.assertEqual(learning.distil(vault, state, racing)['processed'], [])
            self.assertFalse((state / 'candidates').exists())

    def test_sensitive_paths_symlinks_and_internal_state_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            vault, state, source, value = self.fixture(Path(tmp))
            with self.assertRaises(ValueError):
                learning.distil(vault, vault / 'state', lambda _: value)
            for path in ['../outside', '/absolute']:
                with self.assertRaises(ValueError):
                    learning.safe(vault, path)
            (vault / 'link').symlink_to(state)
            with self.assertRaises(ValueError):
                learning.safe(vault, 'link/note.md')
            self.assertFalse(learning.session_path('projects/EcoRay/klaus-perspective/main/2026-10-28.md'))
            self.assertFalse(learning.session_path('projects/example/salary/main/2026-10-28.md'))

    def test_legacy_records_import_without_guidance_or_archival(self):
        with tempfile.TemporaryDirectory() as tmp:
            vault, state, source, value = self.fixture(Path(tmp))
            info, _ = learning.read_source(vault, source.relative_to(vault).as_posix())
            record = learning.proposal_record(info, value)
            record['dispositions'] = {'0': {'decision': 'approved', 'reference': 'historic'}}
            learning.store_state(state, {'schema': 1, 'records': {record['id']: record}, 'archives': {}})
            self.assertEqual(learning.distil(vault, state, lambda _: self.fail('duplicate'))['processed'], [])
            self.assertTrue(source.exists())
            self.assertEqual(learning.load_state(state)['records'][record['id']]['dispositions'], record['dispositions'])

    def test_disabled_and_legacy_archive_configuration_fail_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            config = root / 'config.json'
            config.write_text('{"enabled": false}')
            self.assertEqual(learning.nightly(config), {'state': 'disabled'})
            config.write_text(json.dumps({'enabled': True, 'archive_enabled': True}))
            with self.assertRaisesRegex(ValueError, 'archiv'):
                learning.nightly(config)
            self.assertFalse((root / 'state').exists())

    def test_provider_helper_does_not_execute_dream_module(self):
        with tempfile.TemporaryDirectory() as tmp:
            script = Path(tmp) / 'dream.py'
            script.write_text('raise AssertionError("module setup ran")\n'
                'def _deepseek_api_call(*args, **kwargs):\n'
                '    assert urllib.request.Request("https://fixture.invalid").get_method() == "GET"\n'
                '    return "provider available"\n')
            self.assertEqual(learning.dream_model(script)('fixture'), 'provider available')

    def test_nightly_returns_honest_candidate_status_without_archive_plan(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            vault, state, _, value = self.fixture(root)
            config = root / 'config.json'
            config.write_text(json.dumps({'enabled': True, 'archive_enabled': False,
                'vault': str(vault), 'state': str(state), 'dream_script': str(root/'unused.py')}))
            with patch.object(learning, 'dream_model', return_value=lambda _: value):
                result = learning.nightly(config)
            self.assertEqual(result['status'], 'complete')
            self.assertFalse(result['guidance_applied'])
            self.assertFalse(result['skills_changed'])
            self.assertNotIn('archive_plan', result)


if __name__ == '__main__':
    unittest.main()
