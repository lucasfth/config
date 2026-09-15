---
name: retro
description: Use when Lucas says "retro" or asks to review a session — writes a Muninn session note with a summary, what went well, and corrections from the current session
---

# Retro

## Overview

Write a Muninn session note capturing what was worked on, what went well, and where Lucas had to correct the assistant.

**Core principle:** Honest and specific — corrections are the point, not an embarrassment.

**Announce at start:** "Running retro — writing today's session note to Muninn."

## The Process

### Step 1: Locate the note

```bash
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")
REMOTE=$(git remote get-url origin 2>/dev/null || echo "")
# org/repo from remote, else _local/<dirname>
```

Set `filename` to `projects/<org>/<repo>/<branch>/YYYY-MM-DD.md`.

### Step 2: Read and update the note

Call Muninn `vault_read` with `filename`. If it does not exist, start `content` with:

```markdown
---
project: <org>/<repo>
branch: <branch>
date: <ISO-8601 timestamp>
tags: [<org>/<repo>, <branch>]
---

# <org>/<repo> — <branch> — <YYYY-MM-DD>
```

Append this structured entry to `content`:

```markdown
## Summary

<3-5 concise bullets or a short paragraph: what was worked on, files or areas touched, final state>

## What went well

- <1-4 bullets: what the assistant did correctly>

## Corrections

- <1-4 bullets: mistakes, wrong assumptions, fixes, places Lucas had to correct the assistant>
```

Call Muninn `vault_write` with `{ filename, content }`. If the read or write fails, report the failure and do not claim the note was stored.

### Step 3: Report

Reply with the Muninn filename and the Corrections bullets inline, so Lucas sees them without opening the note.

## Rules

- **Be specific about the actual work** — files, decisions, outcomes. No generic filler.
- **Corrections must be real.** If Lucas corrected nothing, write `No corrections this session.` — never invent any, never pad with trivialities.
- **Same bar for wins.** Empty array if nothing worth noting, not participation trophies.
- One note per day per branch — read and append to today's Muninn note if a retro already exists.

## Common Mistakes

**Vague summary**
- **Problem:** "Worked on various improvements" → useless in 6 months.
- **Fix:** Name the files, the decision, the end state.

**Skipping corrections to look good**
- **Problem:** Note reads as self-praise; the most valuable signal is lost.
- **Fix:** Corrections are the point. List every place Lucas steered you.

**New file per retro**
- **Problem:** Fragments daily project history.
- **Fix:** Always read and append to `YYYY-MM-DD.md`.
