#!/usr/bin/env python3
"""Exercise refresh transitions against isolated files and a real Git remote."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "scripts/muninn-refresh.py"


class RefreshTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.home = self.root / "home"
        self.home.mkdir()
        self.volume = self.home / ".local/share/muninn-volume"
        self.vault = self.volume / "vault"
        self.vault.mkdir(parents=True)
        (self.vault / "note.md").write_text("original\n")
        (self.vault / ".obsidian").mkdir()
        (self.vault / ".obsidian/app.json").write_text("local settings\n")
        self.remote = self.root / "remote.git"
        self.writer = self.root / "writer"
        self.git("init", "--bare", str(self.remote))
        self.git("clone", str(self.remote), str(self.writer))
        self.git("-C", str(self.writer), "config", "user.email", "test@example.invalid")
        self.git("-C", str(self.writer), "config", "user.name", "Fixture")
        (self.writer / "snapshot").mkdir()
        (self.writer / "snapshot/note.md").write_text("original\n")
        self.publish("initial")
        self.repo = self.home / "muninn"
        self.git("clone", str(self.remote), str(self.repo))
        self.bin = self.root / "bin"
        self.bin.mkdir()
        self.executable("salt", '''import os, pathlib, shutil, sys
if sys.argv[1] == "doctor":
    print("  ! this machine has not approved the repo's keys yet" if os.environ.get("UNTRUSTED") else "  ✓ keys and settings match what you approved", file=sys.stderr)
    sys.exit(1)  # Unrelated plaintext working-tree diagnostic, as in real Salt.
if os.environ.get("FAIL_RESTORE"):
    sys.exit(9)
repo=pathlib.Path(sys.argv[2]); dest=pathlib.Path(sys.argv[sys.argv.index("--to")+1])
shutil.copytree(repo/"snapshot",dest)
''')
        self.executable("pgrep", 'import os,sys\nsys.exit(0 if os.environ.get("OBSIDIAN_RUNNING") else 1)\n')
        self.executable("diskutil", 'import plistlib,sys\nsys.stdout.buffer.write(plistlib.dumps({"FilesystemName":"Case-sensitive APFS", "MountPoint":sys.argv[-1]}))\n')
        self.env = dict(os.environ, HOME=str(self.home), PATH=str(self.bin) + os.pathsep + os.environ["PATH"])

    def tearDown(self):
        self.temp.cleanup()

    def git(self, *args):
        return subprocess.run(["git", *args], check=True, capture_output=True, text=True)

    def executable(self, name, source):
        path = self.bin / name
        path.write_text("#!" + sys.executable + "\n" + source)
        path.chmod(0o755)

    def publish(self, message, content=None):
        if content is not None:
            (self.writer / "snapshot/note.md").write_text(content)
        self.git("-C", str(self.writer), "add", "snapshot")
        self.git("-C", str(self.writer), "commit", "-m", message)
        self.git("-C", str(self.writer), "push", "origin", "HEAD")

    def run_refresh(self, *arguments, **environment):
        # Adapt platform identity and, for capacity tests, only the filesystem probe.
        loader = """import os,runpy,shutil,sys
sys.platform='darwin'
disk_usage=shutil.disk_usage
def usage(path):
    low = os.environ.get('LOW_SPACE')
    result = disk_usage(path)
    return result._replace(free=0) if low and ((low == 'volume') == str(path).endswith('muninn-volume')) else result
shutil.disk_usage=usage
script=sys.argv[1];sys.argv=[script,*sys.argv[2:]]
runpy.run_path(script,run_name='__main__')
"""
        return subprocess.run([sys.executable, "-c", loader, str(SCRIPT), *arguments], env=dict(self.env, **environment), capture_output=True, text=True)

    def test_refresh_preserves_settings_and_rollback(self):
        self.publish("new snapshot", "newest\n")
        result = self.run_refresh()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual((self.vault / "note.md").read_text(), "newest\n")
        self.assertEqual((self.vault / ".obsidian/app.json").read_text(), "local settings\n")
        backups = list(self.volume.glob("vault-before-refresh-*"))
        self.assertEqual((backups[0] / "note.md").read_text(), "original\n")
        receipt = json.loads((self.home / ".local/state/muninn/refresh.json").read_text())
        self.assertEqual(receipt["commit"], self.git("-C", str(self.repo), "rev-parse", "HEAD").stdout.strip())

    def test_finder_metadata_does_not_block_baseline_or_noop(self):
        for name in (".DS_Store", "tech/.DS_Store", ".muninn/.DS_Store"):
            path = self.vault / name
            path.parent.mkdir(exist_ok=True)
            path.write_bytes(b"Finder metadata")
        result = self.run_refresh()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        receipt_path = self.home / ".local/state/muninn/refresh.json"
        before = receipt_path.read_bytes()
        self.assertEqual(set(json.loads(before)["files"]), {"note.md"})
        (self.vault / "tech/.DS_Store").write_bytes(b"changed metadata")
        result = self.run_refresh(FAIL_RESTORE="1")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("already current", result.stdout)
        self.assertEqual(receipt_path.read_bytes(), before)
        self.assertEqual((self.vault / "tech/.DS_Store").read_bytes(), b"changed metadata")

    def test_old_finder_metadata_receipt_does_not_block_refresh(self):
        # Model receipts emitted by the old command, not a repair of live state.
        import hashlib
        for name in (".DS_Store", "tech/.DS_Store"):
            path = self.writer / "snapshot" / name
            path.parent.mkdir(exist_ok=True)
            path.write_bytes(b"published metadata")
        self.publish("metadata snapshot")
        self.git("-C", str(self.repo), "pull", "--ff-only")
        state = self.home / ".local/state/muninn"
        state.mkdir(parents=True)
        receipt_path = state / "refresh.json"
        receipt = {"commit": self.git("-C", str(self.repo), "rev-parse", "HEAD").stdout.strip(),
                   "files": {"note.md": hashlib.sha256(b"original\n").hexdigest(),
                             ".DS_Store": "old metadata", "tech/.DS_Store": "old metadata"}}
        receipt_path.write_text(json.dumps(receipt))
        before = receipt_path.read_bytes()
        (self.vault / ".DS_Store").write_bytes(b"changed metadata")
        result = self.run_refresh(FAIL_RESTORE="1")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("already current", result.stdout)
        self.assertEqual(receipt_path.read_bytes(), before)
        self.publish("new content", "newest\n")
        result = self.run_refresh()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(set(json.loads(receipt_path.read_text())["files"]), {"note.md"})
        self.assertEqual((self.vault / "note.md").read_text(), "newest\n")
        self.assertEqual((Path(json.loads(receipt_path.read_text())["previous_snapshot"]) / ".DS_Store").read_bytes(), b"changed metadata")


    def test_unchanged_commit_skips_restore_and_duplicate_rollback(self):
        self.assertEqual(self.run_refresh().returncode, 0)
        receipt = self.home / ".local/state/muninn/refresh.json"
        before = receipt.read_bytes()
        backups = sorted(self.volume.glob("vault-before-refresh-*"))
        result = self.run_refresh(FAIL_RESTORE="1")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("already current", result.stdout)
        self.assertEqual(receipt.read_bytes(), before)
        self.assertEqual(sorted(self.volume.glob("vault-before-refresh-*")), backups)

    def test_low_space_stops_before_restore_and_preserves_snapshots(self):
        self.assertEqual(self.run_refresh().returncode, 0)
        receipt = self.home / ".local/state/muninn/refresh.json"
        before = receipt.read_bytes()
        backups = sorted(self.volume.glob("vault-before-refresh-*"))
        self.publish("new remote", "remote\n")
        for filesystem in ("volume", "host"):
            with self.subTest(filesystem=filesystem):
                result = self.run_refresh(LOW_SPACE=filesystem, FAIL_RESTORE="1")
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("Not enough free space", result.stderr)
                self.assertIn("preserved", result.stderr)
                self.assertEqual(receipt.read_bytes(), before)
                self.assertEqual(sorted(self.volume.glob("vault-before-refresh-*")), backups)
                self.assertEqual((self.vault / "note.md").read_text(), "original\n")
                self.assertFalse(list(self.volume.glob("muninn-refresh-*")))

    def test_local_edit_after_refresh_is_not_overwritten(self):
        self.assertEqual(self.run_refresh().returncode, 0)
        (self.vault / "note.md").write_text("local unpublished edit\n")
        self.publish("remote edit", "remote\n")
        result = self.run_refresh()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("local", result.stderr.lower())
        self.assertEqual((self.vault / "note.md").read_text(), "local unpublished edit\n")

    def test_reconciled_edit_matches_incoming_and_preserves_rollback(self):
        self.assertEqual(self.run_refresh().returncode, 0)
        (self.vault / "note.md").write_text("already canonical\n")
        self.publish("reconciled remote", "already canonical\n")
        result = self.run_refresh("--reconciled", "note.md")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        receipt = json.loads((self.home / ".local/state/muninn/refresh.json").read_text())
        self.assertEqual((Path(receipt["previous_snapshot"]) / "note.md").read_text(), "already canonical\n")
        self.assertEqual((self.vault / "note.md").read_text(), "already canonical\n")
        self.assertEqual(self.run_refresh(FAIL_RESTORE="1").returncode, 0)

    def test_reconciled_mismatch_or_missing_file_preserves_vault_and_receipt(self):
        self.assertEqual(self.run_refresh().returncode, 0)
        receipt = self.home / ".local/state/muninn/refresh.json"
        before = receipt.read_bytes()
        (self.vault / "note.md").write_text("canonical but unpublished\n")
        self.publish("different remote", "different\n")
        (self.writer / "snapshot/note.md").unlink()
        for missing in (False, True):
            with self.subTest(missing=missing):
                if missing:
                    (self.writer / "snapshot/other.md").write_text("nonempty\n")
                    self.publish("deleted remote note")
                result = self.run_refresh("--reconciled", "note.md")
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("does not match", result.stderr)
                self.assertEqual((self.vault / "note.md").read_text(), "canonical but unpublished\n")
                self.assertEqual(receipt.read_bytes(), before)
                self.assertFalse(list(self.volume.glob("vault-before-refresh-*")))
                self.assertFalse((receipt.parent / "pending.json").exists())

    def test_reconciliation_does_not_allow_other_local_edits(self):
        self.assertEqual(self.run_refresh().returncode, 0)
        (self.vault / "note.md").write_text("canonical\n")
        (self.vault / "unpublished.md").write_text("must preserve\n")
        self.publish("remote", "canonical\n")
        result = self.run_refresh("--reconciled", "note.md", FAIL_RESTORE="1")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("unpublished.md", result.stderr)
        self.assertEqual((self.vault / "unpublished.md").read_text(), "must preserve\n")

    def test_reconciled_edit_forces_verification_even_at_receipt_commit(self):
        self.assertEqual(self.run_refresh().returncode, 0)
        (self.vault / "note.md").write_text("unpublished\n")
        result = self.run_refresh("--reconciled", "note.md")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("does not match", result.stderr)
        self.assertEqual((self.vault / "note.md").read_text(), "unpublished\n")

    def test_reconciled_edit_never_bypasses_failed_restore(self):
        self.assertEqual(self.run_refresh().returncode, 0)
        receipt = self.home / ".local/state/muninn/refresh.json"
        before = receipt.read_bytes()
        (self.vault / "note.md").write_text("canonical\n")
        self.publish("remote", "canonical\n")
        result = self.run_refresh("--reconciled", "note.md", FAIL_RESTORE="1")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(receipt.read_bytes(), before)
        self.assertEqual((self.vault / "note.md").read_text(), "canonical\n")

    def test_reconciliation_requires_existing_receipt_and_snapshot_file(self):
        result = self.run_refresh("--reconciled", "note.md")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("existing refresh receipt", result.stderr)
        self.assertEqual(self.run_refresh().returncode, 0)
        result = self.run_refresh("--reconciled", "missing.md")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("not a snapshot file", result.stderr)

    def test_reconciliation_refuses_nonrelative_or_unnormalized_paths(self):
        for name in ("", "/note.md", "../note.md", "./note.md", "folder/../note.md"):
            with self.subTest(name=name):
                result = self.run_refresh("--reconciled", name)
                self.assertEqual(result.returncode, 2)
                self.assertIn("vault-relative", result.stderr)

    def test_first_refresh_refuses_unknown_baseline(self):
        (self.vault / "new-local.md").write_text("unpublished\n")
        self.publish("remote", "remote\n")
        result = self.run_refresh()
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual((self.vault / "new-local.md").read_text(), "unpublished\n")
        self.assertEqual((self.vault / "note.md").read_text(), "original\n")

    def test_restore_failure_keeps_current_vault(self):
        self.assertEqual(self.run_refresh().returncode, 0)
        self.publish("remote", "remote\n")
        result = self.run_refresh(FAIL_RESTORE="1")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual((self.vault / "note.md").read_text(), "original\n")

    def test_running_obsidian_refuses_refresh(self):
        result = self.run_refresh(OBSIDIAN_RUNNING="1")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Obsidian", result.stderr)
        self.assertEqual((self.vault / "note.md").read_text(), "original\n")

    def test_tracked_checkout_edit_is_preserved(self):
        (self.repo / "snapshot/note.md").write_text("checkout edit\n")
        result = self.run_refresh()
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual((self.repo / "snapshot/note.md").read_text(), "checkout edit\n")

    def test_note_and_finder_metadata_symlinks_refuse_refresh(self):
        for name in ("linked.md", ".DS_Store"):
            with self.subTest(name=name):
                path = self.vault / name
                path.symlink_to(self.root / "outside")
                result = self.run_refresh()
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("symlink", result.stderr)
                self.assertTrue(path.is_symlink())
                path.unlink()

    def test_other_hidden_files_still_block_refresh(self):
        self.assertEqual(self.run_refresh().returncode, 0)
        for name in (".hidden-note.md", ".DS_Store.md"):
            with self.subTest(name=name):
                path = self.vault / name
                path.write_text("unpublished\n")
                result = self.run_refresh()
                self.assertNotEqual(result.returncode, 0)
                self.assertIn(name, result.stderr)
                self.assertEqual(path.read_text(), "unpublished\n")
                path.unlink()

    def test_unapproved_trust_refuses_decryption(self):
        original_commit = self.git("-C", str(self.repo), "rev-parse", "HEAD").stdout.strip()
        self.publish("new remote", "remote\n")
        result = self.run_refresh(UNTRUSTED="1")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("trust", result.stderr.lower())
        self.assertEqual((self.vault / "note.md").read_text(), "original\n")
        self.assertEqual(self.git("-C", str(self.repo), "rev-parse", "HEAD").stdout.strip(), original_commit)

    def test_interrupted_swap_restores_missing_vault(self):
        self.assertEqual(self.run_refresh().returncode, 0)
        state = self.home / ".local/state/muninn"
        receipt = json.loads((state / "refresh.json").read_text())
        backup = self.volume / "vault-before-refresh-interrupted"
        destination = self.volume / "muninn-refresh-interrupted/vault"
        destination.mkdir(parents=True)
        (destination / "note.md").write_text("unfinished new snapshot\n")
        self.vault.rename(backup)
        (state / "pending.json").write_text(json.dumps({"backup": str(backup), "destination": str(destination), "receipt": receipt}))
        result = self.run_refresh()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual((self.vault / "note.md").read_text(), "original\n")
        self.assertFalse((state / "pending.json").exists())

    def test_interrupted_receipt_finishes_new_baseline(self):
        self.assertEqual(self.run_refresh().returncode, 0)
        state = self.home / ".local/state/muninn"
        receipt = json.loads((state / "refresh.json").read_text())
        backup = self.volume / "vault-before-refresh-interrupted"
        self.vault.rename(backup)
        self.vault.mkdir()
        (self.vault / "note.md").write_text("new snapshot\n")
        import hashlib
        receipt["files"] = {"note.md": hashlib.sha256(b"new snapshot\n").hexdigest()}
        receipt["files"][".DS_Store"] = "old metadata"
        (self.vault / ".DS_Store").write_bytes(b"new metadata")
        destination = self.volume / "muninn-refresh-interrupted/vault"
        (state / "pending.json").write_text(json.dumps({"backup": str(backup), "destination": str(destination), "receipt": receipt}))
        self.publish("new remote after interrupted receipt", "remote\n")
        result = self.run_refresh(FAIL_RESTORE="1")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual((self.vault / "note.md").read_text(), "new snapshot\n")
        self.assertEqual(json.loads((state / "refresh.json").read_text())["files"], receipt["files"])
        self.assertFalse((state / "pending.json").exists())

    def test_recovery_refuses_edits_after_interrupted_switch(self):
        self.assertEqual(self.run_refresh().returncode, 0)
        state = self.home / ".local/state/muninn"
        receipt = json.loads((state / "refresh.json").read_text())
        backup = self.volume / "vault-before-refresh-interrupted"
        self.vault.rename(backup)
        self.vault.mkdir()
        (self.vault / "note.md").write_text("edited after interruption\n")
        destination = self.volume / "muninn-refresh-interrupted/vault"
        pending = state / "pending.json"
        pending.write_text(json.dumps({"backup": str(backup), "destination": str(destination), "receipt": receipt}))
        result = self.run_refresh()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("local", result.stderr.lower())
        self.assertEqual((self.vault / "note.md").read_text(), "edited after interruption\n")
        self.assertEqual((backup / "note.md").read_text(), "original\n")
        self.assertTrue(pending.exists())


if __name__ == "__main__":
    unittest.main()
