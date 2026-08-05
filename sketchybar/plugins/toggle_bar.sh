#!/usr/bin/env bash
# Toggle system menu bar visibility (Hidden Bar replacement)
# Shows/hides macOS menu bar so you can access tray icons

CURRENT=$(osascript -e 'tell application "System Events" to tell dock preferences to get autohide menu bar')
if [ "$CURRENT" = "true" ]; then
  osascript -e 'tell application "System Events" to tell dock preferences to set autohide menu bar to false'
else
  osascript -e 'tell application "System Events" to tell dock preferences to set autohide menu bar to true'
fi
