#!/usr/bin/env python3
"""The consumed adoption helper is permanently read-only, including under root."""
from importlib.machinery import SourceFileLoader
from pathlib import Path
from unittest.mock import patch
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
adoption = SourceFileLoader('adoption', str(ROOT / 'scripts/gimle-adoption-activate')).load_module()


class Adoption(unittest.TestCase):
    def test_apply_is_retired_even_under_root_without_any_preflight_or_command(self):
        with patch.object(adoption.os, 'geteuid', return_value=0), \
                patch.object(adoption.sys, 'argv', ['adopt', '--apply']), \
                patch.object(adoption, 'preflight') as preflight, \
                patch.object(adoption.subprocess, 'run') as command:
            with self.assertRaisesRegex(SystemExit, 'RETIRED'):
                adoption.main()
            preflight.assert_not_called()
            command.assert_not_called()

    def test_exact_activation_hash_is_checked_before_any_command(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'activate').write_text('changed activation')
            with patch.object(adoption.socket, 'gethostname', return_value='gimle'), \
                    patch.object(adoption.Path, 'is_mount', return_value=True), \
                    patch.object(adoption, 'TARGET', root), \
                    patch.object(adoption, 'run') as command:
                with self.assertRaisesRegex(ValueError, 'Pinned activation changed'):
                    adoption.preflight()
                command.assert_not_called()

    def test_read_only_default_never_calls_activation_or_profile(self):
        with patch.object(adoption, 'preflight', return_value={'adopted': False}), \
                patch.object(adoption.sys, 'argv', ['adopt']), \
                patch.object(adoption.subprocess, 'run') as command:
            adoption.main()
            command.assert_not_called()

    def test_lsof_empty_is_safe_but_other_errors_are_not(self):
        for status, output, expected in [(0, '42\n42\n', ['42']), (1, '', [])]:
            result = adoption.subprocess.CompletedProcess([], status, stdout=output)
            with patch.object(adoption.subprocess, 'run', return_value=result):
                self.assertEqual(adoption.listener_pids(9500), expected)
        result = adoption.subprocess.CompletedProcess([], 2, stdout='')
        with patch.object(adoption.subprocess, 'run', return_value=result):
            with self.assertRaisesRegex(RuntimeError, 'lsof failed'):
                adoption.listener_pids(9500)

    def test_managed_static_must_match_running_target(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            (root / 'activate').write_text('fixture')
            current, profile = root / 'current', root / 'profile'
            current.symlink_to(root)
            profile.symlink_to(root)
            with patch.object(adoption, 'TARGET', root), \
                    patch.object(adoption, 'CURRENT', current), \
                    patch.object(adoption, 'PROFILE', profile), \
                    patch.object(adoption, 'ACTIVATION_SHA', 'fixture'), \
                    patch.object(adoption, 'digest', return_value='fixture'), \
                    patch.object(adoption.socket, 'gethostname', return_value='gimle'), \
                    patch.object(adoption.Path, 'is_mount', return_value=True):
                with self.assertRaisesRegex(ValueError, 'managed etc does not match running target'):
                    adoption.preflight()


if __name__ == '__main__':
    unittest.main()
