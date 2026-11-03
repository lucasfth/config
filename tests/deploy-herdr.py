#!/usr/bin/env python3
"""Local contract checks for the fleet Herdr deployment helper (no SSH)."""
import importlib.util
import json
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent.parent
SPEC = importlib.util.spec_from_file_location("deploy_herdr", ROOT / "scripts/deploy-herdr.py")
DEPLOY = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(DEPLOY)


class HerdrDeploymentTests(unittest.TestCase):
    def test_candidate_uses_shared_config_with_host_launcher(self):
        source = (ROOT / "configs/herdr/config.toml").read_text()
        candidate = DEPLOY.candidate(source, "/home/example").decode()
        self.assertIn('default_shell = "/home/example/.local/bin/huginn-shell"', candidate)
        self.assertEqual(candidate.replace('/home/example/.local/bin/huginn-shell', 'zsh'), source)

    def test_unknown_settings_are_not_silently_dropped(self):
        with self.assertRaisesRegex(ValueError, 'private_setting'):
            DEPLOY.candidate('private_setting = true\n', '/home/example')

    def test_snapshot_uses_flat_pane_inventory(self):
        self.assertEqual(DEPLOY.panes({'workspaces': [{'workspace_id': 'w1'}],
                                     'panes': [{'pane_id': 'w2:p1'}, {'pane_id': 'w1:p1'}]}),
                         ['w1:p1', 'w2:p1'])
        self.assertEqual(DEPLOY.panes(None), [])

    def test_stopped_server_error_on_stderr_is_not_started(self):
        error = json.dumps({'error': {'code': 'server_not_running'}}).encode()
        response = subprocess.CompletedProcess([], 1, b'', error)
        with patch.object(DEPLOY.subprocess, 'run', return_value=response) as run:
            self.assertIsNone(DEPLOY.snapshot('vps1'))
            self.assertEqual(run.call_count, 1)
            self.assertIn('api snapshot', run.call_args.args[0][-1])

    def test_other_errors_fail_closed(self):
        response = subprocess.CompletedProcess([], 1, b'', b'permission denied')
        with patch.object(DEPLOY.subprocess, 'run', return_value=response):
            with self.assertRaisesRegex(RuntimeError, 'permission denied'):
                DEPLOY.snapshot('vps1')


if __name__ == '__main__':
    unittest.main()
