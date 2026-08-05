#!/usr/bin/env bash
source "$CONFIG_DIR/plugins/colors.sh"

sketchybar --set "$NAME" label="$(date '+%H:%M')" label.color="$TEXT" icon.drawing=off
