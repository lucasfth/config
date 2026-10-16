# Commands

All commands and aliases defined in this config, grouped by category.

## Rebuild & System

| Command | Does |
| --- | --- |
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
| `~/config/scripts/nix-health --check` | Validate the Nix store, profile, and login shell; see `docs/nix-recovery.md` if it fails |

Rebuild helpers are defined in the reloadable `nix/common/shell/interactive.zsh`.
Before the updated startup order is activated, run
`source ~/config/nix/common/shell/interactive.zsh` after startup; `omz reload`
alone reintroduces the old generated definitions. After activation, `omz reload`
loads the corrected helpers last. macOS uses the absolute system-profile
`darwin-rebuild` path; Linux uses `nixos-rebuild`. `nrs` activates the whole
configuration and needs explicit approval before agent use.

## Herdr navigation

| Keys | Action |
| --- | --- |
| Ctrl+B or Hyper+A, then a | Enter persistent agent-only navigation in Ghostty |
| j / k in agent mode | Immediately focus next / previous sidebar agent |
| 1–9 in agent mode | Immediately focus numbered sidebar agent |
| Enter / Esc in agent mode | Exit agent mode without submitting input to a pane |
| Hyper+A, then h/j/k/l | Navigate split panes, unchanged |
| Hyper+A, then 1–9 outside agent mode | Select a tab, unchanged |
| Ctrl+B, then g | Open the separate Go To picker |
| Ctrl+B, then Option+8 on Danish layout | Enter COPY mode (`[`); h/j/k/l moves, v selects, y copies |

Hyper+A is Cmd+Option+Ctrl+Shift+A in Ghostty. Persistent agent mode uses
Ghostty 1.3+ key tables and Herdr's native agent actions, not its Go To picker.
Deploy and reload both configurations together; see [deployment details](configs/herdr/README.md).

On macOS, `herdr` selects `~/.local/libexec/herdr-patched` through the reloadable
shell alias. Run `omz reload` before using it from an existing shell. Detach the
current client first; reattaching preserves server sessions. `command herdr`
bypasses the alias and launches Homebrew's stock client.
The installed patched client and local server are currently 0.9.5. After a client
binary upgrade, detach and run `herdr` again; config reload cannot replace a
running client. Direct self-update can discard the local sidebar patch.

`bash ~/config/scripts/build-herdr-client.sh` tests/builds the pinned client from
repo sources; add `--install` to atomically replace the viewing executable only.
It does not update the running server. `scripts/setup-herdr-remote.sh` copies and
links the host-summary plugin on a remote checkout without restarting sessions.

## Muninn

| Command | Does |
|---------|------|
| `muninn-refresh` | Quit Obsidian first; fast-forward the encrypted backup and safely verify/decrypt the newest published snapshot, preserving settings, local edits, and a rollback copy. Never opens Obsidian or uploads notes. |
| `python3 ~/config/scripts/muninn-refresh.py` | Same refresh command before the next `nrs` installs the managed entry point. |

## Fafnir

| Command | Does |
| --- | --- |
| `fafnir` | Open the interactive repository-secrets menu |
| `fafnir help` | Show explicit encryption, restoration, trust and key-management commands |
| `fafnir version` | Show the installed CLI version |

Home Manager declares `~/.local/bin/fafnir` from the pinned native Nix build;
the shell already includes that directory on PATH. No alias, automatic identity
creation or implicit `.env` encryption is configured. See [installation ownership](README.md#fafnir-repository-secrets).


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
generated shell startup hook after activation. Run `omz reload` after edits to
this linked customization; it does not regenerate `.zshrc` or update shell init
paths. The layout migration requires the next approved system/Home Manager
activation to refresh those generated paths.

Type a filename as the command to use its default viewer or editor:

| Suffixes | Opens with |
|----------|------------|
| `.vue`, `.ts`, `.tsx`, `.js`, `.jsx`, `.nix`, `.json`, `.py`, `.sh`, `.zsh`, `.go`, `.rs` | VS Code (`code`) |
| `.yaml`, `.yml`, `.toml` | Vim (`vim`) |
| `.md`, `.txt`, `.log` | `bat` |
| `.pub` | Copy file contents to the clipboard (`pbcopy`) |

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
| `lg` | Open LazyGit with `~/config/configs/lazygit/config.yml` explicitly |
| `gup` | `git pull --rebase` |

`lg` is defined in the live-linked `nix/common/shell/interactive.zsh`; use `omz reload` after edits once the corrected generated shell has been activated. See [LazyGit configuration and activation](configs/README.md#lazygit) for the one-time rebuild and verification limits.

## SSH

| Command | Target |
|---------|--------|
| `vps1` | Ecoray VPS1 |
| `vps2` | Ecoray VPS2 |
| `mimer` | Ecoray mimer (Ubuntu) |
| `freyr` | Ecoray freyr (NixOS GPU server) |
| `mini` / `minid` | Ecoray Mac Mini (d = dev branch) |
| `neo` | Neo (formerly post-sales) |
| `ecoray3d` | Ecoray 3D server (root) |
| `sep` | Ecoray Pi |
| `plato` | Plato |
| `ssh-termux` | Android (Termux) |
| `ssh-windows` | Windows machine |
| `sigyn` | Sigyn iPad shell over Tailscale |
| `sigyn-screen` | Wake and unlock passcode-free Sigyn, then open macOS Screen Sharing through a loopback-only SSH tunnel; the VNC password is remembered in Keychain |

Host resolution (user, IP, port) is handled by `~/.ssh/config`, generated from `nix_secrets`.

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
