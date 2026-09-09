---
name: retro
description: Use when Lucas says "retro" or asks to review a session — writes a vault note with a summary, what went well, and corrections from the current session
---

# Retro

## Overview

Write a session note to the vault capturing what was worked on, what went well, and where Lucas had to correct the assistant.

**Core principle:** Honest and specific — corrections are the point, not an embarrassment.

**Announce at start:** "Running retro — writing today's session note to the vault."

## The Process

### Step 1: Locate the note

```bash
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")
REMOTE=$(git remote get-url origin 2>/dev/null || echo "")
# org/repo from remote, else _local/<dirname>
```

Directory: `~/vault/projects/<org>/<repo>/<branch>/`
File: `YYYY-MM-DD.md` (today; a stub with frontmatter may already exist from session start).

### Step 2: Write the note

Append (or write, if the file is just a stub header):

```markdown
## Summary

<3-5 concise bullets or a short paragraph: what was worked on, files or areas touched, final state>

## What went well

- <1-4 bullets: what the assistant did correctly>

## Corrections

- <1-4 bullets: mistakes, wrong assumptions, fixes, places Lucas had to correct the assistant>
```

### Step 3: Report

Reply with the file path and the Corrections bullets inline, so Lucas sees them without opening the file.

## Rules

- **Be specific about the actual work** — files, decisions, outcomes. No generic filler.
- **Corrections must be real.** If Lucas corrected nothing, write `No corrections this session.` — never invent any, never pad with trivialities.
- **Same bar for wins.** Empty array if nothing worth noting, not participation trophies.
- One note per day per branch — append to today's file if a retro already exists.

## Common Mistakes

**Vague summary**
- **Problem:** "Worked on various improvements" → useless in 6 months.
- **Fix:** Name the files, the decision, the end state.

**Skipping corrections to look good**
- **Problem:** Note reads as self-praise; the most valuable signal is lost.
- **Fix:** Corrections are the point of the retro. List every place Lucas steered you.

**New file per retro**
- **Problem:** Fragments the daily log the vault hook builds.
- **Fix:** Always append to `YYYY-MM-DD.md`.
