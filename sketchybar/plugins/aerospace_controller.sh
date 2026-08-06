#!/usr/bin/env bash
# Single controller: queries aerospace once, updates all space.* items.
# Avoids timer death (items that reach drawing=off stop receiving events).

source "$CONFIG_DIR/plugins/colors.sh"

FOCUSED=$(aerospace list-workspaces --focused 2>/dev/null)
ITEMS=$(sketchybar --query bar | python3 -c "import sys,json; print(' '.join([i for i in json.load(sys.stdin)['items'] if i.startswith('space.')]))")

for item in $ITEMS; do
  SID="${item#space.}"
  HAS_WINDOWS=$(aerospace list-windows --workspace "$SID" 2>/dev/null | wc -l | tr -d ' ')

  if [ "$SID" = "$FOCUSED" ]; then
    sketchybar --set "$item" \
      drawing=on \
      background.color="$MAUVE" \
      icon.color="$BAR_COLOR" \
      label.color="$BAR_COLOR"
  elif [ "$HAS_WINDOWS" -gt 0 ]; then
    sketchybar --set "$item" \
      drawing=on \
      background.color="$TEAL" \
      icon.color="$BAR_COLOR" \
      label.color="$BAR_COLOR"
  else
    sketchybar --set "$item" drawing=off
  fi
done
