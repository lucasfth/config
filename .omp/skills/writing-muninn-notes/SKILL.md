---
name: writing-muninn-notes
description: Use when Lucas asks to add, save, move, or update a non-retro note or entry in Muninn.
---

# Writing Muninn Notes

## Overview

Write vault-native notes, not loose Markdown files. The vault's current conventions determine folder, metadata, naming, and index placement.

Muninn is the primary operational knowledge source for both Huginn and Loki. NEVER write incident notes, recovery history, runbooks, or duplicated vault information to Loki's `~/.hermes/README.md`. Use the canonical Muninn note and index instead; a local README is not a documentation fallback. If misplaced sections were added there, verify their content is preserved in Muninn, then remove only those additions and retain the original README.

**Completion invariant:** A new canonical note is incomplete until `_INDEX.md` links it. A successful result MUST set `updatesIndex = true`; existing links are verified rather than duplicated.

## Required Workflow

1. Read `references/vault-structure.md` through Muninn `vault_read`.
2. Read `_INDEX.md` and one representative note from the target folder.
3. Choose the semantic folder before choosing the filename. Root is not a default destination.
4. Search for an existing note on the topic; update it instead of creating a duplicate when appropriate.
5. Write YAML frontmatter matching the representative note. Unless the folder specifies otherwise, include:

```yaml
---
title: Descriptive Title
type: reference
created: YYYY-MM-DD
tags:
  - relevant-tag
---
```

6. End every Markdown file with exactly one newline.
7. For every new canonical note, call `vault_write` for `_INDEX.md` and add its link in the folder section, preserving the index format and final newline. No exception and no conditional wording.
8. Read back the note and index. Verify path, frontmatter, index link, and `content.endsWith("\n")` before reporting success.

## Access Path

**Primary:** Muninn MCP tools (`vault_read`, `vault_write`, `vault_list`, `vault_search`, `vault_delete`).

**Fallback:** When Muninn is down or unreachable, the same vault is available on the local filesystem at `~/vault` (a symlink to the git-backed vault). Lucas will state explicitly when the fallback is in effect. In fallback mode:

- Use the built-in `read`, `write`, `edit`, `glob`, and `grep` tools instead of the MCP tools.
- Map each MCP operation to its filesystem equivalent: `vault_read` → `read`, `vault_write` → `write`/`edit`, `vault_list` → `glob`, `vault_search` → `grep`, `vault_delete` → `rm`.
- Every other rule in this skill still applies unchanged: folder choice, frontmatter, `_INDEX.md` update, single trailing newline, and read-back verification.
- Do not modify `personal-notes/` (read-only, linking only).
- The vault is git-backed; the 02:00 cron pushes. Commit manually only if Lucas asks.

Never use the filesystem path while Muninn is reachable. Never use Muninn MCP tools while the fallback is declared in effect.

Never describe the index update as optional. If the canonical link already exists, verify it instead of adding a duplicate.

Plans and reports MUST use the unconditional action “Update `_INDEX.md` with the canonical link.” Never qualify it with “if required,” “if applicable,” or similar wording.

## Moving a Misplaced Note

To relocate a note:

1. Write the complete canonical note at the correct path.
2. Update `_INDEX.md` to link only the canonical path.
3. Delete the misplaced note with `vault_delete`; never leave a redirect unless Lucas explicitly requests one.
4. Verify `vault_list` no longer returns the old path and `vault_read` still returns the canonical note.

## Quick Reference

| Check | Requirement |
|---|---|
| Folder | Derived from `references/vault-structure.md` |
| Frontmatter | Matches target-folder convention |
| Filename | Stable descriptive or numbered stem per convention |
| Index | Canonical note added to the correct section |
| EOF | Exactly one newline |
| Verification | Read back note and index |

## Common Mistakes

- Writing a topical note at vault root because no folder was supplied.
- Omitting frontmatter because the user asked only for an “entry.”
- Forgetting `_INDEX.md` after creating a note.
- Trusting the write response without reading content back.
- Leaving no final newline.
- Treating a non-retro note as a session retro.

## Red Flags

- “Update the index only if conventions require it.”
- “No other files need changes” after creating a canonical note.
- Reporting success without a frontmatter, index, and final-newline readback.

Any red flag means the Muninn write is incomplete.
