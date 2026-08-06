#!/usr/bin/env bash
# Workspace pill colors: mauve=focused, teal=interactive, surface0=non-interactive

source "$CONFIG_DIR/plugins/colors.sh"

SID="$1"
FOCUSED="${FOCUSED_WORKSPACE:-$(aerospace list-workspaces --focused 2>/dev/null)}"
HAS_WINDOWS=$(aerospace list-windows --workspace "$SID" 2>/dev/null | wc -l | tr -d ' ')

if [ "$SID" = "$FOCUSED" ]; then
  sketchybar --set "$NAME" \
    background.color="$MAUVE" \
    icon.color="$BAR_COLOR" \
    label.color="$BAR_COLOR"
elif [ "$HAS_WINDOWS" -gt 0 ]; then
  sketchybar --set "$NAME" \
    background.color="$TEAL" \
    icon.color="$BAR_COLOR" \
    label.color="$BAR_COLOR"
else
  sketchybar --set "$NAME" \
    background.color="$SURFACE0" \
    icon.color="$TEXT" \
    label.color="$TEXT"
fi
