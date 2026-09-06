#!/bin/bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VAULT="$HOME/vault"
PROJECTS="$VAULT/projects"
WORKDIR="${1:-$(pwd)}"
# Separate prompt text keeps the shell flow readable.
PROMPT_FILE="$SCRIPT_DIR/save-to-vault.prompt.md"

# ── Detect project ──────────────────────────────────────────
BRANCH=$(git -C "$WORKDIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")
REMOTE=$(git -C "$WORKDIR" remote get-url origin 2>/dev/null || echo "")
if [ -n "$REMOTE" ]; then
  PROJECT=$(echo "$REMOTE" | sed -E 's|.*[:/]([^/]+/[^/]+)(\.git)?$|\1|')
else
  PROJECT="_local/$(basename "$WORKDIR")"
fi
PROJECT="${PROJECT%.git}"

# ── Find latest session JSONL ───────────────────────────────
MATCH_DIR=$(find "$HOME/.omp/agent/sessions" -maxdepth 1 -type d -name "*$(basename "$WORKDIR")*" 2>/dev/null | head -1)
LATEST_JSONL=$(ls -t "$MATCH_DIR"/*.jsonl 2>/dev/null | head -1)
if [ -z "$LATEST_JSONL" ] || [ ! -f "$LATEST_JSONL" ]; then
  echo "[vault] No session JSONL found, skipping"
  exit 0
fi

# ── Extract session metadata ────────────────────────────────
SESSION_TITLE=$(python3 -c "
import json
with open('$LATEST_JSONL') as f:
    for line in f:
        d = json.loads(line)
        if d.get('type') == 'session':
            print(d.get('title',''))
            break
" 2>/dev/null)

FIRST_USER_MSG=$(python3 -c "
import json
with open('$LATEST_JSONL') as f:
    for line in f:
        d = json.loads(line)
        msg = d.get('message') or d
        if d.get('type') == 'message' and msg.get('role') == 'user':
            content = msg.get('content','')
            if isinstance(content, list):
                content = ' '.join(p.get('text','') for p in content if p.get('type')=='text')
            print(content[:500])
            break
" 2>/dev/null)

MSG_COUNT=$(python3 -c "
import json
with open('$LATEST_JSONL') as f:
    print(sum(1 for line in f if json.loads(line).get('type') == 'message'))
" 2>/dev/null)

# ── Summarize via DeepSeek ──────────────────────────────────
SUMMARY=""
SUMMARY_DATA='{"summary":"","wins":[],"corrections":[]}'
TAG_DATA='[]'
CONVO=$(python3 -c "
import json
with open('$LATEST_JSONL') as f:
    lines = []
    for line in f:
        d = json.loads(line)
        msg = d.get('message') or d
        if d.get('type') == 'message':
            role = msg.get('role','?')
            content = msg.get('content','')
            if isinstance(content, list):
                content = ' '.join(p.get('text','') for p in content if p.get('type')=='text')
            lines.append(f'{role}: {content[:300]}')
    print('\n'.join(lines[-40:]))
" 2>/dev/null)

if [ -n "$CONVO" ]; then
  XAI_KEY="${XAI_API_KEY:-}"
  if [ -n "$XAI_KEY" ]; then
    if [ -r "$PROMPT_FILE" ]; then
      SUMMARY_PROMPT=$(cat "$PROMPT_FILE")
    else
      SUMMARY_PROMPT='Return valid JSON with summary, wins, corrections, and tags.'
    fi

    SUMMARY_RAW=$(python3 -c "
import json, sys
convo = sys.stdin.read()
prompt = sys.argv[1]
payload = json.dumps({
  'model': 'grok-4.3',
  'input': [
    {'role': 'system', 'content': prompt},
    {'role': 'user', 'content': convo}
  ],
  'max_output_tokens': 1000,
})
print(payload)
" "$SUMMARY_PROMPT" <<< "$CONVO" 2>/dev/null | curl -sS https://api.x.ai/v1/responses \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $XAI_KEY" \
      -d @- 2>/dev/null | python3 -c "
import json, sys
try:
    response = json.load(sys.stdin)
    texts = [
        content.get('text', '')
        for output in response.get('output', [])
        for content in output.get('content', [])
        if content.get('type') == 'output_text'
    ]
    if texts:
        print(texts[0])
except (json.JSONDecodeError, AttributeError, TypeError):
    pass
" 2>/dev/null)
    SUMMARY="$SUMMARY_RAW"

    SUMMARY_DATA=$(python3 -c "
import json, sys
raw = sys.stdin.read().strip()
fallback = {'summary': '', 'wins': [], 'corrections': [], 'tags': []}

if not raw:
  print(json.dumps(fallback, ensure_ascii=False))
  raise SystemExit(0)

try:
  data = json.loads(raw)
except json.JSONDecodeError:
  fallback['summary'] = raw
  print(json.dumps(fallback, ensure_ascii=False))
  raise SystemExit(0)

summary = data.get('summary') or data.get('Summary') or ''
wins = data.get('wins') or data.get('what_went_well') or []
corrections = data.get('corrections') or data.get('mistakes') or []

if isinstance(wins, str):
  wins = [wins]
if isinstance(corrections, str):
  corrections = [corrections]

normalized = {
  'summary': summary.strip(),
  'wins': [str(item).strip() for item in wins if str(item).strip()],
  'corrections': [str(item).strip() for item in corrections if str(item).strip()],
}
print(json.dumps(normalized, ensure_ascii=False))
" <<< "$SUMMARY_RAW" 2>/dev/null)

    TAG_RAW=$(python3 -c "
import json, sys
convo = sys.stdin.read()
payload = json.dumps({
  'model': 'grok-4.3',
  'input': [
    {'role': 'system', 'content': 'Return a JSON object with a \"tags\" key: an array of 2-7 short lowercase-hyphenated strings. Each tag must describe a concrete technology, tool, file, or action from the session (e.g. nix, brew, ghostty, homebrew-nix, darwin-rebuild, shell-config, vault-hook, prompt-engineering). NEVER include project or branch names. Example: {\"tags\": [\"nix\", \"homebrew-nix\", \"ghostty\"]}'},
    {'role': 'user', 'content': convo}
  ],
  'max_output_tokens': 300,
})
print(payload)
" <<< "$CONVO" 2>/dev/null | curl -sS https://api.x.ai/v1/responses \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $XAI_KEY" \
      -d @- 2>/dev/null | python3 -c "
import json, sys
try:
    response = json.load(sys.stdin)
    texts = [
        content.get('text', '')
        for output in response.get('output', [])
        for content in output.get('content', [])
        if content.get('type') == 'output_text'
    ]
    if texts:
        print(texts[0])
except (json.JSONDecodeError, AttributeError, TypeError):
    pass
" 2>/dev/null)
    TAG_DATA=$(python3 -c "
import json, sys
raw = sys.stdin.read().strip()

if not raw:
  sys.stderr.write('[vault] tags: xAI returned empty response\n')
  print('[]')
  raise SystemExit(0)

try:
  data = json.loads(raw)
except json.JSONDecodeError:
  sys.stderr.write(f'[vault] tags: failed to parse JSON from xAI: {raw[:200]}\n')
  print('[]')
  raise SystemExit(0)

tags = data.get('tags') or data.get('Tags') or []
if isinstance(tags, str):
  tags = [tags]
clean = [str(item).strip() for item in tags if str(item).strip()]
if not clean:
  sys.stderr.write('[vault] tags: xAI returned no usable tags\n')
print(json.dumps(clean, ensure_ascii=False))
" <<< "$TAG_RAW" 2>/dev/null)
  else
    echo "[vault] xAI API key missing; session was not summarized" >&2
  fi
fi

NOTE_TAGS=$(PROJECT="$PROJECT" BRANCH="$BRANCH" TAG_DATA="$TAG_DATA" python3 -c "
import json, os, sys
tags = [os.environ['PROJECT'], os.environ['BRANCH']]
extra = json.loads(os.environ.get('TAG_DATA', '[]'))
for tag in extra:
  if tag and tag not in tags:
    tags.append(tag)
print('tags: [' + ', '.join(json.dumps(tag) for tag in tags) + ']')
")

SUMMARY_BLOCK=$(python3 -c "
import json, sys
data = json.load(sys.stdin)
lines = []

summary = (data.get('summary') or '').strip()
if summary:
  lines.extend(['## Summary', '', summary, ''])

def emit(title, key):
  items = data.get(key) or []
  if not items:
    return
  lines.extend([f'## {title}', ''])
  for item in items:
    text = str(item).strip()
    if text:
      lines.append(f'- {text}')
  lines.append('')

emit('What went well', 'wins')
emit('Corrections made', 'corrections')

print('\n'.join(lines).rstrip())
" <<< "$SUMMARY_DATA")

# ── Write vault note ────────────────────────────────────────
DIR="$PROJECTS/$PROJECT/$BRANCH"
FILE="$DIR/$(date +%Y-%m-%d-%H%M).md"
mkdir -p "$DIR"

{
  echo "---"
  echo "project: $PROJECT"
  echo "branch: $BRANCH"
  echo "date: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "$NOTE_TAGS"
  echo "---"
  echo ""
  echo "# $PROJECT — $BRANCH — $(date "+%Y-%m-%d %H:%M")"
  echo ""

  if [ -n "$SESSION_TITLE" ]; then
    echo "**Session:** $SESSION_TITLE"
    echo ""
  fi

  if [ -n "$FIRST_USER_MSG" ]; then
    echo "## Goal"
    echo ""
    echo "$FIRST_USER_MSG"
    echo ""
  fi

  if [ -n "$SUMMARY_BLOCK" ]; then
    printf '%s\n' "$SUMMARY_BLOCK"
    echo ""
  elif [ -n "$SUMMARY" ]; then
    echo "## Summary"
    echo ""
    echo "$SUMMARY"
    echo ""
  fi

  if [ -n "$MSG_COUNT" ]; then
    if [ -n "$SUMMARY" ]; then
      echo "*$MSG_COUNT messages — auto-summarized at $(date +%H:%M)*"
    else
      echo "*$MSG_COUNT messages — summary unavailable at $(date +%H:%M)*"
    fi
  fi
} > "$FILE"

echo "[vault] $FILE"
if [ -n "$SESSION_TITLE" ]; then
  echo "[vault]   $SESSION_TITLE"
fi
if [ -n "$SUMMARY" ]; then
  echo "[vault]   summarized"
fi
