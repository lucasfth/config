#!/usr/bin/env python3
"""Evaluate the actual Darwin module, then exercise only its isolated shell tail."""
import os
from pathlib import Path
import re
import subprocess
import tempfile
import unittest


class ActivationTests(unittest.TestCase):
    def test_resolve_open_and_closed_with_optional_studio(self):
        for studio in (False, True):
            expression = '''let
              flake = builtins.getFlake ("git+file://" + toString ./.);
              system = flake.darwinConfigurations.lucas-macbook-pro;
              configured = system.extendModules { modules = [{
                programs.resolveStudio.installer = flake.inputs.nixpkgs.lib.mkForce INSTALLER;
              }]; };
            in configured.config.system.activationScripts.postActivation.text'''
            installer = '''{
              name = "Test-Studio.pkg";
              hash = "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
            }''' if studio else "null"
            expression = expression.replace("INSTALLER", installer)
            evaluated = subprocess.check_output(
                ["nix", "eval", "--impure", "--raw", "--expr", expression], text=True,
            )
            start = evaluated.find("\nif /usr/bin/pgrep -x Resolve")
            self.assertGreaterEqual(start, 0)
            tail = evaluated[start:]
            with tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                calls = root / "calls"
                probe = root / "pgrep"
                probe.write_text('#!/bin/sh\nexit "$RESOLVE_STATUS"\n')
                probe.chmod(0o755)
                helper = root / "install"
                helper.write_text('#!/bin/sh\necho called >> "$CALL_LOG"\n')
                helper.chmod(0o755)
                shell = tail.replace("/usr/bin/pgrep", str(probe))
                shell, count = re.subn(r"elif ! .*; then", f'elif ! "{helper}"; then', shell)
                self.assertEqual(count, 3 if studio else 2)
                for status in ("0", "1"):
                    calls.unlink(missing_ok=True)
                    result = subprocess.run(
                        ["/bin/sh", "-eu", "-c", shell],
                        env=dict(os.environ, RESOLVE_STATUS=status, CALL_LOG=str(calls)),
                        capture_output=True, text=True,
                    )
                    self.assertEqual(result.returncode, 0, result.stderr)
                    if status == "0":
                        self.assertFalse(calls.exists())
                        self.assertIn("warning", result.stderr)
                    else:
                        self.assertEqual(len(calls.read_text().splitlines()), count)


if __name__ == "__main__":
    unittest.main()
