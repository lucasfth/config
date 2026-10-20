"""Local fixture tests. No Hermes imports, real vault, model or cron required."""
import ast
from datetime import date
from unittest.mock import patch
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

HERE = Path(__file__).parent
spec = importlib.util.spec_from_file_location('aar_learning', HERE / 'aar_learning.py')
learning = importlib.util.module_from_spec(spec)
spec.loader.exec_module(learning)


class LearningTests(unittest.TestCase):
    def fixture(self, root, day='2026-09-01', project='example/repo'):
        vault, state = root / 'vault', root / 'state'
        path = vault / f'projects/{project}/feature/slash/{day}.md'
        path.parent.mkdir(parents=True)
        path.write_text('---\nproject: example/repo\n---\n# Fixture AAR\n\n## What happened\nUnverified launch.\n')
        value = {'lessons': [{'text': 'Verify the loaded fixture.', 'coverage': 'unknown', 'evidence': 'line 7'}],
                 'open_items': ['Reconcile launch acceptance.']}
        return vault, state, path, value

    def test_distillation_approval_and_rejection(self):
        with tempfile.TemporaryDirectory() as tmp:
            vault, state, source, value = self.fixture(Path(tmp))
            before = source.read_bytes()
            result = learning.distil(vault, state, lambda prompt: value, date(2026, 10, 20))
            self.assertEqual(len(result['processed']), 1)
            identifier = result['processed'][0]
            self.assertEqual(source.read_bytes(), before)
            self.assertFalse((vault / 'tech/learning/general.md').exists())
            self.assertIn('UNAPPROVED', (vault / f'dreams/aar-learning/{identifier}.md').read_text())
            duplicate_calls = []
            self.assertEqual(learning.distil(vault, state, lambda prompt: duplicate_calls.append(prompt))['processed'], [])
            self.assertEqual(duplicate_calls, [])
            self.assertTrue((vault / f'dreams/aar-learning/{identifier}.diff.md').exists())
            with self.assertRaises(ValueError):
                learning.review(vault, state, identifier, 0, 'approved', 'fixture Lucas consent', 'other/project')
            learning.review(vault, state, identifier, 0, 'approved', 'fixture Lucas consent', 'example/repo')
            payload = learning.read_payload((vault / 'tech/learning/projects/example/repo.md').read_text())
            self.assertEqual(payload['entries'][0]['approved_by'], 'Lucas')
            self.assertEqual(payload['entries'][0]['source']['sha256'], learning.sha(before))
            self.assertFalse((vault / 'tech/learning/general.md').exists())
            with self.assertRaises(ValueError):
                learning.review(vault, state, identifier, 0, 'rejected', 'conflicting decision')
            source.write_text(source.read_text() + '\nEdited after review\n')
            with self.assertRaises(ValueError):
                learning.review_obligations(vault, state, identifier, [], 'fixture no obligations')

    def test_archive_gate_preserves_obligations_and_bytes(self):
        with tempfile.TemporaryDirectory() as tmp:
            vault, state, source, value = self.fixture(Path(tmp))
            before = source.read_bytes()
            identifier = learning.distil(vault, state, lambda _: value)['processed'][0]
            self.assertFalse(learning.archive_plan(vault, state)['eligible'])
            learning.review(vault, state, identifier, 0, 'rejected', 'fixture redundant')
            self.assertFalse(learning.archive_plan(vault, state)['eligible'])
            learning.review_obligations(vault, state, identifier, ['Still unverified.'], 'fixture reconciliation')
            plan = learning.archive_plan(vault, state, date(2026, 10, 20))
            self.assertEqual(len(plan['eligible']), 1)
            self.assertTrue(source.exists(), 'dry-run must not move sources')
            result = learning.archive(vault, state, date(2026, 10, 20))
            destination = vault / result['eligible'][0]['destination']
            self.assertFalse(source.exists())
            self.assertEqual(destination.read_bytes(), before)
            self.assertIn('Still unverified.', (vault / 'tech/learning/open-items.md').read_text())
            self.assertEqual(learning.archive(vault, state)['eligible'], [])
            self.assertEqual(learning.archive_plan(vault, state)['eligible'], [])
            self.assertEqual(destination.read_bytes(), before)

    def test_archive_interruption_keeps_source_and_allows_recovery(self):
        with tempfile.TemporaryDirectory() as tmp:
            vault, state, source, value = self.fixture(Path(tmp))
            identifier = learning.distil(vault, state, lambda _: value)['processed'][0]
            learning.review(vault, state, identifier, 0, 'covered', 'fixture existing rule')
            learning.review_obligations(vault, state, identifier, [], 'fixture explicitly none')
            def fail_after_link(*args):
                raise OSError('fixture persistence failure after link')
            with patch.object(learning, 'store_state', fail_after_link), self.assertRaises(OSError):
                learning.archive(vault, state)
            self.assertTrue(source.exists())
            self.assertEqual(len(list((vault / 'projects/_archive').rglob('*.md'))), 1)
            result = learning.archive(vault, state)
            self.assertFalse(source.exists(), 'identical orphan link must be recoverable')

    def test_scope_path_and_symlink_escape(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for scope in ['../repo', 'org/..', '/absolute', 'org/repo/other']:
                with self.subTest(scope=scope), self.assertRaises(ValueError):
                    learning.scope_path(scope)
            (root / 'tech').symlink_to(root.parent, target_is_directory=True)
            with self.assertRaises(ValueError):
                learning.safe(root, 'tech/learning/general.md')

    def test_model_output_cannot_self_approve_or_claim_existing_rule_missing(self):
        with tempfile.TemporaryDirectory() as tmp:
            vault, state, source, value = self.fixture(Path(tmp))
            value['lessons'][0]['approved_by'] = 'Lucas'
            result = learning.distil(vault, state, lambda _: value)
            self.assertEqual(result['processed'], [])
            self.assertFalse((vault / 'tech').exists())
            del value['lessons'][0]['approved_by']
            value['lessons'][0]['coverage'] = 'existing'
            identifier = learning.distil(vault, state, lambda _: value)['processed'][0]
            with self.assertRaises(ValueError):
                learning.review(vault, state, identifier, 0, 'approved', 'fixture approval', 'general')

    def test_model_helper_never_executes_module_setup_or_dream_main(self):
        with tempfile.TemporaryDirectory() as tmp:
            script = Path(tmp) / 'dream.py'
            script.write_text('raise AssertionError("module setup ran")\n'
                              'def main():\n    raise AssertionError("main ran")\n'
                              'def _deepseek_api_call(*args, **kwargs):\n'
                              '    return "{\\\"lessons\\\": [], \\\"open_items\\\": []}"\n')
            self.assertEqual(json.loads(learning.dream_model(script)('fixture')), {'lessons': [], 'open_items': []})

    def test_disabled_nightly_does_not_touch_vault_or_call_model(self):
        with tempfile.TemporaryDirectory() as tmp:
            config = Path(tmp) / 'config.json'
            config.write_text('{"enabled": false}')
            with patch.object(learning, 'distil', side_effect=AssertionError('unexpected distillation')):
                self.assertEqual(learning.nightly(config), {'state': 'disabled'})
            self.assertEqual(list(Path(tmp).iterdir()), [config])

    def test_nightly_generates_candidates_and_archives_only_after_opt_in(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            vault, state, source, value = self.fixture(root)
            config = root / 'config.json'
            settings = {'enabled': True, 'vault': str(vault), 'state': str(state), 'dream_script': str(root / 'unused.py')}
            config.write_text(json.dumps(settings))
            with patch.object(learning, 'dream_model', return_value=lambda _: value):
                result = learning.nightly(config)
                identifier = result['processed'][0]
                learning.review(vault, state, identifier, 0, 'covered', 'fixture existing')
                learning.review_obligations(vault, state, identifier, [], 'fixture none')
                result = learning.nightly(config)
                self.assertTrue(source.exists(), 'archive defaults to planning only')
                self.assertEqual(len(result['archive_plan']['eligible']), 1)
                settings['archive_enabled'] = True
                config.write_text(json.dumps(settings))
                result = learning.nightly(config)
                self.assertTrue(result['archive_result']['applied'])
                self.assertFalse(source.exists())

    def test_archive_recovers_after_unlink_before_final_state_save(self):
        with tempfile.TemporaryDirectory() as tmp:
            vault, state, source, value = self.fixture(Path(tmp))
            identifier = learning.distil(vault, state, lambda _: value)['processed'][0]
            learning.review(vault, state, identifier, 0, 'covered', 'fixture existing')
            learning.review_obligations(vault, state, identifier, [], 'fixture reviewed none')
            real_store = learning.store_state
            calls = []
            def fail_final(state_dir, ledger):
                calls.append(1)
                if len(calls) == 2:
                    raise OSError('fixture final state save failed')
                real_store(state_dir, ledger)
            with patch.object(learning, 'store_state', fail_final), self.assertRaises(OSError):
                learning.archive(vault, state)
            self.assertFalse(source.exists())
            destination = next((vault / 'projects/_archive').rglob('*.md'))
            before = destination.read_bytes()
            learning.archive(vault, state)
            ledger = learning.load_state(state)
            self.assertEqual(ledger['archives'][source.relative_to(vault).as_posix()]['state'], 'archived')
            self.assertEqual(destination.read_bytes(), before)

    def test_age_edit_collision_and_symlink_archive_gates(self):
        with tempfile.TemporaryDirectory() as tmp:
            vault, state, source, value = self.fixture(Path(tmp), day='2026-10-19')
            identifier = learning.distil(vault, state, lambda _: value, date(2026, 10, 20))['processed'][0]
            learning.review(vault, state, identifier, 0, 'covered', 'fixture covered')
            learning.review_obligations(vault, state, identifier, [], 'fixture none')
            self.assertFalse(learning.archive_plan(vault, state, date(2026, 10, 20))['eligible'])
            raw = source.read_bytes()
            source.write_bytes(raw + b'changed')
            self.assertFalse(learning.archive_plan(vault, state, date(2026, 12, 20))['eligible'])
            source.write_bytes(raw)
            destination = vault / ('projects/_archive/' + source.relative_to(vault / 'projects').as_posix())
            destination.parent.mkdir(parents=True)
            destination.write_bytes(raw)  # Identical bytes, different inode: not our recoverable link.
            self.assertFalse(learning.archive_plan(vault, state, date(2026, 12, 20))['eligible'])
            self.assertTrue(source.exists())

    def test_obligations_write_failure_prevents_archive_eligibility(self):
        with tempfile.TemporaryDirectory() as tmp:
            vault, state, source, value = self.fixture(Path(tmp))
            identifier = learning.distil(vault, state, lambda _: value)['processed'][0]
            learning.review(vault, state, identifier, 0, 'covered', 'fixture covered')
            real_save = learning.save
            def fail_obligations(path, text):
                if path.name == 'open-items.md':
                    raise OSError('fixture note save failed')
                return real_save(path, text)
            with patch.object(learning, 'save', fail_obligations), self.assertRaises(OSError):
                learning.review_obligations(vault, state, identifier, ['Must survive.'], 'fixture review')
            self.assertIsNone(learning.load_state(state)['records'][identifier]['obligations_review'])
            self.assertFalse(learning.archive_plan(vault, state)['eligible'])

    def test_approval_refuses_startup_budget_without_writes(self):
        with tempfile.TemporaryDirectory() as tmp:
            vault, state, source, value = self.fixture(Path(tmp))
            identifier = learning.distil(vault, state, lambda _: value)['processed'][0]
            target = vault / 'tech/learning/general.md'
            target.parent.mkdir(parents=True)
            entry = {'id': 'existing', 'text': 'x' * 1500, 'approved_by': 'Lucas',
                     'approved_at': '2026-10-20', 'approval_reference': 'fixture prior approval',
                     'source': learning.load_state(state)['records'][identifier]['source']}
            entries = [{**entry, 'id': str(i)} for i in range(5)]
            target.write_text(learning.note('Approved supplemental learning', 'agent-config',
                              '```json\n' + json.dumps({'schema': 1, 'scope': 'general', 'entries': entries}) + '\n```', date(2026, 10, 20)))
            before_note, before_ledger = target.read_bytes(), (state / 'aar-learning.json').read_bytes()
            with self.assertRaisesRegex(ValueError, 'budget'):
                learning.review(vault, state, identifier, 0, 'approved', 'fixture approval', 'general')
            self.assertEqual(target.read_bytes(), before_note)
            self.assertEqual((state / 'aar-learning.json').read_bytes(), before_ledger)

    def test_twenty_first_entry_refused_and_existing_approval_retry_is_idempotent(self):
        with tempfile.TemporaryDirectory() as tmp:
            vault, state, source, value = self.fixture(Path(tmp))
            identifier = learning.distil(vault, state, lambda _: value)['processed'][0]
            learning.review(vault, state, identifier, 0, 'approved', 'fixture approval', 'general')
            target = vault / 'tech/learning/general.md'
            payload = learning.read_payload(target.read_text())
            entry = payload['entries'][0]
            payload['entries'] = [{**entry, 'id': str(i), 'text': 'short'} for i in range(20)]
            target.write_text(learning.note('Approved supplemental learning', 'agent-config',
                              '```json\n' + json.dumps(payload) + '\n```', date(2026, 10, 20)))
            before = target.read_bytes()
            with self.assertRaisesRegex(ValueError, 'budget'):
                learning.review(vault, state, identifier, 0, 'approved', 'fixture approval', 'general')
            self.assertEqual(target.read_bytes(), before)

    def test_candidate_diff_never_rewrites_existing_guidance(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            target = root / 'tech/030-Coding-Style.md'
            target.parent.mkdir()
            target.write_text('---\ntype: agent-config\n---\n# Coding\n\nExisting rule.\n')
            original = target.read_bytes()
            proposal = 'Report skipped integration suites as unverified.'
            diff = learning.guidance_diff(target.read_text(), proposal, 'tech/030-Coding-Style.md')
            self.assertIn('+Report skipped integration suites as unverified.', diff)
            self.assertEqual(target.read_bytes(), original)
            self.assertFalse((root / 'tech/learning/general.md').exists())


def budget_fixture():
    with tempfile.TemporaryDirectory() as tmp:
        vault, state, source, value = LearningTests().fixture(Path(tmp))
        source_info, _ = learning.read_source(vault, source.relative_to(vault).as_posix())
        entry = {'id': 'existing', 'text': '😀' + 'x' * 1497, 'approved_by': 'Lucas',
                 'approved_at': '2026-10-20', 'approval_reference': 'fixture prior approval',
                 'source': source_info}
        entries = [{**entry, 'id': str(i)} for i in range(4)]
        proposed = {**entry, 'id': 'boundary', 'text': ''}
        def rendered(items):
            return '## Approved supplemental learning — general\n\n' + '\n\n'.join(
                f"- {e['text']}\n  Approval: Lucas, {e['approved_at']}. Source: {e['source']['path']} ({e['source']['sha256']})."
                for e in items)
        units = lambda text: len(text.encode('utf-16-le')) // 2
        empty_units = units(rendered(entries + [proposed]))
        solved = 8000 - empty_units
        assert 1 <= solved < 1500
        proposed['text'] = 'BOUNDARY_ACCEPTED' + 'z' * (solved - len('BOUNDARY_ACCEPTED'))
        final_units = units(rendered(entries + [proposed]))
        assert final_units == 8000
        target = vault / 'tech/learning/general.md'
        target.parent.mkdir(parents=True)
        target.write_text(learning.note('Fixture', 'agent-config', '```json\n' +
                          json.dumps({'schema': 1, 'scope': 'general', 'entries': entries}) + '\n```', date(2026, 10, 20)))
        # Both boundary candidates use normal distillation; only existing guidance is seeded.
        value['lessons'] = [{**value['lessons'][0], 'text': proposed['text'] + 'x'},
                            {**value['lessons'][0], 'text': proposed['text']}]
        identifier = learning.distil(vault, state, lambda _: value)['processed'][0]
        note_before, state_before = target.read_bytes(), (state / 'aar-learning.json').read_bytes()
        rejected = False
        try:
            learning.review(vault, state, identifier, 0, 'approved', 'fixture boundary approval', 'general', date(2026, 10, 20))
        except ValueError as error:
            assert 'budget' in str(error)
            rejected = True
        assert rejected and target.read_bytes() == note_before and (state / 'aar-learning.json').read_bytes() == state_before
        learning.review(vault, state, identifier, 1, 'approved', 'fixture boundary approval', 'general', date(2026, 10, 20))
        return {'note': target.read_text(), 'texts': [e['text'] for e in entries] + [proposed['text']],
                'overflowRejected': rejected, 'emptyUnits': empty_units, 'solvedTextUnits': solved, 'finalUnits': final_units}


if __name__ == '__main__':
    import sys
    if sys.argv[1:] == ['--budget-fixture']:
        print(json.dumps(budget_fixture()))
    else:
        unittest.main()
