#!/usr/bin/env bash
# Setup herdr on a remote machine with the config from this repo.
# Run on the remote: curl -fsSL https://raw.githubusercontent.com/lucasfth/config/main/scripts/setup-herdr-remote.sh | bash
set -euo pipefail

CONFIG_URL="https://raw.githubusercontent.com/lucasfth/config/main/herdr/config.toml"
CONFIG_DIR="$HOME/.config/herdr"

echo "==> Installing herdr..."
if ! command -v herdr >/dev/null 2>&1; then
  curl -fsSL https://herdr.dev/install.sh | sh
fi

echo "==> Configuring herdr..."
mkdir -p "$CONFIG_DIR"
curl -fsSL "$CONFIG_URL" -o "$CONFIG_DIR/config.toml"

echo "==> Done. herdr $(herdr --version) configured at $CONFIG_DIR/config.toml"
