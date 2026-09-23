---
name: writing-muninn-notes
description: Use when Lucas asks to add, save, move, or update a non-retro note or entry in Muninn.
---

# Writing Muninn Notes

## Overview

Write vault-native notes, not loose Markdown files. The vault's current conventions determine folder, metadata, naming, and index placement.

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

Use only Muninn MCP tools. Never access the local vault filesystem.

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
