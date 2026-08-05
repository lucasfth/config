#!/usr/bin/env bash
# Spotify now-playing for Sketchybar

source "$CONFIG_DIR/plugins/colors.sh"

STATE=$(osascript -e 'tell application "Spotify" to player state' 2>/dev/null)

if [ "$STATE" = "playing" ]; then
  TRACK=$(osascript -e 'tell application "Spotify" to name of current track' 2>/dev/null)
  ARTIST=$(osascript -e 'tell application "Spotify" to artist of current track' 2>/dev/null)
  if [ -n "$TRACK" ]; then
    LABEL="${ARTIST:0:20} — ${TRACK:0:30}"
    sketchybar --set "$NAME" \
      drawing=on \
      icon="" \
      icon.color="$GREEN" \
      label="$LABEL" \
      label.color="$TEXT"
  fi
elif [ "$STATE" = "paused" ]; then
  TRACK=$(osascript -e 'tell application "Spotify" to name of current track' 2>/dev/null)
  if [ -n "$TRACK" ]; then
    LABEL="${TRACK:0:40}"
    sketchybar --set "$NAME" \
      drawing=on \
      icon="" \
      icon.color="$OVERLAY0" \
      label="$LABEL" \
      label.color="$SUBTEXT0"
  fi
else
  sketchybar --set "$NAME" drawing=off
fi
