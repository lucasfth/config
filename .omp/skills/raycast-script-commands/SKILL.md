---
name: raycast-script-commands
description: Use when creating, debugging, or deploying Raycast Script Commands, especially in Raycast v2 — covers directory placement, sandbox limitations, omp integration patterns, and quoting workarounds
---

# Raycast Script Commands

## Directory Placement

Script Commands live in `~/.local/share/raycast-scripts/` — NOT under `~/Desktop/` (macOS sandboxing blocks Raycast from scanning Desktop directories).

In Raycast v2, configure the directory at: **Settings → Extensions → Script Commands → Add Script Directory → `~/.local/share/raycast-scripts`**.

Symlink from the Nix config repo via `dotfiles.nix`:
```nix
".local/share/raycast-scripts/script-name.sh".source = "${flakeDir.outPath}/raycast/scripts/script-name.sh";
```

The repo's `raycast/scripts/` directory is the canonical source. Scripts are symlinked into `~/.local/share/raycast-scripts/` on `nrs`.

## Raycast v2 Sandbox Limitations

Raycast v2 sandboxes child processes more strictly than v1. Key limitation:

- **`bun:sqlite` is blocked** — any process using `bun:sqlite` (including `omp`) gets `SQLITE_AUTH` (errno 23) even for in-memory databases. This applies to both TypeScript extensions AND Script Commands.
- Script Commands have more freedom than extensions, but still can't use SQLite.

**Consequence:** `omp` cannot run in-process in Raycast v2. It MUST be launched in a terminal (Ghostty).

## Huginn/omp Integration Pattern

Use `mode: silent` + `open -na Ghostty` to launch omp in a terminal:

```bash
#!/bin/bash
# @raycast.mode silent
# @raycast.argument1 { "type": "text", "placeholder": "...", "optional": false }

TMPFILE=$(mktemp /tmp/huginn-prompt.XXXXXX)
printf '%s' "$1" > "$TMPFILE"
open -na Ghostty --args -e /Users/lucasfreytorreshanson/.local/bin/huginn-runner "$TMPFILE"
```

The **temp file pattern** avoids quoting hell with `open --args`. The wrapper (`~/.local/bin/huginn-runner`) reads the prompt from the temp file, `cd ~/config`, and runs `omp "$prompt"` interactively.

Do NOT use `omp -p` (print mode) — it exits immediately, causing Ghostty to close.

Do NOT try to set `--title` on Ghostty from the `open` command — quoting breaks across `open --args`. If a window title is needed for AeroSpace matching, use ANSI escape `echo -ne '\033]0;Title\007'` inside the wrapper script (though omp's TUI may override it).

## Script Command Metadata

```bash
#!/bin/bash
# @raycast.schemaVersion 1
# @raycast.title Command Name
# @raycast.mode silent|fullOutput|compact|inline
# @raycast.argument1 { "type": "text", "placeholder": "...", "optional": false }
# @raycast.icon 🤖
# @raycast.packageName Category
# @raycast.description What it does
```

After creating/editing, run **"Reload Script Directories"** in Raycast to pick up changes.
