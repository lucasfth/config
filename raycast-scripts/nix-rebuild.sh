#!/bin/bash
# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Nix Rebuild
# @raycast.mode silent
# @raycast.icon ❄️
# Optional parameters:
# @raycast.packageName Nix
# @raycast.description Rebuild nix-darwin config in a new terminal window.
# Note: shell won't reload in the spawning context — open new terminal after.

open -na Ghostty --args -e /bin/bash -c "
  cd ~/config
  echo '⟳ Rebuilding nix config...'
  sudo darwin-rebuild switch --flake ~/config 2>&1
  echo
  echo '✅ Done. Shell reload: exec zsh'
  echo 'Press any key to close.'
  read -n 1
"
