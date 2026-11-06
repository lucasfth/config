#!/usr/bin/env python3
"""Dashboard boot preflight must fail closed before the encrypted home is ready."""
import importlib.machinery
import importlib.util
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import MagicMock, patch

path = Path(__file__).resolve().parents[1] / 'scripts/loki-dashboard-run'
loader = importlib.machinery.SourceFileLoader('dashboard_run', str(path))
spec = importlib.util.spec_from_loader(loader.name, loader)
module = importlib.util.module_from_spec(spec)
loader.exec_module(module)


class DashboardBoot(unittest.TestCase):
    def test_wrong_account_denied(self):
        with patch.object(module.os, 'geteuid', return_value=0):
            with self.assertRaisesRegex(AssertionError, 'gimle'):
                module.main()

    def test_unmounted_volume_denied_before_launch(self):
        with patch.object(module.os, 'geteuid', return_value=501), \
             patch.object(module.socket, 'gethostname', return_value='gimle'), \
             patch.dict(module.os.environ, {'HOME': '/Users/gimle'}), \
             patch.object(module.Path, 'is_mount', return_value=False), \
             patch.object(module.os, 'execv') as launch:
            with self.assertRaisesRegex(AssertionError, 'Encrypted volume'):
                module.main()
            launch.assert_not_called()

    def test_ready_uses_existing_dashboard_wrapper(self):
        volume = MagicMock()
        volume.is_mount.return_value = True
        volume.is_symlink.return_value = False
        volume.stat.return_value = SimpleNamespace(st_uid=501, st_mode=0o40700)
        gate = MagicMock()
        gate.is_file.return_value = True
        gate.resolve.return_value = Path('/nix/store/existing-etc/loki/production-enabled')
        gate.stat.return_value = SimpleNamespace(st_uid=0, st_mode=0o100444)
        with patch.object(module.os, 'geteuid', return_value=501), \
             patch.object(module.socket, 'gethostname', return_value='gimle'), \
             patch.dict(module.os.environ, {'HOME': '/Users/gimle'}), \
             patch.object(module, 'VOLUME', volume), \
             patch.object(module, 'GATE', gate), \
             patch.object(module.Path, 'is_file', return_value=True), \
             patch.object(module.os, 'execv') as launch:
            module.main()
            launch.assert_called_once_with('/bin/bash', ['/bin/bash', str(module.RUNNER)])


if __name__ == '__main__':
    unittest.main()
