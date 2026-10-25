#!/usr/bin/env python3
"""TTS handoff guards; no actual services, signals, profiles or sudo."""
from importlib.machinery import SourceFileLoader
from pathlib import Path
import subprocess
import tempfile
from unittest.mock import patch
import unittest

ROOT = Path(__file__).resolve().parents[1]
tts = SourceFileLoader('tts_handoff', str(ROOT / 'scripts/gimle-tts-activate')).load_module()


class TTS(unittest.TestCase):
    def test_refuses_before_adoption_without_any_service_action(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(tts.socket, 'gethostname', return_value='gimle'), \
                    patch.object(tts.Path, 'is_mount', return_value=True), \
                    patch.object(tts, 'CURRENT', Path(directory)), \
                    patch.object(tts, 'run') as command, \
                    patch.object(tts.os, 'kill') as signal:
                with self.assertRaisesRegex(ValueError, 'Finish and verify the pinned adoption first'):
                    tts.validate()
                command.assert_not_called()
                signal.assert_not_called()

    def test_default_mode_does_not_signal_or_activate(self):
        with patch.object(tts, 'validate', return_value={}), \
                patch.object(tts.sys, 'argv', ['tts']), \
                patch.object(tts, 'activate') as activate, \
                patch.object(tts.os, 'kill') as signal:
            tts.main()
            activate.assert_not_called()
            signal.assert_not_called()

    def test_apply_requires_operator_root(self):
        with patch.object(tts, 'validate', return_value={}), \
                patch.object(tts.sys, 'argv', ['tts', '--apply']), \
                patch.object(tts.os, 'geteuid', return_value=501), \
                patch.object(tts, 'activate') as activate:
            with self.assertRaisesRegex(SystemExit, 'Operator sudo required'):
                tts.main()
            activate.assert_not_called()

    def test_recovery_refuses_to_replace_occupied_port(self):
        with patch.object(tts, 'listeners', return_value=['999']), \
                patch.object(tts.subprocess, 'run') as command:
            with self.assertRaisesRegex(ValueError, 'Port occupied'):
                tts.restore_tunnel()
            command.assert_not_called()

    def test_profile_precedes_activation_and_static_mismatch_is_rejected(self):
        for consistent in (True, False):
            with self.subTest(consistent=consistent), tempfile.TemporaryDirectory() as directory:
                generation = Path(directory).resolve()
                (generation / 'activate').write_text('fixture')
                digest = tts.hashlib.sha256(b'fixture').hexdigest()
                original_resolve = Path.resolve
                def resolve(path, *args, **kwargs):
                    if str(path) == '/etc/static':
                        return generation / ('etc' if consistent else 'stale-etc')
                    return original_resolve(path, *args, **kwargs)
                with patch.object(tts, 'TARGET', generation), \
                        patch.object(tts, 'TARGET_SHA', digest), \
                        patch.object(tts, 'CURRENT', generation), \
                        patch.object(tts, 'PROFILE', generation), \
                        patch.object(Path, 'resolve', resolve), \
                        patch.object(tts.subprocess, 'run') as command:
                    if consistent:
                        tts.activate(generation, generation / 'activation.log')
                    else:
                        with self.assertRaisesRegex(RuntimeError, 'managed etc disagree'):
                            tts.activate(generation, generation / 'activation.log')
                    calls = [call.args[0] for call in command.call_args_list]
                    self.assertEqual(calls[0], [tts.NIX_ENV, '-p', str(generation), '--set', str(generation)])
                    self.assertEqual(calls[1], [str(generation / 'sw/bin/darwin-rebuild'), 'activate'])
                    self.assertEqual((generation / 'activation.log').stat().st_mode & 0o777, 0o600)

    def test_lsof_exit1_means_no_listener_and_other_errors_abort(self):
        for status in (1, 2):
            result = subprocess.CompletedProcess([], status, stdout='')
            with patch.object(tts.subprocess, 'run', return_value=result):
                if status == 1:
                    self.assertEqual(tts.listeners(9500), [])
                else:
                    with self.assertRaisesRegex(ValueError, 'Cannot inspect listener'):
                        tts.listeners(9500)


if __name__ == '__main__':
    unittest.main()
