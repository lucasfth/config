#!/bin/bash

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Ask Huginn
# @raycast.mode silent
# @raycast.argument1 { "type": "text", "placeholder": "install firefox / refactor auth / …", "optional": false }
# @raycast.icon 🤖

# Optional parameters:
# @raycast.packageName Huginn
# @raycast.description Quick-access Huginn session in Ghostty.

TMPFILE=$(mktemp /tmp/huginn-prompt.XXXXXX)
printf '%s' "$1" > "$TMPFILE"
open -na Ghostty --args -e /Users/lucasfreytorreshanson/.local/bin/huginn-runner "$TMPFILE"
