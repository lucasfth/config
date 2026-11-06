#!/usr/bin/env python3
"""Exercise evaluated launch arguments across a delayed executable (no services)."""
import json
from pathlib import Path
import subprocess
import os
import tempfile
import time
import unittest

JOBS = json.loads(Path(os.environ['GIMLE_BOOT_JOBS']).read_text())


class BootLaunch(unittest.TestCase):
    def test_jobs_start_with_system_shell_and_wait_for_store(self):
        names = ['loki-volume', 'loki-gateway', 'loki-vault', 'loki-ask',
                 'loki-browser', 'loki-hue']
        # CLI Tailscale is intentionally absent when app-based login is selected.
        names += [name for name in ('gimle-tailscaled', 'loki-dashboard') if name in JOBS]
        for name in names:
            with self.subTest(job=name):
                args = JOBS[name]['ProgramArguments']
                self.assertEqual(args[0], '/bin/sh')
                self.assertEqual(args[1], '-c')
                self.assertIn('until [ -x "$1" ]', args[2])
                self.assertIn('exit 75', args[2])
                self.assertIn('exec "$@"', args[2])
                self.assertTrue(JOBS[name]['RunAtLoad'])

    def test_delayed_executable_runs_once_and_propagates_exit(self):
        args = JOBS['loki-volume']['ProgramArguments']
        self.assertEqual(args[0], '/bin/sh')
        with tempfile.TemporaryDirectory() as tmp:
            executable = Path(tmp) / 'delayed-runtime'
            marker = Path(tmp) / 'executions'
            process = subprocess.Popen([*args[:4], str(executable), str(marker)])
            try:
                time.sleep(0.2)
                self.assertIsNone(process.poll(), 'Launcher exited before store was ready')
                self.assertFalse(marker.exists())
                executable.write_text('#!/bin/sh\nprintf "started\\n" >> "$1"\nexit 23\n')
                executable.chmod(0o700)
                self.assertEqual(process.wait(timeout=10), 23)
                self.assertEqual(marker.read_text(), 'started\n')
            finally:
                if process.poll() is None:
                    process.kill()
                    process.wait()

    def test_missing_runtime_fails_with_diagnostic(self):
        args = JOBS['loki-volume']['ProgramArguments']
        self.assertEqual(args[0], '/bin/sh')
        # Accelerate the production retry loop, not its checks or failure branch.
        script = args[2].replace('/bin/sleep 2', ':')
        result = subprocess.run([*args[:2], script, args[3], '/nonexistent/loki-runtime'],
                                capture_output=True, text=True, timeout=5)
        self.assertEqual(result.returncode, 75)
        self.assertIn('Nix runtime unavailable', result.stderr)


if __name__ == '__main__':
    unittest.main()
