# Commands

All commands and aliases defined in this config, grouped by category.

## Rebuild & System

| `nrs` | Rebuild system, check for DisplayLink Manager updates, and reload shell |
| `nix-clean` | Garbage collect old generations (user + system) |
| `nix-update` | Update flake.lock + rebuild + reload |
| `nix-rollback` | List generations, show rollback command |
| `nix-diff <N>` | Show package changes between current and generation N |
| `nix-search <pkg>` | Search nixpkgs |
| `nix-which <cmd>` | Show path + Nix/Brew source |
| `config-add <name>` | Auto-detect and add package (nixpkgs → brew formula → cask) |
| `config-add --cat <cat> <name>` | Add nix package to specific category |
| `config-add --alias <name>=<value>` | Add shell alias |
| `config-add --mas <Name> <ID>` | Add Mac App Store app |
| `, <pkg>` | Run any nixpkgs binary on-demand (comma) — also auto-suggests after unknown commands |
| `~/config/scripts/nix-health --check` | Validate the Nix store, profile, and login shell; see `docs/nix-recovery.md` if it fails |
## Navigation

| Command | Does |
|---------|------|
| `z <dirname>` | Jump to frecent directory (zoxide) |
| `zi` | Interactive picker (fzf-powered) |
| `fd <pattern>` | Find files/dirs (replaces find) |
| `~config`, `~code`, `~downloads` | Named paths usable with any command, e.g. `ls ~config` |

## Shell Keyboard Shortcuts

These bindings apply to the default Emacs keymap. `Ctrl+X Ctrl+E` means press
the two chords in sequence, not simultaneously.
For `Ctrl+X c`, release Ctrl after pressing X, then press lowercase `c`.

| Keys | Does |
|------|------|
| `Tab` | Complete with a searchable fzf menu; `cd` and `z` show directory previews. A shared prefix can expand on the first Tab; press Tab again for the picker |
| `Ctrl+R` | Search command history with fzf |
| `Ctrl+P` / `Ctrl+N` | Previous/next history command matching the prefix before the cursor |
| `Ctrl+F` / Right arrow | Move forward; accept an autosuggestion at the end of the line |
| `Ctrl+A` / `Ctrl+E` | Beginning/end of the command line |
| `Ctrl+W` | Delete the preceding word |
| `Ctrl+_` | Undo a command-line edit, including an accidental deletion |
| `Ctrl+X c` / `Ctrl+X Ctrl+E` | Edit the current command in Vim; `:wq` returns the edited text to the command line without executing it |
| `Space` | Expand history references such as `!!` (previous command) and `!$` (last argument) so you can inspect them before executing |
| `Ctrl+X Ctrl+Y` | Copy the current command buffer to the macOS clipboard without executing |
| `Ctrl+L` | Clear the visible screen while keeping the current command buffer |
| `Ctrl+X Ctrl+L` | Clear the screen and scrollback, including the current tmux pane's history, while keeping the command buffer; does not delete shell command history |
| `Ctrl+X g c` | Insert `git commit -m ""` with the cursor between the quotes; does not run Git |

`magic-space`, undo and the editor widget were already available through
Oh My Zsh. The tracked config selects Vim explicitly for the command editor,
independent of `$EDITOR` and `$VISUAL`. `Ctrl+X c` now opens the editor instead
of invoking spelling correction. Bindings and suffix handlers live in
`nix/common/shell/interactive.zsh`, linked as `~/.zshrc_local` and loaded by the
existing shell startup hook. Run `omz reload` after edits; no system rebuild is
needed for this file.

### Open Files by Suffix

Type a filename as the command to use its default viewer or editor:

| Suffixes | Opens with |
|----------|------------|
| `.vue`, `.ts`, `.tsx`, `.js`, `.jsx`, `.nix`, `.json`, `.py`, `.sh`, `.zsh`, `.go`, `.rs` | VS Code (`code`) |
| `.yaml`, `.yml`, `.toml` | Vim (`vim`) |
| `.md`, `.txt`, `.log` | `bat` |

Examples: `README.md`, `flake.nix`, `report\ draft.md`.
Fully quoting the command name suppresses alias expansion; use
`bat "report draft.md"` for quoted paths. An explicit command always wins:
`wc -l README.md` still runs `wc`.

Suffix handlers use explicit commands, independent of `$EDITOR` and `$VISUAL`.
Run `omz reload` to pick up changes to these handlers.
Opening a script by suffix edits it; it does not execute it.

### Batch Rename with `zmv`

```zsh
zmv -n '(*).log' '$1.txt'  # Preview; makes no changes
zmv -i '(*).log' '$1.txt'  # Rename, confirming each move
```

Keep the patterns quoted. Review the dry run before removing `-n`.

### History and Project Environments

History is shared across shells and deduplicated. Start a command with a space
to exclude it from saved history; this is not a substitute for keeping secrets
out of command arguments and logs. `Ctrl+R` searches history; `Ctrl+P/N` searches
by the current prefix.

Project environments remain managed by direnv. Review a project's `.envrc`
before `direnv allow`; permission is never granted automatically by this config.

## Git

| Command | Does |
|---------|------|
| `lg` | Open lazygit |
| `gup` | `git pull --rebase` |

## SSH

| Command | Target |
|---------|--------|
| `se1` / `se1lv` | Ecoray VPS1 (lv = Louise workspace) |
| `se2` | Ecoray VPS2 |
| `se3` | Ecoray VPS3 |
| `mimer` | Ecoray mimer (Ubuntu) |
| `freyr` | Ecoray freyr (NixOS GPU server) |
| `sem` / `semd` | Ecoray Mac Mini (d = dev branch) |
| `sep` | Ecoray Pi |
| `plato` | Plato |
| `post-sales` | Post-sales SSH shell; portable Catppuccin Zsh prompt, Git aliases, history, and completion |
| `ssh-termux` | Android (Termux) |
| `ssh-windows` | Windows machine |
| `sigyn` | Sigyn iPad shell over Tailscale |
| `sigyn-screen` | Wake and unlock passcode-free Sigyn, then open macOS Screen Sharing through a loopback-only SSH tunnel; the VNC password is remembered in Keychain |

Host resolution (user, IP, port) is handled by `~/.ssh/config`, generated from `nix_secrets`.

The shared SSH-safe Starship prompt includes the remote hostname on the left,
so it remains visible in narrow terminals. It uses the machine's hostname,
not the SSH alias, and does not show it for local sessions.

The post-sales Mac uses the portable Zsh setup without Nix or Homebrew. Its
installed prompt shows the readable `post-sales` label on the right during SSH
sessions, with the directory and Git status on the left and no trailing `%`.
Git requires Apple's Command Line Tools (`xcode-select --install` on that Mac);
they were absent when the shell was configured.

## Tools

| Command | Does |
|---------|------|
| `bat <file>` | cat with syntax highlighting |
| `jq '.' file.json` | JSON processor |
| `delta` | Git pager (auto-wired) |
| `rg <pattern>` | ripgrep — fast grep |
| `direnv` | Per-project env auto-loading |
| `omp` | OMP agent (auto-saves session to vault) |
| `heic2tiff <file...>` | Batch HEIC → TIFF conversion |
| `, <cmd>` | Run any nixpkgs binary on-demand (auto-suggests after unknown commands) |

## Raycast Shell Discovery

| Raycast command | Does |
|-----------------|------|
| **Daily Shell Tip** | Open today's tip in a visible card; copy its example, mark it learned, or request another tip |
| **Shell Tip Menu Bar** | Activate the compact `Zsh` menu-bar widget; refreshes hourly and when opened |
| **Shell Cheat Sheet** | Search commands and keyboard shortcuts, filter by category, read explanations and track learned tips |
| **Ask Shell Discovery** | Ask Raycast AI about the configured cheat sheet; also available by selecting Shell Discovery after typing `@` in AI Chat |

Examples are copied, never executed. Tips prioritize unseen commands, then
the least-used commands in recent local history. The card and cheat sheet refresh
every 30 seconds while open. Learned status and daily selection persist locally.

Counts are matching history entries, not lifetime executions: deduplicated
history can undercount repeated use. Key-binding use is unknown until you mark
it learned. Raw history is never displayed, persisted by the extension, or sent
to a service.

AI search returns tip descriptions, examples, shortcuts and cautions from the
same catalogue. It does not access history or usage counts, and never executes
commands. Example: "How do I clear the screen without losing my command?"

See [installation and preferences](README.md#shell-discovery-extension).

## Local (not Nix-managed)

| Command | Source |
|---------|--------|
| `yt-dlp` | `~/Desktop/code/yt-dlp/yt-dlp` (manual clone) |
| `repolicense` | `~/Desktop/code/repolicense-cli/` (git submodule) |

## Quick Experiments

```bash
# Add alias without rebuild:
echo 'alias foo="bar"' >> ~/.zshrc_local
exec zsh
```
