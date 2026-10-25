#!/usr/bin/env python3
"""Exercise the actual inline Sioyek hook without touching /Applications."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


class SioyekInstall(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.src = self.root / "source.app"
        self.dst = self.root / "sioyek.app"
        for app, contents in ((self.src, "new"), (self.dst, "old")):
            binary = app / "Contents/MacOS/sioyek"
            binary.parent.mkdir(parents=True)
            binary.write_text(contents)
            for path in sorted(app.rglob("*"), reverse=True):
                path.chmod(0o555 if path.is_dir() else 0o444)
            app.chmod(0o555)
        text = (ROOT / "nix/common/dotfiles.nix").read_text()
        body = text.split('writeShellScript "install-sioyek" \'\'\n', 1)[1].split("    ''}", 1)[0]
        self.script = body.replace('${pkgs.sioyek}/Applications/sioyek.app', str(self.src)).replace('/Applications/sioyek.app', str(self.dst))
        self.script = self.script.replace('/Applications/.sioyek-stage.', str(self.root / '.sioyek-stage.'))

    def tearDown(self):
        for path in self.root.rglob("*"):
            if path.is_dir():
                path.chmod(0o755)
        self.temp.cleanup()

    def run_hook(self, script=None):
        return subprocess.run(["bash", "-c", script or self.script], text=True, capture_output=True)

    def test_readonly_upgrade_and_repeat(self):
        result = self.run_hook()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((self.dst / "Contents/MacOS/sioyek").read_text(), "new")
        backups = list(self.root.glob("sioyek.app.backup.*/sioyek.app"))
        self.assertEqual(len(backups), 1)
        self.assertEqual((backups[0] / "Contents/MacOS/sioyek").read_text(), "old")
        self.assertTrue(os.access(self.dst / "Contents/MacOS", os.W_OK))
        result = self.run_hook()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(len(list(self.root.glob("sioyek.app.backup.*"))), 1)

    def test_copy_failure_preserves_old_app(self):
        result = self.run_hook(self.script.replace('cp -R ', 'false '))
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual((self.dst / "Contents/MacOS/sioyek").read_text(), "old")

    def test_final_move_failure_restores_backup(self):
        result = self.run_hook(self.script.replace('mv "$STAGE/sioyek.app" "$DST"', 'false'))
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual((self.dst / "Contents/MacOS/sioyek").read_text(), "old")

    def test_dry_run_does_not_modify_fixture(self):
        script = self.root / "install.sh"
        script.write_text(self.script)
        result = subprocess.run(["bash", "-c", 'DRY_RUN_CMD=echo; $DRY_RUN_CMD bash "$1"', "dry-run", str(script)], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((self.dst / "Contents/MacOS/sioyek").read_text(), "old")
        self.assertFalse(list(self.root.glob("sioyek.app.backup.*")))


if __name__ == "__main__":
    unittest.main()
