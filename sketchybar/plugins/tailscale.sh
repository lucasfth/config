#!/usr/bin/env bash
source "$CONFIG_DIR/plugins/colors.sh"

if /Applications/Tailscale.app/Contents/MacOS/Tailscale status &>/dev/null; then
  COLOR="$GREEN"
  ICON="󰴳"
else
  COLOR="$OVERLAY0"
  ICON="󰴳"
fi

sketchybar --set "$NAME" icon="$ICON" icon.color="$COLOR" label.drawing=off
