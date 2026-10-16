#!/usr/bin/env python3
"""End-to-end tests for the isolated fleet shell installer."""
import os
import pathlib
import shutil
import subprocess
import tempfile
import unittest

SOURCE_ROOT = pathlib.Path(__file__).resolve().parents[1]
SETUP_SOURCE = SOURCE_ROOT / "shell" / "setup.sh"


class FleetShellInstallerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = pathlib.Path(self.temp.name).resolve()
        self.home = self.base / "home"
        self.home.mkdir()
        self.payload = self.home / ".local/share/huginn-shell"
        self.payload.mkdir(parents=True)
        shutil.copy2(SETUP_SOURCE, self.payload / "setup.sh")
        shutil.copy2(SOURCE_ROOT / "shell/fleet.bash", self.payload / "fleet.bash")
        shutil.copy2(SOURCE_ROOT / "shell/fleet.zsh", self.payload / "fleet.zsh")
        shutil.copy2(SOURCE_ROOT / "shell/minimal.zsh", self.payload / "minimal.zsh")
        shutil.copy2(SOURCE_ROOT / "shell/identity.bash", self.payload / "identity.bash")
        shutil.copy2(SOURCE_ROOT / "shell/identity.zsh", self.payload / "identity.zsh")
        self.bin = self.base / "bin"
        self.bin.mkdir()
        for executable in ("bash", "zsh"):
            found = shutil.which(executable)
            if found:
                (self.bin / executable).symlink_to(found)
        self.env = os.environ.copy()
        self.config = self.home / ".config/herdr/config.toml"
        self.env.update(HOME=str(self.home), PATH=f"{self.bin}:{os.environ.get('PATH', '')}",
                        MARKER=str(self.base / "marker"), HERDR_CONFIG_PATH=str(self.config), SSH_TTY="/dev/pts/1")
    def run_setup(self, *args, success=True, env=None):
        result = subprocess.run([shutil.which("bash") or "/bin/bash", str(self.payload / "setup.sh"), *args],
                                env=env or self.env, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if success:
            self.assertEqual(result.returncode, 0, result.stderr)
        else:
            self.assertNotEqual(result.returncode, 0)
        return result

    def test_dry_run_does_not_create_files(self):
        self.run_setup("--host", "neo", "--profile", "bash", "--dry-run")
        self.assertFalse((self.home / ".local/bin/huginn-shell").exists())
        self.assertFalse((self.home / ".local/share/huginn-shell/bashrc").exists())
        self.assertFalse(self.config.exists())
        self.assertFalse((self.home / ".bashrc").exists())

    def test_reinstall_preserves_original_startup_and_unrelated_herdr_settings(self):
        bashrc = self.home / ".bashrc"
        bashrc.write_bytes(b'printf original >> "$MARKER"\n')
        self.config.parent.mkdir(parents=True)
        original_startup = bashrc.read_bytes()
        self.config.write_text('[terminal]\nfont = "kept"\ndefault_shell = "/old/shell"\n\n[other]\nvalue = 7\n')
        self.run_setup("--host", "neo", "--profile", "bash")
        first = bashrc.read_bytes()
        self.assertTrue(first.startswith(original_startup))
        self.assertEqual((self.payload / "backups/.bashrc").read_bytes(), original_startup)
        self.run_setup("--host", "neo", "--profile", "bash")
        self.assertEqual(bashrc.read_bytes(), first)
        self.assertEqual((self.payload / "backups/.bashrc").read_bytes(), original_startup)
        updated = self.config.read_text()
        self.assertIn('font = "kept"', updated)
        self.assertIn("[other]\nvalue = 7", updated)
        self.assertEqual(updated.count("default_shell ="), 1)
        self.assertIn('default_shell = "' + str(self.home / ".local/bin/huginn-shell") + '"', updated)
        self.assertEqual(first.count(b"BEGIN HUGINN SHELL IDENTITY bash"), 1)

    def test_store_style_herdr_symlink_is_replaced_without_modifying_target(self):
        self.config.parent.mkdir(parents=True)
        store_config = self.base / "store-config.toml"
        original = '[terminal]\ndefault_shell = "/bin/bash"\n\n[other]\nvalue = "store"\n'
        store_config.write_text(original)
        self.config.symlink_to(store_config)
        self.run_setup("--host", "neo", "--profile", "bash")
        self.assertFalse(self.config.is_symlink())
        self.assertEqual(store_config.read_text(), original)
        self.assertIn('[other]\nvalue = "store"', self.config.read_text())
        self.assertEqual((self.payload / "backups/herdr-config.toml").read_text(), original)

    def test_invalid_label_fails_before_any_mutation(self):
        self.run_setup("--host", "Bad_Label", "--profile", "bash", success=False)
        self.assertFalse((self.home / ".local/bin").exists())
        self.assertFalse(self.config.exists())
        self.assertFalse((self.home / ".bashrc").exists())

    def test_symlinked_local_bin_is_refused_without_target_writes(self):
        real_bin = self.base / "real-bin"
        real_bin.mkdir()
        (self.home / ".local").mkdir(exist_ok=True)
        (self.home / ".local/bin").symlink_to(real_bin)
        self.run_setup("--host", "neo", "--profile", "bash", success=False)
        self.assertEqual(list(real_bin.iterdir()), [])
        self.assertFalse(self.config.exists())

    def test_missing_shell_fails_before_any_mutation(self):
        self.payload.joinpath("fleet.zsh").unlink()
        self.run_setup("--host", "neo", "--profile", "zsh", success=False)
        self.assertFalse((self.home / ".local/bin").exists())
        self.assertFalse(self.config.exists())
        self.assertFalse((self.home / ".zshrc").exists())

    def test_symlinked_startup_stays_untouched(self):
        if not shutil.which("zsh"):
            self.skipTest("Zsh unavailable")
        target = self.base / "store-zshrc"
        original = 'print original >> "$MARKER"\n'
        target.write_text(original)
        startup = self.home / ".zshrc"
        startup.symlink_to(target)
        self.run_setup("--host", "neo", "--profile", "zsh")
        self.assertTrue(startup.is_symlink())
        self.assertEqual(target.read_text(), original)

    def test_launcher_sources_original_then_fleet_bash(self):
        if not shutil.which("bash"):
            self.skipTest("Bash unavailable")
        original = b'printf "original\\n" >> "$MARKER"\n'
        (self.home / ".bashrc").write_bytes(original)
        self.run_setup("--host", "neo", "--profile", "bash")
        result = subprocess.run([str(self.home / ".local/bin/huginn-shell"), "-i", "-c", "alias ll"], env=self.env,
                                text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("ls -alFh", result.stdout)
        self.assertTrue((self.home / ".bashrc").read_bytes().startswith(original))

    def test_plain_bash_ssh_startup_loads_identity_function(self):
        (self.home / ".bashrc").write_text("# original bashrc\n")
        self.run_setup("--host", "neo", "--profile", "bash")
        result = subprocess.run([shutil.which("bash"), "--rcfile", str(self.home / ".bashrc"), "-i", "-c",
                                "type __huginn_right_identity"], env=self.env,
                                text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("__huginn_right_identity", result.stdout)

    def test_bash_login_identity_hook_is_idempotent_and_backed_up(self):
        startup = self.home / ".bash_profile"
        original = 'export PATH="$HOME/.local/bin:$PATH"\n'
        startup.write_text(original)
        self.run_setup("--host", "loki", "--profile", "bash")
        first = startup.read_bytes()
        self.run_setup("--host", "loki", "--profile", "bash")
        self.assertEqual(startup.read_bytes(), first)
        self.assertEqual((self.payload / "backups/.bash_profile").read_text(), original)
        self.assertEqual(first.count(b"BEGIN HUGINN SHELL IDENTITY bash"), 1)

    def test_bash_login_profile_gets_plain_ssh_identity_hook(self):
        startup = self.home / ".bash_profile"
        startup.write_text('printf "login-original\\n" >> "$MARKER"\n')
        self.run_setup("--host", "loki", "--profile", "bash")
        env = self.env.copy()
        env["SSH_CONNECTION"] = "fixture connection"
        result = subprocess.run([shutil.which("bash"), "--rcfile", str(startup), "-i", "-c",
                                 "__huginn_right_identity; printf 'PROMPT=%s\\n' \"$PS1\""], env=env,
                                text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((self.base / "marker").read_text().splitlines(), ["login-original"])
        self.assertIn("loki", result.stdout)

    def test_launcher_sources_original_then_fleet_zsh(self):
        if not shutil.which("zsh"):
            self.skipTest("Zsh unavailable")
        original = 'print original >> "$MARKER"\n'
        startup = self.home / ".zshrc"
        startup.write_text(original)
        self.run_setup("--host", "neo", "--profile", "zsh")
        result = subprocess.run([str(self.home / ".local/bin/huginn-shell"), "-i", "-c", "alias ll"], env=self.env,
                                text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("ls -alFh", result.stdout)
        self.assertTrue(startup.read_text().startswith(original))

    def test_minimal_zsh_installs_identity_hook_without_overwriting_startup(self):
        if not shutil.which("zsh"):
            self.skipTest("Zsh unavailable")
        original = 'print original >> "$MARKER"\n'
        (self.home / ".zshrc").write_text(original)
        self.run_setup("--host", "sigyn", "--profile", "minimal-zsh")
        self.assertTrue((self.home / ".zshrc").read_text().startswith(original))
        self.assertEqual((self.payload / "backups/.zshrc").read_text(), original)
        env = self.env.copy()
        env["SSH_TTY"] = "/dev/pts/1"
        result = subprocess.run([shutil.which("zsh"), "-i", "-c", "exit"], env=env,
                                text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_startup_symlink_is_replaced_without_touching_target(self):
        if not shutil.which("zsh"):
            self.skipTest("Zsh unavailable")
        target = self.base / "store-zshrc"
        original = 'print original >> "$MARKER"\n'
        target.write_text(original)
        startup = self.home / ".zshrc"
        startup.symlink_to(target)
        self.run_setup("--host", "freyr", "--profile", "zsh")
        self.assertFalse(startup.is_symlink())
        self.assertEqual(target.read_text(), original)
        self.assertEqual((self.payload / "backups/.zshrc").read_text(), original)

    def test_unapproved_startup_symlink_is_unchanged(self):
        if not shutil.which("zsh"):
            self.skipTest("Zsh unavailable")
        target = self.base / "store-zshrc"
        target.write_text("# managed startup\n")
        startup = self.home / ".zshrc"
        startup.symlink_to(target)
        self.run_setup("--host", "neo", "--profile", "zsh")
        self.assertTrue(startup.is_symlink())
        self.assertEqual(target.read_text(), "# managed startup\n")

    def test_source_backups_are_private(self):
        (self.home / ".bashrc").write_text("# preserved\n")
        self.run_setup("--host", "neo", "--profile", "bash")
        backups = self.payload / "backups"
        self.assertEqual(backups.stat().st_mode & 0o777, 0o700)
        self.assertEqual((backups / ".bashrc").stat().st_mode & 0o777, 0o600)

    def test_minimal_profile_installs_without_awk_or_gzip(self):
        if not shutil.which("zsh"):
            self.skipTest("Zsh unavailable")
        limited = self.base / "limited-bin"
        limited.mkdir()
        for executable in ("bash", "zsh", "dirname", "mkdir", "mktemp", "cat", "chmod", "mv", "cp", "readlink", "cmp", "rm"):
            (limited / executable).symlink_to(shutil.which(executable))
        env = self.env.copy()
        env["PATH"] = str(limited)
        env.pop("HERDR_CONFIG_PATH", None)
        self.assertIsNone(shutil.which("awk", path=env["PATH"]))
        self.assertIsNone(shutil.which("gzip", path=env["PATH"]))
        self.run_setup("--host", "sigyn", "--profile", "minimal-zsh", env=env)
        self.assertTrue((self.home / ".local/bin/huginn-shell").is_file())
        self.assertFalse(self.config.exists())

    def test_identity_preserves_existing_zsh_right_prompt_without_duplicates(self):
        if not shutil.which("zsh"):
            self.skipTest("Zsh unavailable")
        result = subprocess.run([shutil.which("zsh"), "-f", "-i", "-c",
                                 'RPROMPT="status-info"; HUGINN_HOST_LABEL=neo; '
                                 'source "$IDENTITY_SOURCE"; _huginn_ssh_identity; '
                                 '_huginn_ssh_identity; print -r -- "$RPROMPT"'],
                                env={**self.env, "IDENTITY_SOURCE": str(SOURCE_ROOT / "shell/identity.zsh")},
                                text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("status-info", result.stdout)
        self.assertEqual(result.stdout.count("neo"), 1)


if __name__ == "__main__":
    unittest.main()
