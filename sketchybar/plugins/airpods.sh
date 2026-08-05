#!/usr/bin/env bash
source "$CONFIG_DIR/plugins/colors.sh"

# Check if AirPods are connected via Bluetooth
AIRPODS_INFO=$(system_profiler SPBluetoothDataType 2>/dev/null | grep -A 20 "AirPods" | grep "Connected: Yes")

if [ -n "$AIRPODS_INFO" ]; then
  sketchybar --set "$NAME" drawing=on icon="󰗾" icon.color="$LAVENDER" label.drawing=off
else
  sketchybar --set "$NAME" drawing=off
fi
