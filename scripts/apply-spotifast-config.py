#!/usr/bin/env python3
"""Restore managed appearance without replacing Spotifast's private user state."""

import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile


def atomic_write(path, content, mode=0o600):
    # Replace symlinks too: Spotifast requires regular custom-theme files.
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as temporary:
        temporary_path = Path(temporary.name)
        try:
            temporary.write(content)
            temporary.flush()
            os.fsync(temporary.fileno())
            os.fchmod(temporary.fileno(), mode)
            temporary_path.replace(path)
        finally:
            temporary_path.unlink(missing_ok=True)


def main(source):
    running = subprocess.run(["/usr/bin/pgrep", "-x", "Spotifast"],
                             stdout=subprocess.DEVNULL)
    if running.returncode == 0:
        sys.exit("Quit Spotifast before applying its configuration.")
    if running.returncode != 1:
        sys.exit("Could not check whether Spotifast is running; no changes made.")

    appearance = json.loads((source / "appearance.json").read_text())
    keys = {"theme", "custom_theme", "custom_theme_cache", "theme_pair", "accent_from_art"}
    if (set(appearance) != keys or appearance["theme"] != "system"
            or appearance["custom_theme"] is not None
            or appearance["custom_theme_cache"] is not None
            or not isinstance(appearance["accent_from_art"], bool)):
        sys.exit("Invalid managed Spotifast appearance settings.")

    # Keep the GUI's serialized native theme_pair, including its first-frame palettes.
    themes = {}
    for mode, dark in (("light", False), ("dark", True)):
        theme = appearance["theme_pair"][mode]
        name = theme["filename"]
        if (not isinstance(name, str) or Path(name).name != name
                or not name.endswith(".json") or theme["palette"]["dark"] is not dark):
            sys.exit("Invalid Spotifast light/dark theme selection.")
        content = (source / "themes" / name).read_bytes()
        json.loads(content)
        themes[name] = content

    target = Path.home() / "Library/Application Support/me.paolino.spotifast"
    settings = target / "settings.json"
    if settings.is_symlink():
        sys.exit("Refusing to replace symlinked Spotifast settings.")
    current = json.loads(settings.read_text()) if settings.exists() else {}
    if not isinstance(current, dict):
        sys.exit("Invalid existing Spotifast settings; no changes made.")
    current.update(appearance)
    content = (json.dumps(current, indent=2) + "\n").encode()

    # Validate every input before touching the profile. Never touch auth/history/session.
    (target / "themes").mkdir(parents=True, exist_ok=True)
    for name, theme_content in themes.items():
        atomic_write(target / "themes" / name, theme_content, mode=0o644)
    atomic_write(settings, content)
    print("Spotifast: applied native system-following Catppuccin Latte/Mocha.")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("Usage: apply-spotifast-config.py SOURCE_DIRECTORY")
    main(Path(sys.argv[1]))
