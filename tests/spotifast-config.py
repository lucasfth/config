#!/usr/bin/env python3
"""Isolated checks; never write to the real Spotifast profile."""

import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "configs/spotifast"


class SpotifastConfigTests(unittest.TestCase):
    def setUp(self):
        spec = importlib.util.spec_from_file_location(
            "spotifast_config", ROOT / "scripts/apply-spotifast-config.py")
        self.module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.module)

    def test_restore_preserves_user_state_and_is_repeatable(self):
        module = self.module
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            target = home / "Library/Application Support/me.paolino.spotifast"
            target.mkdir(parents=True)
            settings = target / "settings.json"
            original = {"volume": 0.42, "unrelated": {"keep": True},
                        "theme": "dark", "custom_theme_cache": {"stale": True}}
            settings.write_text(json.dumps(original))
            history = target / "history.json"
            history.write_text("leave alone\n")
            with patch.object(module.Path, "home", return_value=home), patch.object(
                module.subprocess, "run", return_value=subprocess.CompletedProcess([], 1)
            ):
                module.main(SOURCE)
                first = settings.read_bytes()
                module.main(SOURCE)
                self.assertEqual(settings.read_bytes(), first)
                self.assertEqual(settings.stat().st_mode & 0o777, 0o600)
            restored = json.loads(first)
            self.assertEqual(restored["volume"], original["volume"])
            self.assertEqual(restored["unrelated"], original["unrelated"])
            self.assertIsNone(restored["custom_theme_cache"])
            tracked = json.loads((SOURCE / "appearance.json").read_text())
            for key, value in tracked.items():
                self.assertEqual(restored[key], value)
            self.assertEqual(restored["theme"], "system")
            for mode, dark in (("light", False), ("dark", True)):
                theme = restored["theme_pair"][mode]
                self.assertEqual(theme["palette"]["dark"], dark)
                copied = target / "themes" / theme["filename"]
                self.assertFalse(copied.is_symlink())
                self.assertEqual(copied.stat().st_mode & 0o777, 0o644)
                self.assertEqual(copied.read_bytes(),
                                 (SOURCE / "themes" / theme["filename"]).read_bytes())
            self.assertEqual(history.read_text(), "leave alone\n")

    def test_process_guard_and_invalid_settings_do_not_write(self):
        module = self.module
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            target = home / "Library/Application Support/me.paolino.spotifast"
            target.mkdir(parents=True)
            settings = target / "settings.json"
            settings.write_text("{broken json")
            with patch.object(module.Path, "home", return_value=home), patch.object(
                module.subprocess, "run"
            ) as process:
                for code in (0, 2):
                    process.return_value = subprocess.CompletedProcess([], code)
                    with self.assertRaises(SystemExit):
                        module.main(SOURCE)
                process.return_value = subprocess.CompletedProcess([], 1)
                with self.assertRaises(json.JSONDecodeError):
                    module.main(SOURCE)
            self.assertEqual(settings.read_text(), "{broken json")
            self.assertFalse((target / "themes").exists())

    def test_symlinked_settings_are_not_replaced(self):
        module = self.module
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            original = home / "original.json"
            original.write_text("{}")
            target = home / "Library/Application Support/me.paolino.spotifast"
            target.mkdir(parents=True)
            settings = target / "settings.json"
            settings.symlink_to(original)
            with patch.object(module.Path, "home", return_value=home), patch.object(
                module.subprocess, "run", return_value=subprocess.CompletedProcess([], 1)
            ):
                with self.assertRaisesRegex(SystemExit, "symlinked"):
                    module.main(SOURCE)
            self.assertTrue(settings.is_symlink())
            self.assertEqual(original.read_text(), "{}")
            self.assertFalse((target / "themes").exists())

    def test_fresh_profile(self):
        module = self.module
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            with patch.object(module.Path, "home", return_value=home), patch.object(
                module.subprocess, "run", return_value=subprocess.CompletedProcess([], 1)
            ):
                module.main(SOURCE)
            target = home / "Library/Application Support/me.paolino.spotifast"
            self.assertEqual(json.loads((target / "settings.json").read_text()),
                             json.loads((SOURCE / "appearance.json").read_text()))


if __name__ == "__main__":
    unittest.main()
