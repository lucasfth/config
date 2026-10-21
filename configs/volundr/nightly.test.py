import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('nightly', Path(__file__).with_name('nightly.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class SyncTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.source, self.repo = self.root / 'source', self.root / 'live'
        subprocess.run(['git', 'init', '-b', 'main', self.source], check=True, capture_output=True)
        self.git(self.source, 'config', 'user.email', 'fixture@example.invalid')
        self.git(self.source, 'config', 'user.name', 'Fixture')
        (self.source / 'validate.py').write_text('print("ok")\n')
        (self.source / 'guide.md').write_text('base\n')
        self.commit('base')
        self.before = self.git(self.source, 'rev-parse', 'HEAD')
        subprocess.run(['git', 'clone', self.source, self.repo], check=True, capture_output=True)
        self.git(self.repo, 'config', 'user.email', 'fixture@example.invalid')
        self.git(self.repo, 'config', 'user.name', 'Fixture')
        self.home, self.inbox, self.state = [self.root / x for x in ['home', 'inbox', 'state']]
        self.home.mkdir(); self.inbox.mkdir(); self.state.mkdir()
        (self.home / 'config.yaml').write_text('unrelated: keep\n')
        self.settings = {key: str(value) for key, value in {
            'repo': self.repo, 'home': self.home, 'inbox': self.inbox, 'state': self.state}.items()}

    def git(self, repo, *args):
        return subprocess.check_output(['git', '-C', str(repo), *args], text=True, stderr=subprocess.DEVNULL).strip()

    def commit(self, message):
        self.git(self.source, 'add', '.')
        self.git(self.source, 'commit', '-m', message)

    def delivery(self):
        target = self.git(self.source, 'rev-parse', 'HEAD')
        bundle = self.inbox / (target + '.bundle')
        self.git(self.source, 'bundle', 'create', str(bundle), 'main')
        module.save(self.inbox / 'delivery.json', {'target': target, 'created_at': time.time(),
                    'config_revision': 'fixture', 'bundle_sha256': module.hashlib.sha256(bundle.read_bytes()).hexdigest()})
        return target

    def test_no_bundle_is_successful_skip(self):
        self.assertEqual(module.sync(self.settings)['status'], 'no-new-bundle')
        self.assertEqual(self.git(self.repo, 'rev-parse', 'HEAD'), self.before)

    def test_untrusted_bundle_secret_is_rejected_before_probe_and_fast_forward(self):
        (self.source / 'unsafe.md').write_text(' '.join(['curl', '-u', '"' + 'ab' * 16 + ':' + 'cd' * 16 + '"']))
        self.commit('unsafe candidate')
        self.delivery()
        with patch.object(module, 'probe') as probe, self.assertRaises(RuntimeError):
            module.sync(self.settings)
        probe.assert_not_called()
        self.assertEqual(self.git(self.repo, 'rev-parse', 'HEAD'), self.before)
        self.assertEqual((self.home / 'config.yaml').read_text(), 'unrelated: keep\n')

    def test_invalid_history_proof_blocks_before_probe(self):
        self.delivery()
        p = self.inbox / 'delivery.json'
        item = json.loads(p.read_text()); item['history_proof'] = {'receipt': '{}', 'signature': 'invalid'}
        module.save(p, item)
        self.settings['history_allowed_signers'] = str(self.root / 'missing-signers')
        with patch.object(module, 'probe') as probe, self.assertRaisesRegex(RuntimeError, 'Missing pinned controller trust key'):
            module.sync(self.settings)
        probe.assert_not_called()
        self.assertEqual(self.git(self.repo, 'rev-parse', 'HEAD'), self.before)

    def test_fast_forward_and_failed_postcheck_restore_named_branch(self):
        (self.source / 'new.md').write_text('new')
        self.commit('upstream')
        target = self.delivery()
        with patch.object(module, 'probe', return_value={'active': 1, 'archived': 0}):
            result = module.sync(self.settings)
        self.assertEqual(result['status'], 'applied')
        self.assertEqual(self.git(self.repo, 'rev-parse', 'HEAD'), target)
        (self.source / 'new.md').write_text('next')
        self.commit('next')
        rejected = self.delivery()
        def probe(settings, root, mode='probe'):
            if str(root) == str(self.repo) and mode == 'probe':
                raise ValueError('postcheck failure')
            return {'active': 1}
        with patch.object(module, 'probe', side_effect=probe), self.assertRaisesRegex(ValueError, 'postcheck'):
            module.sync(self.settings)
        self.assertEqual(self.git(self.repo, 'symbolic-ref', '--short', 'HEAD'), 'main')
        self.assertEqual(self.git(self.repo, 'rev-parse', 'HEAD'), target)
        self.assertEqual((self.home / 'config.yaml').read_text(), 'unrelated: keep\n')
        self.assertIn(rejected, self.git(self.repo, 'show-ref'))

    def test_rollback_does_not_use_branch_force_or_detach(self):
        (self.source / 'guide.md').write_text('rejected change\n')
        self.commit('upstream change')
        self.delivery()
        original = module.git
        def guarded_git(repo, *args, **kwargs):
            if args[:2] == ('branch', '-f') or '--detach' in args and Path(repo) == self.repo:
                raise AssertionError('Rollback must stay attached')
            return original(repo, *args, **kwargs)
        def failed_probe(settings, root, mode='probe'):
            if Path(root) == self.repo and mode == 'probe':
                raise ValueError('postcheck failure')
            return {'active': 1}
        with patch.object(module, 'git', side_effect=guarded_git), \
                patch.object(module, 'probe', side_effect=failed_probe), \
                self.assertRaisesRegex(ValueError, 'postcheck'):
            module.sync(self.settings)
        self.assertEqual(self.git(self.repo, 'symbolic-ref', '--short', 'HEAD'), 'main')
        self.assertEqual(self.git(self.repo, 'rev-parse', 'HEAD'), self.before)
        self.assertEqual((self.repo / 'guide.md').read_text(), 'base\n')

    def test_rollback_operation_failures_leave_a_coherent_attached_tree(self):
        (self.source / 'guide.md').write_text('target content\n')
        self.commit('target')
        target = self.delivery()
        original = module.git
        for operation in ['read-tree', 'update-ref']:
            with self.subTest(operation=operation):
                def injected(repo, *args, **kwargs):
                    if Path(repo) == self.repo and args[0] == operation:
                        if operation == 'read-tree':
                            (self.repo / 'guide.md').write_text('base\n')
                        raise OSError('injected rollback failure')
                    return original(repo, *args, **kwargs)
                def failed_probe(settings, root, mode='probe'):
                    if Path(root) == self.repo and mode == 'probe':
                        raise ValueError('postcheck failure')
                    return {'active': 1}
                with patch.object(module, 'git', side_effect=injected), \
                        patch.object(module, 'probe', side_effect=failed_probe), \
                        self.assertRaises(Exception):
                    module.sync(self.settings)
                self.assertEqual(self.git(self.repo, 'symbolic-ref', '--short', 'HEAD'), 'main')
                head = self.git(self.repo, 'rev-parse', 'HEAD')
                self.assertIn(head, [self.before, target])
                self.assertFalse(self.git(self.repo, 'status', '--porcelain'))
                self.assertEqual((self.repo / 'guide.md').read_text(), self.git(self.repo, 'show', 'HEAD:guide.md') + '\n')
                # Return the fixture to the original revision without reset/checkout -B.
                self.git(self.repo, 'restore', '--source', self.before, '--staged', '--worktree', '--', '.')
                self.git(self.repo, 'update-ref', 'refs/heads/main', self.before, head)

    def test_postcheck_failure_preserves_concurrent_config_and_skill_edits(self):
        (self.source / 'guide.md').write_text('target content\n')
        self.commit('target')
        target = self.delivery()
        def failed_probe(settings, root, mode='probe'):
            if Path(root) == self.repo and mode == 'probe':
                (self.home / 'config.yaml').write_text('concurrent: keep\n')
                (self.repo / 'guide.md').write_text('concurrent skill edit\n')
                raise ValueError('postcheck failure')
            return {'active': 1}
        with patch.object(module, 'probe', side_effect=failed_probe), self.assertRaises(Exception):
            module.sync(self.settings)
        self.assertEqual((self.home / 'config.yaml').read_text(), 'concurrent: keep\n')
        self.assertEqual((self.repo / 'guide.md').read_text(), 'concurrent skill edit\n')
        self.assertEqual(self.git(self.repo, 'rev-parse', 'HEAD'), target)

    def test_conflict_stays_in_candidate_and_preserves_live_edits(self):
        (self.source / 'guide.md').write_text('upstream edit\n')
        self.commit('remote')
        self.delivery()
        (self.repo / 'guide.md').write_text('local edit\n')
        result = module.sync(self.settings)
        self.assertEqual(result['status'], 'conflict')
        self.assertIn('guide.md', result['conflicts'])
        self.assertEqual(self.git(self.repo, 'rev-parse', 'HEAD'), self.before)
        self.assertEqual((self.repo / 'guide.md').read_text(), 'local edit\n')
        self.assertEqual(self.git(self.repo, 'symbolic-ref', '--short', 'HEAD'), 'main')

    def test_committed_divergence_produces_real_rebase_conflict(self):
        (self.source / 'guide.md').write_text('remote committed line\n')
        self.commit('remote divergence')
        self.delivery()
        (self.repo / 'guide.md').write_text('local committed line\n')
        self.git(self.repo, 'add', 'guide.md')
        self.git(self.repo, 'commit', '-m', 'local divergence')
        local = self.git(self.repo, 'rev-parse', 'HEAD')
        self.assertFalse(self.git(self.repo, 'status', '--porcelain'))
        result = module.sync(self.settings)
        self.assertEqual(result['status'], 'conflict')
        self.assertNotEqual(result['rebase_exit'], 0)
        candidate = Path(result['candidate'])
        self.assertTrue((candidate / '.git/rebase-merge').is_dir())
        self.assertIn('guide.md', self.git(candidate, 'diff', '--name-only', '--diff-filter=U'))
        self.assertEqual(self.git(self.repo, 'rev-parse', 'HEAD'), local)
        self.assertEqual((self.repo / 'guide.md').read_text(), 'local committed line\n')

    def test_checksum_failure_leaves_live_unchanged(self):
        self.delivery()
        item = json.loads((self.inbox / 'delivery.json').read_text())
        item['bundle_sha256'] = 'bad'
        module.save(self.inbox / 'delivery.json', item)
        with self.assertRaisesRegex(ValueError, 'checksum'):
            module.sync(self.settings)
        self.assertEqual(self.git(self.repo, 'rev-parse', 'HEAD'), self.before)

    def test_expired_delivery_never_changes_live(self):
        self.delivery()
        item = json.loads((self.inbox / 'delivery.json').read_text())
        item['created_at'] = time.time() - 8 * 86400
        module.save(self.inbox / 'delivery.json', item)
        with self.assertRaisesRegex(ValueError, 'Expired'):
            module.sync(self.settings)
        self.assertEqual(self.git(self.repo, 'rev-parse', 'HEAD'), self.before)

    def test_custom_delivery_ref_and_noop(self):
        ref = 'refs/nightly-delivery/fixture'
        self.git(self.source, 'update-ref', ref, self.before)
        bundle = self.inbox / (self.before + '.bundle')
        self.git(self.source, 'bundle', 'create', str(bundle), ref)
        module.save(self.inbox / 'delivery.json', {'target': self.before, 'bundle_ref': ref,
            'created_at': time.time(), 'config_revision': 'fixture',
            'bundle_sha256': module.hashlib.sha256(bundle.read_bytes()).hexdigest()})
        self.assertEqual(module.sync(self.settings)['status'], 'up-to-date')
        self.assertEqual(self.git(self.repo, 'rev-parse', 'HEAD'), self.before)

    def test_adopted_dirty_delivery_preserves_edits_and_clears_pending(self):
        self.delivery()
        (self.repo / 'guide.md').write_text('private edits\n')
        (self.repo / 'private.md').write_text('untracked\n')
        module.save(self.state / 'pending.json', {'status': 'local-review-required'})
        before = self.git(self.repo, 'status', '--porcelain')
        with patch.object(module.secret_gate, 'scan'), patch.object(module, 'stage_local') as stage:
            result = module.sync(self.settings)
        self.assertEqual(result['status'], 'up-to-date')
        stage.assert_not_called()
        self.assertEqual(self.git(self.repo, 'status', '--porcelain'), before)
        self.assertEqual((self.repo / 'guide.md').read_text(), 'private edits\n')
        self.assertEqual((self.repo / 'private.md').read_text(), 'untracked\n')
        self.assertFalse((self.state / 'pending.json').exists())
        self.assertEqual(json.loads((self.state / 'last-sync.json').read_text())['target'], self.before)
        self.assertEqual((self.home / 'config.yaml').read_text(), 'unrelated: keep\n')

    def test_clean_noop_clears_stale_pending(self):
        self.delivery()
        module.save(self.state / 'pending.json', {'status': 'local-review-required'})
        with patch.object(module.secret_gate, 'scan'):
            self.assertEqual(module.sync(self.settings)['status'], 'up-to-date')
        self.assertFalse((self.state / 'pending.json').exists())

    def test_rewind_of_previously_accepted_pin_is_rejected(self):
        self.delivery()
        (self.repo / 'new.md').write_text('local newer revision')
        self.git(self.repo, 'add', '.')
        self.git(self.repo, 'commit', '-m', 'newer accepted pin')
        current = self.git(self.repo, 'rev-parse', 'HEAD')
        module.save(self.state / 'last-sync.json', {'target': current})
        with self.assertRaisesRegex(ValueError, 'rewind'):
            module.sync(self.settings)
        self.assertEqual(self.git(self.repo, 'rev-parse', 'HEAD'), current)

    def test_invalid_candidate_never_activates(self):
        (self.source / 'validate.py').write_text('raise ValueError("fixture rejection")')
        self.commit('invalid')
        self.delivery()
        with self.assertRaises(subprocess.CalledProcessError):
            module.sync(self.settings)
        self.assertEqual(self.git(self.repo, 'rev-parse', 'HEAD'), self.before)


if __name__ == '__main__':
    unittest.main()
