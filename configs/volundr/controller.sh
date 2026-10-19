#!/bin/sh
# Periodic wake-friendly trigger; delivery is once per Copenhagen calendar day.
set -eu
export PATH="$HOME/.nix-profile/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
CODE="$HOME/.local/libexec/volundr"
exec python3 "$CODE/controller.py" --config "$HOME/.local/state/volundr/config.git" --library "$HOME/.local/state/volundr/library.git"
