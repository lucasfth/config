#!/usr/bin/env bash
# Triggered by launchd when .GlobalPreferences.plist changes.
# Restarts sketchybar so it picks up the new appearance.
launchctl kickstart -k gui/$(id -u)/org.nixos.sketchybar 2>/dev/null
