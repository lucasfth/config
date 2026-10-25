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

class AuxiliaryCommands(unittest.TestCase):
    def test_chrome_is_loopback_and_uses_encrypted_profile(self):
        command = runner.auxiliary_command('chrome-browser')
        self.assertIn('--remote-debugging-address=127.0.0.1', command)
        self.assertIn('--remote-debugging-port=9377', command)
        self.assertIn(f'--user-data-dir={runner.HOME / "browser-profile"}', command)
        self.assertNotIn('--remote-allow-origins=*', command)

    def test_tts_requires_private_transport_and_foreground_ssh(self):
        transport = MagicMock()
        transport.is_symlink.return_value = False
        transport.stat.return_value = SimpleNamespace(st_uid=501, st_mode=0o100600)
        transport.read_text.return_value = '{"host":"tts-user@tts.example"}'
        with patch.object(runner, 'TTS_TRANSPORT', transport):
            command = runner.auxiliary_command('tts-tunnel')
        self.assertEqual(command[0], '/usr/bin/ssh')
        self.assertIn('BatchMode=yes', command)
        self.assertIn('StrictHostKeyChecking=yes', command)
        self.assertIn('ExitOnForwardFailure=yes', command)
        self.assertIn('127.0.0.1:9500:127.0.0.1:5000', command)
        self.assertNotIn('-f', command)
        self.assertEqual(command[-1], 'tts-user@tts.example')

    def test_tts_rejects_unsafe_transport(self):
        transport = MagicMock()
        transport.is_symlink.return_value = False
        transport.stat.return_value = SimpleNamespace(st_uid=501, st_mode=0o644)
        with patch.object(runner, 'TTS_TRANSPORT', transport):
            with self.assertRaisesRegex(AssertionError, 'Unsafe TTS transport'):
                runner.auxiliary_command('tts-tunnel')

    def test_auxiliaries_reject_unmounted_volume(self):
        for service in ('chrome-browser', 'tts-tunnel'):
            with self.subTest(service=service), \
                    patch.object(runner.os, 'geteuid', return_value=501), \
                    patch.object(runner.socket, 'gethostname', return_value='gimle'), \
                    patch.dict(runner.os.environ, HOME='/Users/gimle'), \
                    patch.object(runner.sys, 'argv', ['runner', service]), \
                    patch.object(runner, 'VOLUME', MagicMock(is_mount=lambda: False)):
                with self.assertRaisesRegex(AssertionError, 'Encrypted volume not mounted'):
                    runner.main()

    def test_auxiliary_gate_is_independent_of_production(self):
        for service in ('chrome-browser', 'tts-tunnel'):
            for enabled in (False, True):
                volume = MagicMock()
                volume.is_mount.return_value = True
                volume.is_symlink.return_value = False
                volume.stat.return_value = SimpleNamespace(st_uid=501, st_mode=0o700)
                gate = MagicMock()
                gate.is_file.return_value = enabled
                gate.resolve.return_value.is_relative_to.return_value = True
                gate.stat.return_value = SimpleNamespace(st_uid=0, st_mode=0o444)
                def gate_path(path):
                    if path == '/nix/store':
                        return path
                    self.assertEqual(path, '/etc/loki/auxiliary-enabled')
                    return gate
                with self.subTest(service=service, enabled=enabled), \
                        patch.object(runner.os, 'geteuid', return_value=501), \
                        patch.object(runner.socket, 'gethostname', return_value='gimle'), \
                        patch.dict(runner.os.environ, HOME='/Users/gimle'), \
                        patch.object(runner.sys, 'argv', ['runner', service]), \
                        patch.object(runner, 'VOLUME', volume), \
                        patch.object(runner, 'LIVE', MagicMock()), \
                        patch.object(runner, 'Path', side_effect=gate_path), \
                        patch.object(runner, 'auxiliary_command', return_value=['/bin/fixture']), \
                        patch.object(runner.os, 'execv') as execute:
                    if enabled:
                        runner.main()
                        execute.assert_called_once_with('/bin/fixture', ['/bin/fixture'])
                    else:
                        with self.assertRaisesRegex(AssertionError, 'Auxiliary has not been enabled'):
                            runner.main()
                        execute.assert_not_called()






if __name__ == '__main__':
    unittest.main()
