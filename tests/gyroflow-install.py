#!/usr/bin/env python3
"""Isolated installer policy checks; macOS signature/OFX checks are separate."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "scripts/install-gyroflow-ofx"


class InstallerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.bin = self.root / "bin"
        self.bin.mkdir()
        self.stub("codesign", 'exit "${SIGNATURE_STATUS:-0}"')
        self.stub("pgrep", 'exit "${RESOLVE_STATUS:-1}"')
        self.stub("ditto", 'exec /bin/cp -R "$1" "$2"')
        self.stub("mv", '''
if [ "${FAIL_MARKER:-0}" = 1 ] && echo "$1" | grep -q '/.gyroflow-stage.*/marker$'; then
  exit 1
fi
exec /bin/mv "$@"
''')
        self.env = dict(os.environ, PATH=f"{self.bin}:/usr/bin:/bin")
        self.source = self.root / "source.bundle"
        self.source.mkdir()
        (self.source / "binary").write_text("version one")
        self.plugins = self.root / "plugins"
        self.target = self.plugins / "Gyroflow.ofx.bundle"
        self.marker = self.plugins / ".gyroflow-nix-sha256"

    def stub(self, name, body):
        path = self.bin / name
        path.write_text("#!/bin/sh\n" + body + "\n")
        path.chmod(0o755)

    def run_installer(self, success=True, **env):
        result = subprocess.run(
            ["/bin/sh", str(SCRIPT), str(self.source), str(self.plugins)],
            env=dict(self.env, **env), capture_output=True, text=True,
        )
        self.assertEqual(result.returncode == 0, success, result.stdout + result.stderr)
        return result

    def test_first_install_and_idempotence(self):
        self.run_installer()
        marker = self.marker.read_text()
        self.assertRegex(marker, r"^[a-f0-9]{64}\n$")
        self.run_installer(RESOLVE_STATUS="0")  # no mutation needed while running
        self.assertEqual(self.marker.read_text(), marker)
        self.assertEqual((self.target / "binary").read_text(), "version one")

    def test_upgrade_after_old_source_is_gone_preserves_backup(self):
        self.run_installer()
        shutil.rmtree(self.source)
        self.source.mkdir()
        (self.source / "binary").write_text("version two")
        self.run_installer()
        self.assertEqual((self.target / "binary").read_text(), "version two")
        backups = list(self.plugins.glob(".gyroflow-backup.*/Gyroflow.ofx.bundle/binary"))
        self.assertEqual([p.read_text() for p in backups], ["version one"])

    def test_refuses_unmanaged_or_locally_modified(self):
        self.plugins.mkdir()
        shutil.copytree(self.source, self.target)
        (self.target / "binary").write_text("unmanaged")
        self.run_installer(success=False)
        self.assertEqual((self.target / "binary").read_text(), "unmanaged")
        shutil.rmtree(self.target)
        self.run_installer()
        (self.target / "binary").write_text("local edit")
        self.run_installer(success=False)
        self.assertEqual((self.target / "binary").read_text(), "local edit")

    def test_signature_and_running_refusal(self):
        self.run_installer(success=False, SIGNATURE_STATUS="1")
        self.assertFalse(self.plugins.exists())
        self.run_installer(success=False, RESOLVE_STATUS="0")
        self.assertFalse(self.plugins.exists())

    def test_marker_failure_rolls_back_first_install(self):
        self.run_installer(success=False, FAIL_MARKER="1")
        self.assertFalse(self.target.exists())
        self.assertFalse(self.marker.exists())

    def test_marker_failure_rolls_back_upgrade(self):
        self.run_installer()
        old_marker = self.marker.read_text()
        (self.source / "binary").write_text("version two")
        self.run_installer(success=False, FAIL_MARKER="1")
        self.assertEqual((self.target / "binary").read_text(), "version one")
        self.assertEqual(self.marker.read_text(), old_marker)
        self.assertFalse((self.plugins / ".gyroflow-install.lock").exists())

    def test_invalid_marker_and_symlink_refusal(self):
        self.plugins.mkdir()
        self.marker.mkdir()
        self.run_installer(success=False)
        self.marker.rmdir()
        self.target.symlink_to(self.source)
        self.run_installer(success=False)
        self.assertTrue(self.target.is_symlink())


if __name__ == "__main__":
    unittest.main()
