import hashlib
import json
import importlib.util
import pathlib
import tempfile
import os
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('service', pathlib.Path(__file__).with_name('service.py'))
service = importlib.util.module_from_spec(spec)
spec.loader.exec_module(service)


class PolicyTests(unittest.TestCase):
    def test_only_fixed_model_and_bounded_output(self):
        request = {'model': service.MODEL_ID, 'messages': [{'role': 'user', 'content': 'hello'}]}
        self.assertEqual(service.validate_request(request)['model'], 'default_model')
        for changes in [{'model': 'remote/repo'}, {'max_tokens': 5000}, {'max_tokens': -1}, {'max_tokens': True}, {'n': 2}]:
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                service.validate_request({**request, **changes})

    def test_clients_cannot_load_models_or_override_template(self):
        request = {'model': service.MODEL_ID, 'messages': [{'role': 'user', 'content': 'hi'}]}
        for field in ['adapters', 'draft_model', 'chat_template', 'chat_template_kwargs', 'max_completion_tokens']:
            with self.subTest(field=field), self.assertRaises(ValueError):
                service.validate_request({**request, field: 'untrusted'})

    def test_snapshot_identity_and_exact_prefix(self):
        identity = 'version-a'
        meta = {'identity': identity, 'tokens': [1, 2, 3]}
        self.assertTrue(service.matches(meta, identity, [1, 2, 3, 4]))
        self.assertFalse(service.matches(meta, 'version-b', [1, 2, 3, 4]))
        self.assertFalse(service.matches(meta, identity, [1, 9, 3, 4]))
        self.assertFalse(service.matches(meta, identity, [1, 2]))

    def test_disk_checkpoint_must_improve_exact_prefix(self):
        tokens = list(range(20000))
        meta = {'identity': 'version-a', 'tokens': tokens[:15000]}
        self.assertTrue(service.should_restore(meta, 'version-a', tokens, tokens[5000:], True))
        self.assertFalse(service.should_restore(meta, 'version-a', tokens, tokens[16000:], True))
        self.assertFalse(service.should_restore(meta, 'version-b', tokens, tokens[5000:], True))
        self.assertFalse(service.should_restore(meta, 'version-a', [0] * 20000, [0] * 15000, True))
        self.assertFalse(service.should_restore(meta, 'version-a', tokens, tokens[15000:], True))
        self.assertTrue(service.should_restore({'identity': 'version-a', 'tokens': tokens[:100]},
                                               'version-a', tokens, tokens, False))
        self.assertFalse(service.should_restore(meta, 'version-a', tokens, tokens[15000:], False))
        self.assertFalse(service.should_restore({'identity': 'version-a', 'tokens': tokens[:8192]},
                                                'version-a', tokens, tokens, True))
        self.assertTrue(service.should_restore({'identity': 'version-a', 'tokens': tokens[:8193]},
                                               'version-a', tokens, tokens, True))

    def test_corrupt_checkpoint_falls_back(self):
        with tempfile.TemporaryDirectory() as folder:
            path = pathlib.Path(folder) / 'broken.safetensors'
            path.write_bytes(b'broken cache')
            for error in (RuntimeError, KeyError, IndexError):
                with self.subTest(error=error):
                    def load(filename, **kwargs):
                        self.assertEqual(pathlib.Path(filename).read_bytes(), b'broken cache')
                        raise error('invalid checkpoint')
                    self.assertIsNone(service.load_checkpoint(load, path))

    def test_secret_permissions(self):
        with tempfile.TemporaryDirectory() as folder:
            p = pathlib.Path(folder) / 'key'
            p.write_text('x' * 48)
            p.chmod(0o600)
            self.assertEqual(service.read_key(p), 'x' * 48)
            p.chmod(0o644)
            with self.assertRaises(PermissionError):
                service.read_key(p)




class ShaFileOrNoneTests(unittest.TestCase):
    def test_present_file_hashes(self):
        with tempfile.TemporaryDirectory() as tmp:
            f = Path(tmp) / 'x.bin'
            f.write_bytes(b'abc123')
            self.assertEqual(service.sha_file_or_none(f),
                             hashlib.sha256(b'abc123').hexdigest())

    def test_missing_file_is_none(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertIsNone(service.sha_file_or_none(Path(tmp) / 'nope.jinja'))


class SwitchAndRosterTests(unittest.TestCase):
    def _root(self):
        root = Path(tempfile.mkdtemp(prefix='swr-'))
        (root / 'models').mkdir()
        for name in ('a', 'b'):
            d = root / 'models' / name
            d.mkdir()
            (d / 'config.json').write_text('{}')
            (d / 'tokenizer.json').write_text('{}')
            (d / 'w.safetensors').write_bytes(b'x')
        return root

    def _frozen(self, root, text):
        p = root
        p.write_text(text); p.chmod(0o600)
        return p

    def _entry(self, mid):
        return {'model_id': mid, 'repo': 'org/repo-x', 'revision': 'b' * 40,
                'context': 32768, 'max_output': 512, 'memory_limit': 12_000_000_000,
                'prompt_cache_bytes': 1_000_000_000, 'guard_target': 10_000_000_000,
                'guard_stop': 15_900_000_000, 'weights_bytes': None}

    def test_roster_lists_complete_models_flagging_held_one(self):
        root = self._root()
        self._frozen(root / 'swap-registry.json', json.dumps(
            {'active': 'a', 'models': {'a': self._entry('mid-a'), 'b': self._entry('mid-b')}}))
        prev_id = service.MODEL_ID
        service.MODEL_ID = 'mid-a'
        try:
            rows = service.roster_entries(root)
        finally:
            service.MODEL_ID = prev_id
        self.assertEqual(sorted(r['id'] for r in rows), ['mid-a', 'mid-b'])
        active = [r for r in rows if r['active']]
        self.assertEqual([r['id'] for r in active], ['mid-a'])

    def test_advertised_registry_key_is_switchable_without_explicit_model_id(self):
        import threading
        root = self._root()
        entry = self._entry('b')
        del entry['model_id']
        # Model ids must be 3+ characters; use the real registered quant's shape.
        name = 'qwen3.5-9b-8bit'
        (root / 'models' / 'b').rename(root / 'models' / name)
        self._frozen(root / 'swap-registry.json', json.dumps(
            {'active': 'a', 'models': {'a': self._entry('mid-a'), name: entry}}))
        self._frozen(root / 'swap-state.json', json.dumps(
            {'model_id': 'mid-a', 'context': 32768, 'max_output': 512,
             'memory_limit': 12_000_000_000, 'prompt_cache_bytes': 1_000_000_000,
             'guard_stop': 15_900_000_000, 'guard_target': 10_000_000_000}))
        self.assertIn(name, [row['id'] for row in service.roster_entries(root)])
        action, detail = service.pending_switch(root, 'mid-a', name, threading.Lock())
        self.assertEqual(action, 'switched', detail)
        self.assertEqual(json.loads((root / 'swap-state.json').read_text())['model_id'], name)

    def test_pending_switch_only_for_registered_loaded_models(self):
        import threading
        root = self._root()
        self._frozen(root / 'swap-state.json', json.dumps(
            {'model_id': 'mid-a', 'context': 32768, 'max_output': 512,
             'memory_limit': 12_000_000_000, 'prompt_cache_bytes': 1_000_000_000,
             'guard_stop': 15_900_000_000, 'guard_target': 10_000_000_000}))
        self._frozen(root / 'swap-registry.json', json.dumps(
            {'active': 'a', 'models': {'a': self._entry('mid-a'), 'b': self._entry('mid-b')}}))
        slot = threading.Lock()
        action, detail = service.pending_switch(root, 'mid-a', 'mid-zzz', slot)
        self.assertEqual((action, detail), ('none', None))
        action, _ = service.pending_switch(root, 'mid-a', 'mid-b', slot)
        self.assertEqual(action, 'switched')
        self.assertEqual(json.loads((root / 'swap-registry.json').read_text())['active'], 'b')
        self.assertEqual(json.loads((root / 'swap-state.json').read_text())['model_id'], 'mid-b')
        action, _ = service.pending_switch(root, 'mid-b', 'mid-b', slot)
        self.assertEqual(action, 'none')

    def test_pending_switch_reports_busy_when_slot_held(self):
        import threading
        root = self._root()
        self._frozen(root / 'swap-state.json', json.dumps(
            {'model_id': 'mid-a', 'context': 32768, 'max_output': 512,
             'memory_limit': 12_000_000_000, 'prompt_cache_bytes': 1_000_000_000,
             'guard_stop': 15_900_000_000, 'guard_target': 10_000_000_000}))
        self._frozen(root / 'swap-registry.json', json.dumps(
            {'active': 'a', 'models': {'a': self._entry('mid-a'), 'b': self._entry('mid-b')}}))
        slot = threading.Lock()
        slot.acquire()
        try:
            action, detail = service.pending_switch(root, 'mid-a', 'mid-b', slot)
            self.assertEqual((action, detail), ('busy', None))
        finally:
            slot.release()


if __name__ == '__main__':
    unittest.main()
