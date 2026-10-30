"""Oversized inputs are durable review work, never truncated model input."""
import contextlib
from datetime import date
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from learning import cron, extract


class DeferredTests(unittest.TestCase):
    def fixture(self, root, text):
        vault, state = root / 'vault', root / 'state'
        source = vault / 'projects/example/repo/main/2026-10-28.md'
        source.parent.mkdir(parents=True)
        source.write_text(text)
        return vault, state, source

    def test_both_size_guards_persist_full_hash_without_candidates_or_ledger_changes(self):
        for text in ['# AAR\n' + 'x' * extract.MAX_SOURCE,
                     '# AAR\n' + 'x' * (extract.MAX_SOURCE * 4)]:
            with self.subTest(size=len(text)), tempfile.TemporaryDirectory() as tmp:
                vault, state, source = self.fixture(Path(tmp), text)
                raw = source.read_bytes()
                ledger = {'schema': 1, 'records': {}, 'archives': {'legacy': 'preserved'}}
                extract.store_state(state, ledger)
                before = (state / 'aar-learning.json').read_bytes()
                # Neither oversized guard may reread the source unboundedly.
                with patch.object(Path, 'read_bytes', side_effect=AssertionError('unbounded read')) if len(raw) > extract.MAX_SOURCE * 4 else contextlib.nullcontext():
                    result = extract.distil(vault, state, lambda _: self.fail('oversized model call'))
                self.assertEqual(result['errors'], [])
                self.assertEqual(result['status'], 'manual-review-required')
                self.assertEqual(len(result['deferred']), 1)
                entry = result['deferred'][0]
                self.assertEqual(entry['source']['sha256'], extract.sha(raw))
                self.assertEqual(entry['source']['bytes'], len(raw))
                queue_path = state / 'manual-review.json'
                queue_bytes = queue_path.read_bytes()
                queue = json.loads(queue_bytes)
                self.assertEqual(list(queue['records'].values()), [entry])
                self.assertNotIn('x' * 100, queue_bytes.decode())
                again = extract.distil(vault, state, lambda _: self.fail('duplicate model call'))
                self.assertEqual(again['deferred'], result['deferred'])
                self.assertEqual(queue_path.read_bytes(), queue_bytes)
                self.assertEqual((state / 'aar-learning.json').read_bytes(), before)
                self.assertEqual(source.read_bytes(), raw)
                self.assertFalse((state / 'candidates').exists())
                self.assertFalse(result['guidance_applied'])
                self.assertFalse(result['skills_changed'])
                self.assertNotIn('archive_plan', result)

    def test_changed_versions_retained_and_bounded_revision_reenters_processing(self):
        with tempfile.TemporaryDirectory() as tmp:
            vault, state, source = self.fixture(Path(tmp), '# AAR\n' + 'x' * extract.MAX_SOURCE)
            first = extract.distil(vault, state, lambda _: self.fail('oversized'))
            source.write_text(source.read_text()[:-1] + 'y')
            second = extract.distil(vault, state, lambda _: self.fail('oversized'))
            self.assertNotEqual(first['deferred'][0]['id'], second['deferred'][0]['id'])
            self.assertEqual(len(json.loads((state / 'manual-review.json').read_text())['records']), 2)
            source.write_text('# AAR\n' + 'z' * (extract.MAX_SOURCE - 6))
            prompts = []
            def model(prompt):
                prompts.append(prompt)
                return {'lessons': [], 'open_items': []}
            result = extract.distil(vault, state, model, date(2026, 10, 29))
            self.assertEqual(len(result['processed']), 1)
            self.assertEqual(result['deferred'], [])
            self.assertEqual(result['status'], 'complete')
            self.assertTrue(prompts[0].endswith('z' * (extract.MAX_SOURCE - 6)))
            self.assertEqual(extract.distil(vault, state, lambda _: self.fail('duplicate'))['processed'], [])

    def test_installed_cron_provider_failure_remains_nonzero_with_deferred_work(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            vault, state, _ = self.fixture(root, '# AAR\n' + 'x' * extract.MAX_SOURCE)
            (vault / 'projects/example/repo/main/2026-10-27.md').write_text('# AAR\nNormal source\n')
            script = root / 'provider.py'
            script.write_text('def _deepseek_api_call(*args, **kwargs):\n    return "ERROR: fixture provider failure"\n')
            config = root / 'config.json'
            config.write_text(json.dumps({'enabled': True, 'archive_enabled': False,
                'vault': str(vault), 'state': str(state), 'dream_script': str(script)}))
            for _ in range(2):
                with contextlib.redirect_stdout(io.StringIO()) as output:
                    self.assertEqual(cron.run(config), 1)
                summary = json.loads(output.getvalue())
                self.assertEqual(summary['state'], 'partial-failure')
                self.assertEqual(summary['errors'], 1)
                self.assertEqual(summary['deferred'], 1)
                self.assertNotIn(str(root), output.getvalue())
                self.assertNotIn('fixture provider', output.getvalue())
                pointer = json.loads((state / 'last-run.json').read_text())
                receipt = json.loads((state / pointer['receipt']).read_text())
                self.assertEqual(receipt['result']['errors'][0]['error'], 'Distillation provider failed')
                self.assertEqual(len(receipt['result']['deferred']), 1)
            self.assertFalse((state / 'candidates').exists())

    def test_wrapper_reports_review_work_and_queue_failure_is_not_hidden(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            vault, state, _ = self.fixture(root, '# AAR\n' + 'x' * extract.MAX_SOURCE)
            script = root / 'provider.py'
            script.write_text('def _deepseek_api_call(*args, **kwargs):\n    raise AssertionError("oversized reached provider")\n')
            config = root / 'config.json'
            config.write_text(json.dumps({'enabled': True, 'archive_enabled': False,
                'vault': str(vault), 'state': str(state), 'dream_script': str(script)}))
            # Exercise this candidate package, never a host's installed repair.
            package_root = Path(__file__).resolve().parents[2]
            for _ in range(2):
                run = subprocess.run([sys.executable, '-m', 'learning', 'cron',
                    '--config', str(config)], cwd=package_root, text=True,
                    capture_output=True, timeout=10)
                self.assertEqual(run.returncode, 0, run.stderr)
                summary = json.loads(run.stdout)
                self.assertEqual(summary['state'], 'manual-review-required')
                self.assertEqual(summary['deferred'], 1)
                self.assertEqual(summary['errors'], 0)
                self.assertNotIn(str(root), run.stdout)
            state.mkdir(exist_ok=True)
            (state / 'manual-review.json').write_text('{invalid')
            with contextlib.redirect_stdout(io.StringIO()) as output:
                self.assertEqual(cron.run(config), 1)
            self.assertEqual(json.loads(output.getvalue())['state'], 'failed')

    def test_malformed_queue_records_fail_closed_and_preserve_bytes(self):
        mutations = [
            lambda key, entry: (key, {}),
            lambda key, entry: ('0' * 64, entry),
            lambda key, entry: (key, {**entry, 'id': '0' * 64}),
        ]
        for field, value in [('path', '../2026-10-28.md'),
                             ('path', 'projects/example/contracts/main/2026-10-28.md'),
                             ('date', '2026-10-27'), ('project', 'other/repo'),
                             ('sha256', 'not-a-digest'), ('bytes', True), ('bytes', 0)]:
            def mutate(key, entry, field=field, value=value):
                entry['source'][field] = value
                entry['id'] = extract.sha(json.dumps(entry['source'], sort_keys=True).encode())
                return entry['id'], entry
            mutations.append(mutate)
        for field, value in [('status', 'complete'), ('reason', 'done'),
                             ('max_chars', 1), ('max_bytes', True)]:
            mutations.append(lambda key, entry, field=field, value=value:
                             (key, {**entry, field: value}))
        for index, mutate in enumerate(mutations):
            with self.subTest(mutation=index), tempfile.TemporaryDirectory() as tmp:
                vault, state, _ = self.fixture(Path(tmp), '# AAR\n' + 'x' * extract.MAX_SOURCE)
                extract.distil(vault, state, lambda _: self.fail('oversized provider'))
                queue_path = state / 'manual-review.json'
                queue = json.loads(queue_path.read_text())
                key, entry = next(iter(queue['records'].items()))
                key, entry = mutate(key, entry)
                queue['records'] = {key: entry}
                queue_path.write_text(json.dumps(queue))
                before = queue_path.read_bytes()
                model = unittest.mock.Mock()
                with self.assertRaises(ValueError):
                    extract.distil(vault, state, model)
                model.assert_not_called()
                self.assertEqual(queue_path.read_bytes(), before)
                self.assertFalse((state / 'aar-learning.json').exists())
                self.assertFalse((state / 'candidates').exists())

    def test_empty_durable_record_is_nonzero_through_candidate_cron(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            vault, state, _ = self.fixture(root, '# AAR\n' + 'x' * extract.MAX_SOURCE)
            extract.distil(vault, state, lambda _: self.fail('oversized provider'))
            queue_path = state / 'manual-review.json'
            queue = json.loads(queue_path.read_text())
            queue['records'][next(iter(queue['records']))] = {}
            queue_path.write_text(json.dumps(queue))
            before = queue_path.read_bytes()
            (vault / 'projects/example/repo/main/2026-10-27.md').write_text('# AAR\nNormal\n')
            config = root / 'config.json'
            config.write_text(json.dumps({'enabled': True, 'vault': str(vault),
                'state': str(state), 'dream_script': str(root / 'unused.py')}))
            model = unittest.mock.Mock(return_value={'lessons': [], 'open_items': []})
            with patch.object(extract, 'dream_model', return_value=model):
                with contextlib.redirect_stdout(io.StringIO()) as output:
                    self.assertEqual(cron.run(config), 1)
            self.assertEqual(json.loads(output.getvalue())['state'], 'failed')
            model.assert_not_called()
            # The actual candidate CLI must also reject this durable corruption.
            (root / 'unused.py').write_text('def _deepseek_api_call(*args, **kwargs):\n    raise AssertionError("provider called")\n')
            run = subprocess.run([sys.executable, '-m', 'learning', 'cron',
                '--config', str(config)], cwd=Path(__file__).resolve().parents[2],
                text=True, capture_output=True, timeout=10)
            self.assertEqual(run.returncode, 1, run.stderr)
            self.assertEqual(json.loads(run.stdout)['state'], 'failed')
            self.assertEqual(queue_path.read_bytes(), before)
            self.assertFalse((state / 'aar-learning.json').exists())
            self.assertFalse((state / 'candidates').exists())

    def test_queue_write_failure_does_not_start_provider_or_report_success(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            vault, state, _ = self.fixture(root, '# AAR\n' + 'x' * extract.MAX_SOURCE)
            (vault / 'projects/example/repo/main/2026-10-27.md').write_text('# AAR\nNormal\n')
            model = unittest.mock.Mock()
            with patch.object(extract, 'save', side_effect=OSError('fixture disk failure')):
                with self.assertRaises(OSError):
                    extract.distil(vault, state, model)
            model.assert_not_called()
            self.assertFalse((state / 'aar-learning.json').exists())

    def test_source_race_and_sensitive_oversized_path_do_not_become_review_success(self):
        with tempfile.TemporaryDirectory() as tmp:
            vault, state, source = self.fixture(Path(tmp), '# AAR\n' + 'x' * extract.MAX_SOURCE)
            original = extract.oversized_source
            def racing(path, info):
                error = original(path, info)
                raise ValueError('Source changed while recording manual review')
            with patch.object(extract, 'oversized_source', side_effect=racing):
                result = extract.distil(vault, state, lambda _: self.fail('provider'))
            self.assertEqual(len(result['errors']), 1)
            self.assertEqual(result['deferred'], [])
            self.assertEqual(result['status'], 'partial-failure')
            sensitive = vault / 'projects/example/contracts/main/2026-10-28.md'
            sensitive.parent.mkdir(parents=True)
            source.rename(sensitive)
            result = extract.distil(vault, state, lambda _: self.fail('sensitive provider'))
            self.assertEqual(len(result['skipped']), 1)
            self.assertEqual(result['deferred'], [])
            self.assertFalse((state / 'manual-review.json').exists())


if __name__ == '__main__':
    unittest.main()