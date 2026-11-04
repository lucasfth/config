#!/usr/bin/env python3
"""Consumer checks: installed Ghostty must use Obel, not silent fallback."""

from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[1]
config = f"--config-file={root / 'configs/ghostty/config'}"
subprocess.run(["ghostty", "+validate-config", config], check=True)


def face(character, style="regular"):
    result = subprocess.run(
        ["ghostty", "+show-face", config, f"--style={style}", f"--cp={ord(character)}"],
        check=True, text=True, capture_output=True,
    )
    return result.stdout + result.stderr


for style in ("regular", "bold", "italic", "bold_italic"):
    for character in "AaæøåÆØÅ":
        resolved = face(character, style)
        assert "found in face “Obel Mono”" in resolved, resolved
for character in "\uedea\uf2db\uefc5\uf0a0\uf418\U000f0219":
    resolved = face(character)
    assert "found in face “JetBrainsMono Nerd Font”" in resolved, resolved
for character in "─│╭╮╰╯█▓▒░⠋⣿":
    resolved = face(character)
    assert "internal sprites" in resolved, resolved
print("PASS: Obel Roman/bold/italic/bold-italic, Danish, raven/icons and terminal drawing.")
