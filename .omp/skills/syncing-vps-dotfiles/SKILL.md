---
name: syncing-vps-dotfiles
description: Use when the user asks to update, sync, or push their VPS bashrc/vimrc gists, or mentions keeping VPS dotfiles in sync with the Nix config
---

# Syncing VPS Dotfiles

## Overview

Canonical config lives in this Nix repo (`~/config`). Three portable gists are derived from it for Linux VPS / remote machine use. When the Nix config changes, the gists may need updating.

## Gist → Source Mapping

| Gist | ID | Canonical Source |
|------|----|------------------|
| `.vimrc` | `881ef84c819f25f5b25ea307df0e0970` | `nix/common/vim.nix` `extraConfig` block |
| `.bashrc` | `3c0bbabf75b2d17ffd616aae58bd67f7` | `nix/common/shell/aliases.nix`, `nix/common/git.nix` |
| `.zshrc` | `0dbc9436cd5aebf64bb57d69145d2cf7` | `nix/common/shell/aliases.nix`, `nix/common/git.nix` |

## Workflow

1. **Read the canonical source** — `nix/common/vim.nix` for vimrc, `nix/common/shell/aliases.nix` + `nix/common/git.nix` for bashrc/zshrc
2. **Read the current gist** — fetch via `read` with the raw URL
3. **Derive the portable version** — strip Nix wrappers, translate zsh→bash for bashrc, skip macOS-specific items
4. **Update the gist** — use `gh gist edit` with the new content

## Vimrc Translation

The `extraConfig` string in `vim.nix` is already raw vimscript. Extract everything between the opening `''` and closing `''` (the `extraConfig` block content), keeping the header comment block from the gist.

The gist header (`# Portable vimrc — Catppuccin Mocha themed` through install instructions) should be preserved unless outdated. The `call plug#begin()` / `call plug#end()` wrapper wraps the plugin list; the Nix `plugins` list maps to `Plug` lines inside that block.

## Bashrc Translation

The Nix config is **zsh**. The bashrc gist is **bash 3.2+**. Filter aggressively:

### Always port (shell-agnostic)
- Git aliases from `aliases.nix` (`gup`, etc.) — ensure they exist in the gist's alias section
- General aliases from the gist's existing list (don't drop what's already there unless Nix removed it)
- New git aliases found in `aliases.nix` that aren't in the gist yet

### Never port (macOS/zsh/secret-dependent)
- SSH aliases (`ssh-termux`, `ecoray-*`) — depend on `nix_secrets` env vars
- `heic2tiff` — macOS-only (`sips`)
- `omp` wrapper — macOS-only
- `yt-dlp` / `repolicense` — local binaries
- `direnv`, `zoxide`, `fzf` init — zsh-specific
- `alias-tips` — zsh-specific
- Mole completions — zsh-specific + tool-specific
- `TIMEFMT` — zsh-specific
- `MULTICA_*` — work-specific
- `nrs`, `nix-search`, `nix-which`, `nix-update`, `nix-rollback` — NixOS/darwin-specific
- PATH exports — macOS-specific paths

### Judgment calls
- Git `delta` pager: gist already omits it (delta unlikely on VPS). Keep omitted.
- `lg` (lazygit): already in gist with fallback. Keep.

## Zshrc Translation

The zshrc gist is **zsh** (same as the Nix config), so translation is direct — no shell dialect conversion needed. Unlike the bashrc gist, the zshrc gist keeps the prompt, history, and completion sections hand-maintained (they use zsh-native `precmd`, `setopt`, `zstyle` rather than the Nix-managed starship/oh-my-zsh stack).

### Always port (shell-agnostic)
- Git aliases from `aliases.nix` (`gup`, `gst`, `gco`, etc.) — ensure they exist in the gist's alias section
- General aliases from the gist's existing list (don't drop what's already there unless Nix removed it)
- New git aliases found in `aliases.nix` that aren't in the gist yet

### Never port (macOS/secret-dependent)
- SSH aliases (`ssh-termux`, `ecoray-*`) — depend on `nix_secrets` env vars
- `heic2tiff` — macOS-only (`sips`)
- `omp` wrapper — macOS-only
- `yt-dlp` / `repolicense` — local binaries
- `nrs`, `nix-search`, `nix-which`, `nix-update`, `nix-rollback` — NixOS/darwin-specific
- PATH exports — macOS-specific paths
- Mole completions — tool-specific
- `TIMEFMT` — too niche for portable use
- `MULTICA_*` — work-specific

### Hand-maintained (do NOT sync from Nix)
- **Prompt** (`precmd`, `__git_ps1`): hand-rolled Catppuccin Mocha PS1 using zsh-native `%F{#rrggbb}` sequences. The Nix config uses starship; the gist intentionally avoids external deps.
- **History** (`setopt HIST_*`, `HISTSIZE`, `SAVEHIST`): zsh-native equivalents of the Nix-managed settings.
- **Completion** (`compinit`, `zstyle`): zsh-native, replaces oh-my-zsh's plugin system.
- **Niceties** (`setopt AUTO_CD`, `CORRECT`, `EXTENDED_GLOB`): zsh-native, no Nix equivalent.
- **Editor detection**: already in gist, no Nix equivalent.
- **Color vars** (`c_text`, `c_green`, etc.): used by the hand-rolled prompt; keep in sync with the bashrc gist's Catppuccin palette.

## Updating a Gist

```bash
gh gist edit <GIST_ID> - <<'EOF'
<full new content>
EOF
```

Or write to a temp file first, then:
```bash
gh gist edit <GIST_ID> /tmp/gist-content
```

The `gh gist edit` command opens `$EDITOR` by default — always pipe or pass a file to avoid interactive editor.

## After Updating

Confirm the raw URL renders correctly:
```bash
curl -sL https://gist.githubusercontent.com/lucasfth/<GIST_ID>/raw/ | head -5
```
