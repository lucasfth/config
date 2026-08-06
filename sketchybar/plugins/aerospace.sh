#!/usr/bin/env bash
# Workspace pill: colors + show/hide based on focus and windows

source "$CONFIG_DIR/plugins/colors.sh"

SID="$1"
FOCUSED="${FOCUSED_WORKSPACE:-$(aerospace list-workspaces --focused 2>/dev/null)}"
HAS_WINDOWS=$(aerospace list-windows --workspace "$SID" 2>/dev/null | wc -l | tr -d ' ')

# Determine drawing: always show focused and workspaces with windows
if [ "$SID" = "$FOCUSED" ] || [ "$HAS_WINDOWS" -gt 0 ]; then
  DRAWING=on
else
  DRAWING=off
fi

# Set color
if [ "$SID" = "$FOCUSED" ]; then
  sketchybar --set "$NAME" \
    drawing="$DRAWING" \
    background.color="$MAUVE" \
    icon.color="$BAR_COLOR" \
    label.color="$BAR_COLOR"
elif [ "$HAS_WINDOWS" -gt 0 ]; then
  sketchybar --set "$NAME" \
    drawing="$DRAWING" \
    background.color="$TEAL" \
    icon.color="$BAR_COLOR" \
    label.color="$BAR_COLOR"
else
  sketchybar --set "$NAME" \
    drawing="$DRAWING" \
    background.color="$SURFACE0" \
    icon.color="$TEXT" \
    label.color="$TEXT"
fi
