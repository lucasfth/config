#!/bin/bash
# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Quick Note
# @raycast.mode silent
# @raycast.argument1 { "type": "text", "placeholder": "note content", "optional": false }
# @raycast.icon 📝
# Optional parameters:
# @raycast.packageName Obsidian
# @raycast.description Append a quick timestamped note to today's daily note in the Obsidian vault.

VAULT="$HOME/Desktop/code/loki-obsidian-memory"
DAILY_DIR="$VAULT/daily"
TODAY=$(date +%Y-%m-%d)
FILE="$DAILY_DIR/$TODAY.md"

mkdir -p "$DAILY_DIR"

if [ ! -f "$FILE" ]; then
  echo "# $TODAY" > "$FILE"
  echo "" >> "$FILE"
  echo "## Quick Notes" >> "$FILE"
  echo "" >> "$FILE"
fi

TIMESTAMP=$(date '+%H:%M')
echo "- **$TIMESTAMP** — $1" >> "$FILE"

echo "✅ Saved to daily/$TODAY.md"
