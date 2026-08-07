#!/usr/bin/env bash
# Battery percentage with icon
info=$(pmset -g batt 2>/dev/null)
pct=$(echo "$info" | grep -o '[0-9]\+%' | head -1 | tr -d '%')
status=$(echo "$info" | grep -o 'discharging\|charging\|AC attached\|charged' | head -1)

case "$status" in
  discharging)
    if   [ "$pct" -le 20 ]; then icon="🪫"
    elif [ "$pct" -le 50 ]; then icon="🔋"
    else icon="🔋"
    fi
    echo "$icon $pct%" ;;
  charging|"AC attached")
    echo "⚡ $pct%" ;;
  charged|*)
    echo "🔌 $pct%" ;;
esac
