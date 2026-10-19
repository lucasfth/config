import ast
import datetime
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
from zoneinfo import ZoneInfo

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
import controller
import deliver
import install_controller


class AutomationTests(unittest.TestCase):
    def test_controller_delivers_once_after_due_and_retries_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            state = Path(directory)
            now = datetime.datetime(2026, 10, 20, 2, 29, tzinfo=ZoneInfo('Europe/Copenhagen'))
            send = __import__('unittest.mock', fromlist=['Mock']).Mock(return_value={'status': 'delivered'})
            self.assertEqual(controller.tick('.', '.', state, now, send)['status'], 'not-due')
            now = now.replace(minute=31)
            with self.assertRaises(ValueError):
                controller.tick('.', '.', state, now, lambda *a: (_ for _ in ()).throw(ValueError('offline')))
            self.assertFalse((state / 'last-delivery.json').exists())
            self.assertEqual(controller.tick('.', '.', state, now, send)['status'], 'delivered')
            self.assertEqual(controller.tick('.', '.', state, now, send)['status'], 'not-due')
            self.assertEqual(send.call_count, 1)

    def test_controller_install_is_reproducible_without_activation(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            code = install_controller.prepare(home)
            install_controller.prepare(home)
            for name in install_controller.FILES:
                self.assertEqual((code / name).read_bytes(), (HERE / name).read_bytes())
            self.assertEqual((home / '.local/state/volundr').stat().st_mode & 0o777, 0o700)
            self.assertFalse((home / 'Library/LaunchAgents').exists())
            repo = home / '.local/state/volundr/library.git'
            subprocess.run(['git', '-C', repo, 'remote', 'set-url', 'origin', 'unexpected'], check=True)
            with self.assertRaisesRegex(ValueError, 'origin/type'):
                install_controller.prepare(home)

    def test_delivery_fixture_is_atomic_and_pin_is_not_local_head(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory);library = root / 'library';inbox = root / 'inbox'
            subprocess.run(['git', 'init', '-b', 'main', library], check=True, capture_output=True)
            def git(*args):
                return subprocess.check_output(['git', '-C', str(library), *args], text=True).strip()
            git('config', 'user.name', 'Fixture');git('config', 'user.email', 'fixture@example.invalid')
            (library / 'file').write_text('published');git('add', '.');git('commit', '-m', 'published')
            pin = git('rev-parse', 'HEAD')
            (library / 'file').write_text('unpublished');git('commit', '-am', 'unpublished')
            with patch.object(deliver, 'published_pin', return_value=('config-fixture', pin)):
                result = deliver.deliver(root, library, 'unused', inbox=inbox)
            receipt = json.loads((inbox / 'delivery.json').read_text());bundle = inbox / (pin + '.bundle')
            self.assertEqual(result['target'], pin)
            self.assertEqual(hashlib.sha256(bundle.read_bytes()).hexdigest(), receipt['bundle_sha256'])
            self.assertFalse(list(inbox.glob('*.tmp')))
            self.assertIn(pin, subprocess.check_output(['git', 'bundle', 'list-heads', str(bundle)], text=True))
            self.assertNotEqual(git('rev-parse', 'HEAD'), pin)

    def test_delivery_rejects_unsafe_pin_before_writing_inbox(self):
        with tempfile.TemporaryDirectory() as directory:
            repo = Path(directory) / 'repo'
            subprocess.run(['git', 'init', '-b', 'main', repo], check=True, capture_output=True)
            def git(*args):
                return subprocess.check_output(['git', '-C', str(repo), *args], text=True).strip()
            git('config', 'user.name', 'Fixture');git('config', 'user.email', 'fixture@example.invalid')
            (repo / 'unsafe.md').write_text('curl -u "' + 'ab' * 16 + ':' + 'cd' * 16 + '"')
            git('add', '.');git('commit', '-m', 'fixture')
            inbox = Path(directory) / 'inbox'
            with patch.object(deliver, 'published_pin', return_value=('fixture', git('rev-parse', 'HEAD'))), self.assertRaises(RuntimeError):
                deliver.deliver(repo, repo, 'unused', inbox=inbox)
            self.assertFalse(inbox.exists())


if __name__ == '__main__':
    unittest.main()
