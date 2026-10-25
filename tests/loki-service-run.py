#!/usr/bin/env python3
"""Fail-closed runner tests; no process execution or secrets read."""
import importlib.machinery
import importlib.util
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import MagicMock, patch

source = Path(__file__).resolve().parents[1] / 'scripts/loki-service-run'
loader = importlib.machinery.SourceFileLoader('loki_runner', str(source))
spec = importlib.util.spec_from_loader(loader.name, loader)
runner = importlib.util.module_from_spec(spec)
loader.exec_module(runner)


class RunnerGates(unittest.TestCase):
    def test_unknown_service_rejected(self):
        with patch.object(runner.os, 'geteuid', return_value=501), \
                patch.object(runner.socket, 'gethostname', return_value='gimle'), \
                patch.dict(runner.os.environ, HOME='/Users/gimle'), \
                patch.object(runner.sys, 'argv', ['runner', 'unknown']):
            with self.assertRaisesRegex(AssertionError, 'Unknown service'):
                runner.main()

    def test_root_rejected(self):
        with patch.object(runner.os, 'geteuid', return_value=0):
            with self.assertRaisesRegex(AssertionError, 'Must run as gimle'):
                runner.main()

    def test_unmounted_volume_rejected(self):
        volume = MagicMock()
        volume.is_mount.return_value = False
        with patch.object(runner.os, 'geteuid', return_value=501), \
                patch.object(runner.socket, 'gethostname', return_value='gimle'), \
                patch.dict(runner.os.environ, HOME='/Users/gimle'), \
                patch.object(runner.sys, 'argv', ['runner', 'gateway']), \
                patch.object(runner, 'VOLUME', volume):
            with self.assertRaisesRegex(AssertionError, 'Encrypted volume not mounted'):
                runner.main()

    def test_missing_cutover_gate_rejected(self):
        volume = MagicMock()
        volume.is_mount.return_value = True
        volume.is_symlink.return_value = False
        volume.stat.return_value = SimpleNamespace(st_uid=501, st_mode=0o700)
        gate = MagicMock()
        gate.is_file.return_value = False
        with patch.object(runner.os, 'geteuid', return_value=501), \
                patch.object(runner.socket, 'gethostname', return_value='gimle'), \
                patch.dict(runner.os.environ, HOME='/Users/gimle'), \
                patch.object(runner.sys, 'argv', ['runner', 'gateway']), \
                patch.object(runner, 'VOLUME', volume), \
                patch.object(runner, 'LIVE', MagicMock()), \
                patch.object(runner, 'Path', return_value=gate), \
                patch.object(runner.os, 'execv') as execute:
            with self.assertRaisesRegex(AssertionError, 'Production has not been enabled'):
                runner.main()
            execute.assert_not_called()


if __name__ == '__main__':
    unittest.main()
