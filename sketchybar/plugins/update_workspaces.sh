#!/usr/bin/env bash
# Dynamically show/hide workspaces — only show non-empty workspaces + focused.

source "$CONFIG_DIR/plugins/colors.sh"

FOCUSED=$(aerospace list-workspaces --focused 2>/dev/null)
VISIBLE=$(aerospace list-workspaces --monitor all --visible 2>/dev/null | sort -u)
REGISTERED=$(sketchybar --query bar | jq -r '.items[]' | grep '^space\.' | sed 's/space\.//')

for sid in $REGISTERED; do
  HAS_WINDOWS=$(aerospace list-windows --workspace "$sid" 2>/dev/null | wc -l | tr -d ' ')

  if [ "$sid" = "$FOCUSED" ]; then
    # Focused workspace: always show
    sketchybar --set "space.$sid" drawing=on
  elif [ "$HAS_WINDOWS" -gt 0 ] && echo "$VISIBLE" | grep -qx "$sid"; then
    # Non-focused workspace with windows: show normally
    sketchybar --set "space.$sid" drawing=on
  else
    # Empty or hidden: don't show
    sketchybar --set "space.$sid" drawing=off
  fi
done
