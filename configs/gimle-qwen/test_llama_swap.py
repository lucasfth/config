#!/usr/bin/env python3
"""Unit tests for llama-swap state handling. System python; no MLX, no network."""
import json
import os
import sys
import tempfile
import types
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import llama_swap
import service
import supervise

STATE_FIELDS = 'MODEL_ID CONTEXT MAX_OUTPUT MEMORY_LIMIT PROMPT_CACHE_BYTES REVISION'.split()


class ApplySwapStateTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.saved = tuple(getattr(service, f) for f in STATE_FIELDS)

    def tearDown(self):
        for field, value in zip(STATE_FIELDS, self.saved):
            setattr(service, field, value)
        self.tmp.cleanup()

    def write_state(self, state):
        (self.root / 'swap-state.json').write_text(json.dumps(state))

    def test_missing_file_keeps_baked_defaults(self):
        service.apply_swap_state(self.root)
        self.assertEqual(service.MODEL_ID, 'qwen3.5-9b-6bit')
        self.assertEqual(service.CONTEXT, 139264)
        self.assertEqual(service.MEMORY_LIMIT, 14_000_000_000)

    def test_valid_state_applies(self):
        self.write_state({'model_id': 'qwen3-coder-30b-a3b-4bit', 'context': 32768,
                          'max_output': 4096, 'memory_limit': 28_000_000_000,
                          'prompt_cache_bytes': 2_500_000_000,
                          'guard_stop': 31_000_000_000, 'guard_target': 29_000_000_000})
        service.apply_swap_state(self.root)
        self.assertEqual(service.MODEL_ID, 'qwen3-coder-30b-a3b-4bit')
        self.assertEqual(service.CONTEXT, 32768)
        self.assertEqual(service.MEMORY_LIMIT, 28_000_000_000)

    def test_empty_state_keeps_defaults(self):
        self.write_state({})
        service.apply_swap_state(self.root)
        self.assertEqual(service.MODEL_ID, 'qwen3.5-9b-6bit')

    def test_bool_rejected_as_int(self):
        self.write_state({'context': True})
        with self.assertRaises(ValueError):
            service.apply_swap_state(self.root)

    def test_context_range(self):
        for bad in (4095, 139265):
            with self.subTest(bad=bad):
                self.write_state({'context': bad})
                with self.assertRaises(ValueError):
                    service.apply_swap_state(self.root)

    def test_memory_limit_range(self):
        for bad in (3_000_000_000, 34_000_000_000):
            with self.subTest(bad=bad):
                self.write_state({'memory_limit': bad})
                with self.assertRaises(ValueError):
                    service.apply_swap_state(self.root)

    def test_guard_stop_above_cap_rejected(self):
        self.write_state({'guard_stop': 34_000_000_000})
        with self.assertRaises(ValueError):
            service.apply_swap_state(self.root)

    def test_guard_stop_at_cap_accepted(self):
        self.write_state({'guard_stop': 31_000_000_000, 'guard_target': 29_000_000_000})
        service.apply_swap_state(self.root)

    def test_guard_target_must_be_below_stop(self):
        self.write_state({'guard_stop': 17_000_000_000, 'guard_target': 17_000_000_000})
        with self.assertRaises(ValueError):
            service.apply_swap_state(self.root)

    def test_bad_model_id(self):
        for bad in ('X-1', 'Uppercase-Name', 'x' * 65):
            with self.subTest(bad=bad[:8]):
                self.write_state({'model_id': bad})
                with self.assertRaises(ValueError):
                    service.apply_swap_state(self.root)

    def test_bad_revision(self):
        for bad in ('76fe4065e622cf34990d3c13ef80ec8531c9a0f', 'z' * 40, '76FE4065E622CF34990D3C13EF80EC8531C9A0F7'):
            with self.subTest(bad=bad[:8]):
                self.write_state({'revision': bad})
                with self.assertRaises(ValueError):
                    service.apply_swap_state(self.root)

    def test_unknown_field(self):
        self.write_state({'bogus': 1})
        with self.assertRaises(ValueError):
            service.apply_swap_state(self.root)

    def test_not_an_object(self):
        (self.root / 'swap-state.json').write_text('[]')
        with self.assertRaises(ValueError):
            service.apply_swap_state(self.root)


class ValidateEntryTests(unittest.TestCase):
    def entry(self, **overrides):
        base = dict(llama_swap.BUILTIN)
        base.update(overrides)
        return base

    def test_builtin_valid(self):
        result = llama_swap.validate_entry('qwen3.5-9b-6bit', self.entry())
        self.assertEqual(result['model_id'], 'qwen3.5-9b-6bit')

    def test_guard_at_cap_valid_above_cap_rejected(self):
        llama_swap.validate_entry('big', self.entry(guard_stop=31_000_000_000, guard_target=29_000_000_000))
        with self.assertRaises(ValueError):
            llama_swap.validate_entry('big', self.entry(guard_stop=34_000_000_000))

    def test_guard_target_must_be_below_stop(self):
        with self.assertRaises(ValueError):
            llama_swap.validate_entry('big', self.entry(guard_target=18_000_000_000, guard_stop=17_000_000_000))

    def test_bad_revision_rejected(self):
        with self.assertRaises(ValueError):
            llama_swap.validate_entry('x', self.entry(revision='nope'))

    def test_missing_field_rejected(self):
        entry = self.entry()
        del entry['revision']
        with self.assertRaises(ValueError):
            llama_swap.validate_entry('x', entry)

    def test_state_for_roundtrip(self):
        entry = llama_swap.validate_entry('qwen3.5-9b-6bit', self.entry())
        state = llama_swap.state_for(entry)
        self.assertEqual(state['guard_stop'], 17_000_000_000)
        self.assertEqual(state['guard_target'], 15_000_000_000)
        self.assertNotIn('repo', state)
        self.assertNotIn('weights_bytes', state)


class CompleteTests(unittest.TestCase):
    def make(self, tmp, files, tensors=()):
        d = Path(tmp) / 'model'
        d.mkdir()
        for f in files:
            (d / f).write_text('{}')
        for name, size in tensors:
            (d / name).write_bytes(b'\0' * size)
        return d

    def test_complete_requires_core_and_tensors(self):
        with tempfile.TemporaryDirectory() as tmp:
            d = self.make(tmp, ['config.json', 'tokenizer.json', 'chat_template.jinja'], [('w-00001.safetensors', 1)])
            self.assertTrue(llama_swap.complete(d))
            (d / 'chat_template.jinja').unlink()
            self.assertTrue(llama_swap.complete(d))  # optional: absent in some layouts
            (d / 'tokenizer.json').unlink()
            self.assertFalse(llama_swap.complete(d))
        with tempfile.TemporaryDirectory() as tmp:
            d = self.make(tmp, ['config.json', 'tokenizer.json'], [('w-00001.safetensors', 0)])
            self.assertFalse(llama_swap.complete(d))

    def test_weights_ok_size_floor(self):
        with tempfile.TemporaryDirectory() as tmp:
            d = self.make(tmp, ['config.json', 'tokenizer.json', 'chat_template.jinja'], [('w.safetensors', 5_000_000_000)])
            self.assertFalse(llama_swap.weights_ok(d, {'weights_bytes': 17_200_000_000}))
            self.assertTrue(llama_swap.weights_ok(d, {'weights_bytes': 1_000_000}))


class GuardLimitTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def write_state(self, state):
        (self.root / 'swap-state.json').write_text(json.dumps(state))

    def test_no_state_file_uses_baked_limit(self):
        self.assertEqual(supervise.guard_limit(self.root), supervise.DEFAULT_LIMIT)

    def test_valid_guard_stop_applies(self):
        self.write_state({'guard_stop': 31_000_000_000})
        self.assertEqual(supervise.guard_limit(self.root), 31_000_000_000)
        self.write_state({'guard_stop': 33_000_000_000})
        self.assertEqual(supervise.guard_limit(self.root), 33_000_000_000)

    def test_out_of_range_falls_back_to_baked(self):
        self.write_state({'guard_stop': 34_000_000_000})
        self.assertEqual(supervise.guard_limit(self.root), supervise.DEFAULT_LIMIT)

    def test_bool_guard_falls_back(self):
        self.write_state({'guard_stop': True})
        self.assertEqual(supervise.guard_limit(self.root), supervise.DEFAULT_LIMIT)

    def test_corrupt_json_falls_back(self):
        (self.root / 'swap-state.json').write_text('{nope')
        self.assertEqual(supervise.guard_limit(self.root), supervise.DEFAULT_LIMIT)


class AddRegistryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.reg = {'active': 'qwen3.5-9b-6bit', 'previous': None,
                    'models': {'qwen3.5-9b-6bit': dict(llama_swap.BUILTIN)}}
        llama_swap.save_atomic(self.root / 'swap-registry.json', self.reg)

    def tearDown(self):
        self.tmp.cleanup()

    def load(self):
        return json.loads((self.root / 'swap-registry.json').read_text())

    def test_add_persists_validated_entry(self):
        rc = llama_swap.cmd_add(self.root, self.load(), 'qwen3-coder-30b-a3b-4bit',
                                ['mlx-community/Qwen3-Coder-30B-A3B-Instruct-4bit',
                                 'a' * 40, '32768', '28', '29', '31', '17', '4096'], dry=False)
        self.assertEqual(rc, 0)
        saved = self.load()
        entry = saved['models']['qwen3-coder-30b-a3b-4bit']
        self.assertEqual(entry['context'], 32768)
        self.assertEqual(entry['guard_stop'], 31_000_000_000)
        self.assertEqual(entry['memory_limit'], 28_000_000_000)
        self.assertEqual(entry['weights_bytes'], 17_000_000_000)
        self.assertEqual(entry['max_output'], 4096)
        self.assertNotIn('__path__', saved)
        self.assertEqual(set(saved), {'active', 'previous', 'models'})
        self.assertEqual(saved['active'], 'qwen3.5-9b-6bit')

    def test_add_five_args_rejected(self):
        with self.assertRaises(SystemExit):
            llama_swap.cmd_add(self.root, self.load(), 'five-args',
                               ['org/repo', 'a' * 40, '32768', '28', '29'], dry=False)

    def test_add_non_integer_context_rejected(self):
        with self.assertRaises(SystemExit):
            llama_swap.cmd_add(self.root, self.load(), 'bad-ctx',
                               ['org/repo', 'a' * 40, 'lots', '28', '29', '31'], dry=False)

    def test_add_dry_touches_nothing(self):
        before = (self.root / 'swap-registry.json').read_text()
        rc = llama_swap.cmd_add(self.root, self.load(), 'x-id-test',
                                ['org/repo', 'a' * 40, '32768', '28', '29', '31'], dry=True)
        self.assertEqual(rc, 0)
        self.assertEqual(self.load(), json.loads(before))

    def test_add_over_cap_rejected(self):
        with self.assertRaises(SystemExit):
            llama_swap.cmd_add(self.root, self.load(), 'too-big',
                               ['org/repo', 'a' * 40, '32768', '28', '29', '34'], dry=False)

    def test_add_fractional_gb_rejected(self):
        with self.assertRaises(SystemExit):
            llama_swap.cmd_add(self.root, self.load(), 'frac',
                               ['org/repo', 'a' * 40, '32768', '28.5', '29', '31'], dry=False)

    def test_add_duplicate_rejected(self):
        with self.assertRaises(SystemExit):
            llama_swap.cmd_add(self.root, self.load(), 'qwen3.5-9b-6bit',
                               ['org/repo', 'a' * 40, '32768', '14', '15', '17'], dry=False)


class InitDryRunTests(unittest.TestCase):
    def test_dry_init_touches_nothing(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'model').mkdir()
            (root / 'model' / 'config.json').write_text('{}')
            rc = llama_swap.cmd_init(root, dry=True)
            self.assertEqual(rc, 0)
            self.assertTrue((root / 'model').is_dir())
            self.assertFalse((root / 'models').exists())
            self.assertFalse((root / 'swap-registry.json').exists())
            self.assertEqual(sorted(p.name for p in root.iterdir()), ['model'])


class InitCrashRecoveryTests(unittest.TestCase):
    def test_symlink_repair_completes_registry(self):
        # Incident shape 2026-11-18: weights renamed to models/<id>, model/ is a
        # symlink to it, no registry yet. init must converge without touching the service.
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            weights = root / 'models' / llama_swap.BUILTIN_ID
            weights.mkdir(parents=True)
            (weights / 'config.json').write_text('{}')
            (weights / 'tokenizer.json').write_text('{}')
            (weights / 'chat_template.jinja').write_text('')
            (weights / 'w.safetensors').write_bytes(b'x')
            os.symlink('models/%s' % llama_swap.BUILTIN_ID, root / 'model')
            self.assertEqual(llama_swap.cmd_init(root, dry=True), 0)
            self.assertFalse((root / 'swap-registry.json').exists())
            self.assertEqual(llama_swap.cmd_init(root, dry=False), 0)
            reg = json.loads((root / 'swap-registry.json').read_text())
            self.assertEqual(reg['active'], llama_swap.BUILTIN_ID)
            self.assertEqual(reg['previous'], None)
            self.assertTrue((root / 'model').is_symlink())
            journal = (root / 'llama-swap.log').read_text().strip().splitlines()
            self.assertEqual(len(journal), 1)
            self.assertEqual(json.loads(journal[0])['event'], 'init')

    def test_missing_model_dir_still_fatal(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) 
            (root / 'models').mkdir()
            with self.assertRaises(SystemExit):
                llama_swap.cmd_init(root, dry=False)


class PointTests(unittest.TestCase):
    ENTRY = {
        'model_id': 'model-qwen35',
        'repo': 'org/model-qwen35',
        'revision': 'a' * 40,
        'context': 32768,
        'max_output': 2048,
        'memory_limit': 28_000_000_000,
        'prompt_cache_bytes': 2_500_000_000,
        'guard_target': 29_000_000_000,
        'guard_stop': 31_000_000_000,
    }

    def test_point_creates_link_and_state(self):
        # Regression 2026-11-18: Point.lexists() raised AttributeError mid-swap.
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            weights = root / 'models' / self.ENTRY['model_id']
            weights.mkdir(parents=True)
            (weights / 'config.json').write_text('{}')
            (weights / 'tokenizer.json').write_text('{}')
            (weights / 'chat_template.jinja').write_text('')
            (weights / 'w.safetensors').write_bytes(b'x')
            llama_swap.point(root, self.ENTRY['model_id'], dict(self.ENTRY))
            self.assertTrue((root / 'model').is_symlink())
            self.assertTrue(os.readlink(root / 'model').endswith('models/%s' % self.ENTRY['model_id']))
            state = json.loads((root / 'swap-state.json').read_text())
            self.assertEqual(sorted(state), sorted(llama_swap.state_for(self.ENTRY)))


class HealthAuthTests(unittest.TestCase):
    def test_wait_health_sends_bearer(self):
        # 2026-11-18: the endpoint auths every route; an unauthenticated
        # /health probe hangs wait_health until timeout (401 is not a 200).
        args = {}

        class fake_cm:
            status = 200

            def __enter__(self):
                return self

            def __exit__(self, *a):
                return False

        def fake_urlopen(req, timeout=None):
            # real urlopen() contract: (request, timeout). A string url or a
            # stray 'headers=' kwarg TypeErrors before the assertion can pass.
            args['req'] = req
            return fake_cm()

        real = llama_swap.urllib.request.urlopen
        llama_swap.urllib.request.urlopen = fake_urlopen
        try:
            self.assertTrue(llama_swap.wait_health('k' * 32, timeout=10))
        finally:
            llama_swap.urllib.request.urlopen = real
        self.assertIsInstance(args['req'], llama_swap.urllib.request.Request)
        self.assertEqual(args['req'].full_url, 'http://127.0.0.1:%d/health' % llama_swap.PORT)
        self.assertEqual(args['req'].get_header('Authorization'), 'Bearer ' + 'k' * 32)




class CheckoutCompletionTests(unittest.TestCase):
    """Regression 2026-11-18: chat_template.jinja is absent from
    mlx-community/Qwen3-30B-A3B-4bit; it must not be a required file."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_tree_without_chat_template_is_complete(self):
        m = self.root / 'm'
        m.mkdir()
        (m / 'config.json').write_text('{}')
        (m / 'tokenizer.json').write_text('{}')
        (m / 'w.safetensors').write_bytes(b'0' * 16)
        self.assertTrue(llama_swap.complete(m))

    def test_missing_core_fails(self):
        m = self.root / 'm'
        m.mkdir()
        (m / 'tokenizer.json').write_text('{}')
        (m / 'w.safetensors').write_bytes(b'0' * 16)
        self.assertFalse(llama_swap.complete(m))

    def test_no_weights_fails(self):
        m = self.root / 'm'
        m.mkdir()
        (m / 'config.json').write_text('{}')
        (m / 'tokenizer.json').write_text('{}')
        self.assertFalse(llama_swap.complete(m))


class CheckoutFailureRetentionTests(unittest.TestCase):
    """Regression 2026-11-18: a failed checkout must keep its partial and journal
    the missing set instead of rmtree-ing the evidence."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_failed_checkout_keeps_partial_and_journals(self):
        (self.root / 'venv' / 'bin').mkdir(parents=True)
        (self.root / 'venv' / 'bin' / 'python').write_text('#!/bin/sh\n')
        (self.root / 'models').mkdir(mode=0o700)
        (self.root / 'api-key').write_text('k' * 32)
        os.chmod(self.root / 'api-key', 0o600)
        entry = {'model_id': 'm2', 'repo': 'x/y', 'revision': 'abcd1234' * 5,
                 'context': 4096, 'max_output': 512, 'memory_limit': 8_000_000_000,
                 'prompt_cache_bytes': 100_000_000, 'guard_target': 15_000_000_000,
                 'guard_stop': 16_000_000_000}

        class _RC:
            returncode = 1

        real_run = llama_swap.subprocess.run
        llama_swap.subprocess.run = lambda *a, **k: _RC()
        try:
            with self.assertRaises(SystemExit):
                llama_swap.checkout('m2', entry, self.root)
        finally:
            llama_swap.subprocess.run = real_run
        parts = list((self.root / 'models').glob('.partial-m2-*'))
        self.assertEqual(len(parts), 1)
        entries = [json.loads(l) for l in (self.root / 'llama-swap.log').read_text().splitlines()]
        e = [x for x in entries if x.get('event') == 'checkout-failed']
        self.assertTrue(e)
        self.assertTrue(e[-1].get('kept'))
        allowed = list(llama_swap.CORE_FILES) + ['*.safetensors']
        self.assertTrue(e[-1].get('missing'))
        self.assertTrue(all(m0 in allowed for m0 in e[-1]['missing']))

if __name__ == '__main__':
    unittest.main()