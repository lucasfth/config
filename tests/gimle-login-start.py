#!/usr/bin/env python3
"""Login startup locks before opening Tailscale; checks never lock the session."""
import importlib.machinery
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

path = Path(__file__).resolve().parents[1] / 'scripts/gimle-login-start'
loader = importlib.machinery.SourceFileLoader('login_start', str(path))
spec = importlib.util.spec_from_loader(loader.name, loader)
module = importlib.util.module_from_spec(spec)
loader.exec_module(module)


class LoginStart(unittest.TestCase):
    def test_lock_precedes_app_start(self):
        events = []
        with patch.object(module, 'preflight'), \
             patch.object(module, 'lock_screen', side_effect=lambda: events.append('lock')), \
             patch.object(module, 'start_tailscale', side_effect=lambda: events.append('app')):
            module.start()
        self.assertEqual(events, ['lock', 'app'])

    def test_lock_failure_does_not_launch_app(self):
        with patch.object(module, 'preflight'), \
             patch.object(module, 'lock_screen', side_effect=RuntimeError('lock failed')), \
             patch.object(module, 'start_tailscale') as launch:
            with self.assertRaises(RuntimeError):
                module.start()
            launch.assert_not_called()

    def test_check_does_not_lock_or_open_app(self):
        with patch.object(module, 'preflight') as preflight, \
             patch.object(module, 'lock_screen') as lock, \
             patch.object(module, 'start_tailscale') as launch:
            module.start(check=True)
            preflight.assert_called_once()
            lock.assert_not_called()
            launch.assert_not_called()

    def test_wrong_host_rejected(self):
        with patch.object(module.socket, 'gethostname', return_value='wrong-host'):
            with self.assertRaises(AssertionError):
                module.preflight()


if __name__ == '__main__':
    unittest.main()
