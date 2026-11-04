#!/usr/bin/env python3
"""Check developer masking configuration and optional fake-token font shaping."""

import argparse
from pathlib import Path
import json
import shutil
import subprocess

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--font", type=Path, help="Also verify ss01 shaping with installed hb-shape")
args = parser.parse_args()
ghostty = (root / "configs/ghostty/config").read_text()
assert "font-feature = ss01" in ghostty and "font-feature = -ss01" not in ghostty
zed = (root / "configs/zed/settings.json").read_text()
assert '"buffer_font_features": { "ss01": true }' in zed
assert '"font_features": { "ss01": true }' in zed
code = json.loads((root / "configs/vscode/font-settings.json").read_text())
assert code["editor.fontLigatures"] == "'ss01' on"
assert code["terminal.integrated.fontLigatures.enabled"] is True
assert code["terminal.integrated.fontLigatures.featureSettings"] == '"calt" on, "ss01" on'
if args.font:
    assert shutil.which("hb-shape"), "hb-shape required for requested shaping verification"
    tokens = ["AKIA" + "A" * 16, "xoxb-" + "1" * 11 + "-" + "2" * 11 + "-" + "a" * 24]
    for token in tokens:
        shaped = []
        for enabled in (0, 1):
            shaped.append(subprocess.check_output(
                ["hb-shape", f"--features=ss01={enabled}", str(args.font), token], text=True))
        assert "secret.mask" not in shaped[0]
        assert "secret.mask" in shaped[1]
    ordinary = subprocess.check_output(
        ["hb-shape", "--features=ss01=1", str(args.font), "ordinary text æøå"], text=True)
    assert "secret.mask" not in ordinary
print("PASS: developer masking settings" + (" and fake-token ss01 substitutions" if args.font else ""))
