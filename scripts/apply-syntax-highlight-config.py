#!/usr/bin/env python3
"""Apply tracked Syntax Highlight themes and preferences without replacing user state."""

import json
from pathlib import Path
import shutil
import subprocess
import sys

source = Path(sys.argv[1])
settings = json.loads((source / "settings.json").read_text())
home = Path.home()
themes = home / "Library/Application Support/Syntax Highlight/Themes"
preferences = home / "Library/Preferences/org.sbarex.SourceCodeSyntaxHighlight.plist"

# The renderer is unsandboxed; its preferences are not the GUI's sandbox plist.
# Use the explicit path so defaults does not resolve to the GUI's container.
if subprocess.run(["/usr/bin/pgrep", "-x", "Syntax Highlight"],
                  stdout=subprocess.DEVNULL).returncode == 0:
    sys.exit("Quit Syntax Highlight before applying its configuration.")

themes.mkdir(parents=True, exist_ok=True)
for name in ("catppuccin-latte", "catppuccin-mocha"):
    shutil.copyfile(source / "themes" / f"{name}.theme", themes / f"{name}.theme")

for key, value in settings.items():
    value_type = "-int" if isinstance(value, int) else "-string"
    subprocess.run(["/usr/bin/defaults", "write", str(preferences), key,
                    value_type, str(value)], check=True)

print("Syntax Highlight: applied Catppuccin Latte/Mocha, JetBrains Mono Nerd Font, 2-space tabs.")
