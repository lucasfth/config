#!/usr/bin/env bash
# Memory pressure graph — pushes values 0.0–1.0 to sketchybar graph item

source "$CONFIG_DIR/plugins/colors.sh"

# Get system-wide memory free percentage (0-100), invert to get used percentage
FREE=$(memory_pressure 2>/dev/null | grep "System-wide memory free percentage" | grep -o '[0-9]\+' | head -1)

if [ -n "$FREE" ]; then
  USED=$((100 - FREE))
  # mem_pressure_level is 0 (normal), 1 (warning), 2 (critical)
  LEVEL=$(sysctl -n kern.memorystatus_level 2>/dev/null || echo 0)
  
  case "$LEVEL" in
    2) GRAPH_COLOR="$RED" ;;
    1) GRAPH_COLOR="$YELLOW" ;;
    *) GRAPH_COLOR="$MAUVE" ;;
  esac
  
  VALUE=$(printf "%.3f" "$(echo "$USED / 100" | bc -l 2>/dev/null || echo 0)")
  sketchybar --set "$NAME" graph.color="$GRAPH_COLOR"
  sketchybar --push "$NAME" "$VALUE"
fi
