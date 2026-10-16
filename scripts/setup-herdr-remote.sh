#!/usr/bin/env bash
# Setup Herdr and the host-summary plugin on a remote machine.
# Run from this checkout, or use:
# curl -fsSL https://raw.githubusercontent.com/lucasfth/config/main/scripts/setup-herdr-remote.sh | bash
set -euo pipefail

CONFIG_DIR="$HOME/.config/herdr"
PLUGIN_DIR="$HOME/.local/share/herdr/plugins/huginn-host-summary"
REPO_URL="https://raw.githubusercontent.com/lucasfth/config/main/configs/herdr"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" 2>/dev/null && pwd -P || true)"
SOURCE_DIR=""
HERDR=""

die() { printf 'Error: %s\n' "$*" >&2; exit 1; }

if ! command -v jq >/dev/null 2>&1; then
  die "jq is required by the Herdr host-summary plugin; install jq and rerun (no OS packages were installed)."
fi
command -v curl >/dev/null 2>&1 || die "curl is required to download Herdr or configuration files."

if command -v herdr >/dev/null 2>&1; then
  HERDR="$(command -v herdr)"
elif [[ -x "$HOME/.local/bin/herdr" ]]; then
  HERDR="$HOME/.local/bin/herdr"
else
  if [[ -n "${TERMUX_VERSION:-}" || "${PREFIX:-}" == /data/data/com.termux/files/usr ]]; then
    die "Herdr is not installed in Termux. The stock installer is unsupported on Android; install a compatible Herdr build first."
  fi
  printf '==> Installing Herdr...\n'
  curl -fsSL https://herdr.dev/install.sh | sh
  if command -v herdr >/dev/null 2>&1; then
    HERDR="$(command -v herdr)"
  elif [[ -x "$HOME/.local/bin/herdr" ]]; then
    HERDR="$HOME/.local/bin/herdr"
  else
    die "Herdr installer completed but no executable was found on PATH or at ~/.local/bin/herdr."
  fi
fi

pick_shell() {
  local candidate
  candidate="$(command -v zsh 2>/dev/null || true)"
  if [[ -n "$candidate" && -x "$candidate" ]]; then
    printf '%s\n' "$candidate"
    return
  fi
  candidate="$HOME/.nix-profile/bin/zsh"
  if [[ -x "$candidate" ]]; then
    printf '%s\n' "$candidate"
    return
  fi
  candidate="$(command -v bash 2>/dev/null || true)"
  [[ -n "$candidate" && -x "$candidate" ]] || die "Neither an installed zsh nor bash executable was found."
  printf '%s\n' "$candidate"
}

get_default_shell() {
  awk '
    /^\[terminal\][[:space:]]*$/ { in_terminal=1; next }
    /^\[/ { in_terminal=0 }
    in_terminal && /^[[:space:]]*default_shell[[:space:]]*=/ {
      value=$0; sub(/^[^=]*=[[:space:]]*/, "", value); gsub(/^[\"]|[\"][[:space:]]*$/, "", value); print value; exit
    }
  ' "$1"
}

replace_default_shell() {
  local file="$1" shell="$2"
  awk -v shell="$shell" '
    /^\[terminal\][[:space:]]*$/ { in_terminal=1; print; next }
    /^\[/ { in_terminal=0 }
    in_terminal && /^[[:space:]]*default_shell[[:space:]]*=/ {
      print "default_shell = \"" shell "\""; updated=1; next
    }
    { print }
    END { if (!updated) exit 2 }
  ' "$file" > "$file.tmp" || { rm -f "$file.tmp"; return 0; }
  mv "$file.tmp" "$file"
}

fetch_source() {
  local relative="$1" destination="$2"
  if [[ -n "$SOURCE_DIR" && -f "$SOURCE_DIR/$relative" ]]; then
    cp "$SOURCE_DIR/$relative" "$destination"
  else
    curl -fsSL "$REPO_URL/$relative" -o "$destination"
  fi
}

if [[ -n "$SCRIPT_DIR" && -f "$SCRIPT_DIR/../configs/herdr/config.toml" && -f "$SCRIPT_DIR/../configs/herdr/host-summary/summary.sh" ]]; then
  SOURCE_DIR="$(cd "$SCRIPT_DIR/../configs/herdr" && pwd -P)"
fi

printf '==> Configuring Herdr...\n'
mkdir -p "$CONFIG_DIR"
desired_shell="$(pick_shell)"
if [[ ! -e "$CONFIG_DIR/config.toml" ]]; then
  fetch_source config.toml "$CONFIG_DIR/config.toml"
  replace_default_shell "$CONFIG_DIR/config.toml" "$desired_shell"
else
  current_shell="$(get_default_shell "$CONFIG_DIR/config.toml")"
  if [[ -n "$current_shell" ]] && ! command -v "$current_shell" >/dev/null 2>&1; then
    replace_default_shell "$CONFIG_DIR/config.toml" "$desired_shell"
    printf 'Updated unresolved terminal.default_shell to %s; preserved all other settings.\n' "$desired_shell"
  fi
fi

mkdir -p "$PLUGIN_DIR"
fetch_source host-summary/herdr-plugin.toml "$PLUGIN_DIR/herdr-plugin.toml"
fetch_source host-summary/summary.sh "$PLUGIN_DIR/summary.sh"
chmod 755 "$PLUGIN_DIR/summary.sh"
"$HERDR" plugin link "$PLUGIN_DIR"

printf '==> Done. Herdr %s configured at %s/config.toml; host-summary linked from %s\n' \
  "$($HERDR --version)" "$CONFIG_DIR" "$PLUGIN_DIR"
