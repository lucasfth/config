#!/usr/bin/env bash
source "$CONFIG_DIR/plugins/colors.sh"

INFO=$(pmset -g batt 2>/dev/null)
PERCENT=$(echo "$INFO" | grep -o '[0-9]\+%' | head -1 | tr -d '%')
STATUS=$(echo "$INFO" | grep -o 'discharging\|charging\|AC attached\|charged' | head -1)

case "$STATUS" in
  "discharging")
    if [ "$PERCENT" -le 20 ]; then
      COLOR="$RED"
      ICON=""
    elif [ "$PERCENT" -le 50 ]; then
      COLOR="$YELLOW"
      ICON=""
    elif [ "$PERCENT" -le 80 ]; then
      COLOR="$TEXT"
      ICON=""
    else
      COLOR="$GREEN"
      ICON=""
    fi
    ;;
  "charging"|"AC attached")
    COLOR="$GREEN"
    ICON=""
    ;;
  "charged"|*)
    COLOR="$GREEN"
    ICON=""
    PERCENT="100"
    ;;
esac

sketchybar --set "$NAME" icon="$ICON" icon.color="$COLOR" label="${PERCENT}%" label.color="$COLOR"
