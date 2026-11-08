#!/usr/bin/env python3
"""Managed Herdr picker/title policy and shell-hook regression checks."""
import pathlib
import subprocess
import tempfile
import tomllib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]


class HerdrCustomization(unittest.TestCase):
    def test_picker_replaces_goto_not_previous_tab(self):
        config = tomllib.loads((ROOT / "configs/herdr/config.toml").read_text())
        keys = config["keys"]
        self.assertEqual(keys.get("goto"), [])
        self.assertEqual(keys.get("previous_tab", "prefix+p"), "prefix+p")
        commands = [cmd for cmd in keys.get("command", []) if cmd["key"] == "prefix+g"]
        self.assertEqual(len(commands), 1)
        self.assertEqual(commands[0]["type"], "shell")
        self.assertEqual(commands[0]["command"], '"$HERDR_BIN_PATH" plugin pane open --plugin herdr-omni --entrypoint picker')
        self.assertFalse(config["ui"]["prompt_new_tab_name"])

    def test_title_policy_has_no_sidebar_or_transcript_features(self):
        policy = ROOT / "configs/herdr/automatic-rename.sh"
        result = subprocess.run(
            ["bash", "-c", 'source "$1"; printf "%s\\n" "$NAME_TABS" "$NAME_PANES" "$PANE_TOPICS" "$AUTO_INDEX" "$AGENT_TRANSCRIPT" "$SHOW_PROGRAM_ARGS" "$AGENT_TITLES"', "test", str(policy)],
            check=True, capture_output=True, text=True,
        )
        self.assertEqual(result.stdout.splitlines(), ["1", "0", "0", "0", "0", "0", "1"])

    def test_shell_hook_is_guarded_and_idempotent(self):
        # Exercise the exact source block without loading unrelated shell customizations.
        source = (ROOT / "nix/common/shell/interactive.zsh").read_text()
        start = source.index("# Managed Herdr automatic tab titles.")
        block = source[start:source.index("# Select by OS", start)]
        with tempfile.TemporaryDirectory() as tmp:
            home = pathlib.Path(tmp)
            hook = home / ".config/herdr/plugins/herdr-automatic-rename/shell/hook.zsh"
            hook.parent.mkdir(parents=True)
            hook.write_text('autoload -Uz add-zsh-hook\n_har_preexec() { :; }\nadd-zsh-hook preexec _har_preexec\n')
            script = home / "check.zsh"
            script.write_text(block + '\n' + block + '\nprint -r -- ${preexec_functions}\n')
            for pane, expected in [("", ""), ("w1:t1:p1", "_har_preexec")]:
                result = subprocess.run(
                    ["zsh", "-f", str(script)], env={"HOME": tmp, "HERDR_PANE_ID": pane},
                    check=True, capture_output=True, text=True,
                )
                self.assertEqual(result.stdout.strip(), expected)


if __name__ == "__main__":
    unittest.main()
