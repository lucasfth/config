#!/usr/bin/env bash
# In-place Catppuccin theme switch on macOS appearance change.
# Fires via sketchybar AppleInterfaceThemeChangedNotification.
source "$HOME/.config/sketchybar/plugins/colors.sh"

# ── Bar background ─────────────────────────────────────────────
sketchybar --bar color="$BAR_COLOR"

# ── Global defaults ────────────────────────────────────────────
sketchybar --default icon.color="$TEXT" label.color="$TEXT"

# ── Items with static background colors ────────────────────────
sketchybar --set clock    background.color="$SURFACE0"
sketchybar --set date     background.color="$SURFACE0"
sketchybar --set battery  background.color="$SURFACE0"

# ── Spotify (icon.color managed by spotify.sh) ─────────────────
sketchybar --set spotify \
  background.color="$TEAL" \
  label.color="$BAR_COLOR"

# ── Force-update all script-driven items ───────────────────────
sketchybar --update
