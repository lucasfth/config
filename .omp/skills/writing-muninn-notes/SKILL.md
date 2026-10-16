---
name: writing-muninn-notes
description: Use when Lucas asks to add, save, move, or update a non-retro note or entry in Muninn.
---

# Writing Muninn Notes

## Overview

Write vault-native notes, not loose Markdown files. The vault's current conventions determine folder, metadata, naming, and index placement.

**Canonical rulebook:** `tech/vault-note-writing-rules.md` in Muninn. Read it through `vault_read` before writing if you have not already read it this session. It is authoritative for tags, titles, filenames, and the `Related:` line; this skill is authoritative for folder choice, `_INDEX.md`, and verification. Where they overlap, the rulebook wins.

Muninn is the primary operational knowledge source for both Huginn and Loki. NEVER write incident notes, recovery history, runbooks, or duplicated vault information to Loki's `~/.hermes/README.md`. Use the canonical Muninn note and index instead; a local README is not a documentation fallback. If misplaced sections were added there, verify their content is preserved in Muninn, then remove only those additions and retain the original README.

**Completion invariant:** A new canonical note is incomplete until `_INDEX.md` links it. A successful result MUST set `updatesIndex = true`; existing links are verified rather than duplicated.

## Required Workflow

1. Read `references/vault-structure.md` through Muninn `vault_read`.
2. Read `_INDEX.md` and one representative note from the target folder.
3. Choose the semantic folder before choosing the filename. Root is not a default destination.
4. Search for an existing note on the topic; update it instead of creating a duplicate when appropriate.
5. Write YAML frontmatter matching the representative note, always including `title`, `type`, `tags`, `status`, and `updated: YYYY-MM-DD`. Folder conventions may add fields, not omit these required fields:

```yaml
---
title: Descriptive Title
type: reference
created: YYYY-MM-DD
tags: [specific-tag, reused-tag]
status: active
updated: YYYY-MM-DD
---
```

6. Tags: 2 to 5, lowercase, kebab-case, unquoted, singular. Reuse tags already in the vault and include at least one specific tag. Never use a broad tag (`postmortem`, `hermes`, `klaus`, `mimer`, `ecoray`, `food`) as the only tag: dreaming ignores tags used on more than 15 notes.
7. Put key facts at the top: deadlines, status, amounts, owners in frontmatter or the first paragraph.
8. Link in the body with `[[note-name]]` where notes relate. Never edit the `Related:` line; dreaming owns it and may rewrite it.
   Never write to `personal-notes/` unless Lucas explicitly asks; this applies to MCP writes as well as fallback edits.
9. End every Markdown file with exactly one newline.
10. For every new canonical note, call `vault_write` for `_INDEX.md` and add its link in the folder section, preserving the index format and final newline. No exception and no conditional wording.
11. Read back the note and index. Verify path, frontmatter, index link, and `content.endsWith("\n")` before reporting success.

## Access Path

**Primary:** Muninn MCP tools (`vault_read`, `vault_write`, `vault_list`, `vault_search`, `vault_delete`).

**Fallback:** When Muninn is down or unreachable, restored notes are available at `~/muninn-readable` (a symlink into a case-sensitive APFS image). `~/muninn` points to the encrypted `lucasfth/muninn` backup checkout and is not readable notes. The restored copy is a snapshot, not an automatically synchronized vault. Lucas will state explicitly when the fallback is in effect. In fallback mode:

- Use the built-in `read`, `write`, `edit`, `glob`, and `grep` tools instead of the MCP tools.
- Map each MCP operation to its filesystem equivalent: `vault_read` → `read`, `vault_write` → `write`/`edit`, `vault_list` → `glob`, `vault_search` → `grep`, `vault_delete` → `rm`.
- Every other rule in this skill still applies unchanged: folder choice, frontmatter, `_INDEX.md` update, single trailing newline, and read-back verification.
- Do not modify `personal-notes/` (read-only, linking only).
- The readable copy is not a Git checkout. Local edits do not update Muninn MCP or the encrypted backup; preserve them and reconcile explicitly when Muninn is available. Never run Git commits or pushes from the readable snapshot.
- Before use, verify `~/muninn-readable/tech/030-Coding-Style.md` is readable. If the APFS image is unmounted, mount it with `hdiutil attach ~/.local/share/muninn/readable.sparsebundle -mountpoint ~/.local/share/muninn-volume -nobrowse`; do not create a new vault at the dangling symlink.
- For restore/edit/publication details, read the canonical `tech/Muninn-Encrypted-Backups.md` through MCP, or from the readable snapshot during fallback. Restore only to a new directory under the mounted case-sensitive volume, never directly under `~` or onto the existing readable vault.
- Never request passphrases in chat or put them in commands/config. Lucas enters them in Salt's interactive prompt in his own terminal; use the saved Keychain key when available. Never bypass signature checks.
- Pulling the encrypted checkout does not refresh plaintext. Do not seal a stale or partial snapshot, run `salt prune`, force-push, or publish independent Mac changes without reconciling Loki's live vault and coordinating its backup writer.

Never use the filesystem path while Muninn is reachable. Never use Muninn MCP tools while the fallback is declared in effect.

If MCP returns a truncated response, read its complete artifact before parsing or updating. Never overwrite a note/index from an elided preview. Read back the full saved content and verify the canonical link and exactly one terminal newline.

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
| Frontmatter | Matches target-folder convention; includes `status` and `updated` |
| Tags | 2 to 5, lowercase, kebab-case, unquoted, singular, reused |
| Filename | Stable descriptive or numbered stem per convention |
| Key facts | Deadlines, status, amounts, owners at the top |
| Related | Never edited by hand |
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
- Quoting tags, using plural tags, or inventing a tag that already exists in another form.
- Using only broad tags, which dreaming ignores.
- Editing the `Related:` line by hand.
- Writing to `personal-notes/` without Lucas asking.

## Red Flags

- “Update the index only if conventions require it.”
- “No other files need changes” after creating a canonical note.
- Reporting success without a frontmatter, index, and final-newline readback.
- “I added the tags I thought were relevant” without checking the vault for existing tags.
- “I tidied up the Related: line.”

Any red flag means the Muninn write is incomplete.
