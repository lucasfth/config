#!/usr/bin/env python3
"""Policy tests; --archive additionally exercises the real signed ZIP offline."""
import argparse
import importlib.machinery
import importlib.util
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]


def load(name):
    loader = importlib.machinery.SourceFileLoader(name.replace('-', '_'), str(ROOT / 'scripts' / name))
    spec = importlib.util.spec_from_loader(loader.name, loader)
    module = importlib.util.module_from_spec(spec)
    loader.exec_module(module)
    return module


class Launcher(unittest.TestCase):
    def test_preserves_existing_and_system_search(self):
        m = load('resolve-user-ofx')
        home = Path('/tmp/home with spaces')
        existing = '/opt/other:/Library/OFX/Plugins:/opt/other:'
        self.assertEqual(m.ofx_path(home, existing),
                         '/tmp/home with spaces/Library/OFX/Plugins:/opt/other:/Library/OFX/Plugins')
        self.assertEqual(m.ofx_path(home, ''),
                         '/tmp/home with spaces/Library/OFX/Plugins:/Library/OFX/Plugins')


class Installer(unittest.TestCase):
    def test_checksum_failure_leaves_home_untouched(self):
        m = load('install-asciify-ofx')
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp) / 'home'
            archive = Path(tmp) / 'bad.zip'
            archive.write_bytes(b'not the pinned release')
            with patch.dict(os.environ, HOME=str(home)), patch.object(m, 'require_closed'):
                with self.assertRaisesRegex(ValueError, 'checksum'):
                    m.main(['install', '--archive', str(archive)])
            self.assertFalse(home.exists())


    def test_unmanaged_and_symlink_refusal(self):
        m = load('install-asciify-ofx')
        with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ, HOME=tmp):
            plugins = Path(tmp) / 'Library/OFX/Plugins'
            plugins.mkdir(parents=True)
            target = plugins / m.BUNDLE
            target.symlink_to('/nonexistent')
            for action in ['status', 'install', 'uninstall']:
                with self.assertRaises(ValueError):
                    m.main([action])
            target.unlink()
            target.mkdir()
            (target / 'user-file').write_text('preserve')
            for action in ['install', 'uninstall']:
                with self.assertRaises(ValueError):
                    m.main([action])
            self.assertEqual((target / 'user-file').read_text(), 'preserve')

    def test_redirected_parent_refusal(self):
        m = load('install-asciify-ofx')
        with tempfile.TemporaryDirectory() as tmp, patch.dict(os.environ, HOME=tmp):
            (Path(tmp) / 'Library').symlink_to('/Library')
            with self.assertRaisesRegex(ValueError, 'redirected'):
                m.main(['status'])

    def test_running_and_process_check_failure(self):
        m = load('install-asciify-ofx')
        for code in [0, 2]:
            with patch.object(m.subprocess, 'run', return_value=subprocess.CompletedProcess([], code)):
                with self.assertRaises(RuntimeError):
                    m.require_closed()

    def test_absent_status_and_uninstall_do_not_write(self):
        m = load('install-asciify-ofx')
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp) / 'absent'
            with patch.dict(os.environ, HOME=str(home)):
                self.assertEqual(m.main(['status']), 1)
                self.assertEqual(m.main(['uninstall']), 0)
            self.assertFalse(home.exists())


class LaunchPolicy(unittest.TestCase):
    def test_running_refuses_without_open(self):
        m = load('resolve-user-ofx')
        for code in [0, 2]:
            with patch.object(m.subprocess, 'run', return_value=subprocess.CompletedProcess([], code)) as run:
                with self.assertRaisesRegex(RuntimeError, 'running'):
                    m.main([])
                self.assertEqual(run.call_count, 1)
                self.assertEqual(run.call_args.args[0], ['/usr/bin/pgrep', '-x', 'Resolve'])

    def test_closed_launch_argv_and_no_global_env_changes(self):
        m = load('resolve-user-ofx')
        with tempfile.TemporaryDirectory() as tmp:
            app = Path(tmp) / 'Resolve App.app'
            (app / 'Contents/MacOS').mkdir(parents=True)
            (app / 'Contents/MacOS/Resolve').touch()
            with patch.object(m, 'APP', app), patch.dict(os.environ, OFX_PLUGIN_PATH='/opt/other'):
                before = dict(os.environ)
                with patch.object(m.subprocess, 'run', return_value=subprocess.CompletedProcess([], 1)) as run:
                    m.main([])
                    self.assertEqual(run.call_count, 2)
                    argv = run.call_args.args[0]
                    self.assertEqual(argv[:4], ['/usr/bin/open', '-a', str(app), '--env'])
                    self.assertIn('/opt/other:/Library/OFX/Plugins', argv[4])
                    self.assertNotIn('-n', argv)
                self.assertEqual(dict(os.environ), before)

    def test_preview_never_launches(self):
        m = load('resolve-user-ofx')
        with patch.object(m.subprocess, 'run') as run:
            m.main(['--print-command'])
            run.assert_not_called()


class RealArchive(unittest.TestCase):
    archive = None

    def setUp(self):
        if self.archive is None:
            self.skipTest('pass --archive for real offline macOS installer checks')
        self.m = load('install-asciify-ofx')
        self.tmp = tempfile.TemporaryDirectory(prefix='asciify-test.')
        self.addCleanup(self.tmp.cleanup)
        self.home = Path(self.tmp.name) / 'home with spaces'
        env = patch.dict(os.environ, HOME=str(self.home))
        env.start()
        self.addCleanup(env.stop)
        closed = patch.object(self.m, 'require_closed')
        closed.start()
        self.addCleanup(closed.stop)
        network = patch.object(self.m.urllib.request, 'urlopen', side_effect=AssertionError('unexpected network'))
        network.start()
        self.addCleanup(network.stop)
        self.target = self.home / 'Library/OFX/Plugins' / self.m.BUNDLE

    def install(self):
        self.m.main(['install', '--archive', str(self.archive)])

    def test_real_install_repeat_status_preservation_uninstall(self):
        self.install()
        self.assertEqual(self.m.digest(self.target), self.m.TREE_SHA256)
        unrelated = self.target.parent / 'Other.ofx.bundle'
        unrelated.mkdir()
        (unrelated / 'keep').write_text('user')
        before = self.target.stat().st_mtime_ns
        with patch.object(self.m, 'require_closed', side_effect=AssertionError('idempotence must not mutate')):
            self.install()
        self.assertEqual(self.target.stat().st_mtime_ns, before)
        self.assertEqual(self.m.main(['status']), 0)
        self.m.main(['uninstall'])
        self.assertFalse(self.target.exists())
        self.assertEqual((unrelated / 'keep').read_text(), 'user')
        self.m.main(['uninstall'])

    def test_modified_bundle_never_removed_or_replaced(self):
        self.install()
        (self.target / 'unexpected').write_text('user data')
        for action in ['status', 'install', 'uninstall']:
            with self.assertRaisesRegex(ValueError, 'modified'):
                self.m.main([action])
        self.assertEqual((self.target / 'unexpected').read_text(), 'user data')

    def test_failed_stage_leaves_no_target_or_lock(self):
        real = self.m.subprocess.run
        def command(args, **kwargs):
            if args[0] == '/usr/bin/ditto':
                raise subprocess.CalledProcessError(1, args)
            return real(args, **kwargs)
        with patch.object(self.m.subprocess, 'run', side_effect=command):
            with self.assertRaises(subprocess.CalledProcessError):
                self.install()
        self.assertFalse(self.target.exists())
        self.assertEqual(list(self.target.parent.iterdir()), [])

    def test_signature_failure_leaves_home_untouched(self):
        with patch.object(self.m.subprocess, 'run', side_effect=subprocess.CalledProcessError(1, ['codesign'])):
            with self.assertRaises(subprocess.CalledProcessError):
                self.install()
        self.assertFalse(self.home.exists())

    def test_existing_lock_is_preserved(self):
        self.target.parent.mkdir(parents=True)
        lock = self.target.parent / '.asciify-install.lock'
        lock.mkdir()
        with self.assertRaises(FileExistsError):
            self.install()
        self.assertTrue(lock.is_dir())
        self.assertFalse(self.target.exists())


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--archive', type=Path)
    args, remaining = parser.parse_known_args()
    RealArchive.archive = args.archive.resolve(strict=True) if args.archive else None
    unittest.main(argv=[__file__, *remaining])
