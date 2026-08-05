#!/usr/bin/env bash
source "$CONFIG_DIR/plugins/colors.sh"

sketchybar --set "$NAME" label="$(date '+%a %-d %b')" label.color="$SUBTEXT0" icon.drawing=off
