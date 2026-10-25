<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://cdn.jsdelivr.net/gh/lucasfth/brand@v1/dist/mark/hbit-mark-warm-on-dark.svg" />
    <img src="https://cdn.jsdelivr.net/gh/lucasfth/brand@v1/dist/mark/hbit-mark-warm-on-light.svg" alt="hbit" width="56" />
  </picture>
</p>

<h1 align="center">Config</h1>

<p align="center">
  Declarative macOS and Linux configuration, powered by Nix.
</p>

<p align="center">
  <a href="https://nixos.org/"><img alt="Nix" src="https://img.shields.io/badge/Nix-5277C3?logo=nixos&logoColor=white" /></a>
  <a href="https://github.com/nix-community/home-manager"><img alt="Home Manager" src="https://img.shields.io/badge/Home_Manager-5277C3?logo=nixos&logoColor=white" /></a>
  <img alt="macOS configuration" src="https://img.shields.io/badge/macOS-313244?logo=apple&logoColor=white" />
  <img alt="Linux configuration" src="https://img.shields.io/badge/Linux-313244?logo=linux&logoColor=white" />
  <a href="https://catppuccin.com/"><img alt="Catppuccin" src="https://img.shields.io/badge/Catppuccin-cba6f7?logoColor=1e1e2e" /></a>
  <a href="LICENSE"><img alt="MIT License" src="https://img.shields.io/badge/License-MIT-a6e3a1?labelColor=313244" /></a>
</p>

<p align="center">
  <a href="#overview">Overview</a> ·
  <a href="#where-everything-lives">Structure</a> ·
  <a href="#new-machine-setup">Setup</a> ·
  <a href="COMMANDS.md">Commands</a> ·
  <a href="#documentation">Documentation</a>
</p>

## Overview

Personal configuration for macOS and Linux: packages, shell, application settings,
window management, and local tooling. Nix and Home Manager own deployment;
application sources live in `configs/<app>/`.

- **System:** host-specific Nix configuration, macOS defaults, and Homebrew packages.
- **Shell:** Zsh, Starship, tmux, fuzzy completion, and shared remote-shell helpers.
- **Applications:** grouped settings, Catppuccin themes, and Raycast integrations.

This is a personal setup, not a generic installer. Review host identity, secrets,
and activation steps before applying it to another machine.

## Documentation

| Guide | Contents |
| --- | --- |
| [Application configs](configs/README.md) | Sources, installed destinations, and reload behavior |
| [Nix modules](nix/README.md) | Host configuration, packages, and deployment ownership |
| [Resolve Studio and plugins](configs/davinci-resolve/README.md) | Local Studio installer pin, signed Gyroflow OFX installation and CK2 feasibility |
| [Raycast](raycast/README.md) | AI provider template, Script Commands, extension, and exports |
| [Scripts](scripts/README.md) | Maintenance and configuration helpers |
| [Freyr browser skill](.omp/skills/using-freyr-browser/SKILL.md) | Required browser workflow using Freyr's signed-in Chromium |
| [Native Pi profile](configs/pi/README.md) | `pi` launcher, UI, local JS/TS source outlines, `/cache-report`, updates, verification and OMP parity gaps |
| [Shared skills](configs/pi/README.md#shared-skills-volundr) | Pinned Volundr submodule, Pi selection rules and explicit cross-machine updates |
| [Nightly shared-skill delivery](configs/volundr/README.md) | Controller delivery, Loki's published-pin sync, guarded dreaming, verification and rollback |
| [Sales document and Klaus tools](configs/workspace-read/README.md) | Scoped Drive/report reads, asynchronous Klaus tasks, tests and rollback |
| [Sales voice transcription](configs/sales-audio/README.md) | Shared private transcription route, limits, qualification and rollback |
| [Tests](tests/README.md) | Focused checks and their prerequisites |
| [Command reference](COMMANDS.md) | Shell commands, key bindings, and shortcuts |
| [Nix recovery](docs/nix-recovery.md) | Recovery after a macOS update removes Nix |
| [Gimle setup](docs/gimle-setup.md) | Headless Mac mini profile, bootstrap prerequisites and unattended-recovery gates |

## Commands

Common maintenance commands are below. See [COMMANDS.md](COMMANDS.md) for the
full command and keyboard reference. System activation requires explicit approval.

```bash
nrs                     # rebuild + check DisplayLink updates + reload shell
                        # other windows: omz reload
nix-search <name>       # find a package in nixpkgs
nix-which <tool>        # check which version (shows Nix vs Brew)
nix-update              # update flake.lock + rebuild + reload
nix-rollback            # list generations, show rollback command

# NOT managed by nrs/nix-update:
omp update              # update omp (bun global package, not in nixpkgs)
```
The rebuild helpers live in `nix/common/shell/interactive.zsh`. On macOS they use
`/nix/var/nix/profiles/system/sw/bin/darwin-rebuild` directly, so a missing PATH
entry cannot select the NixOS command. Until the new startup order is activated,
`omz reload` still lets old generated definitions overwrite these helpers.
Load the fix **after startup** in each existing terminal instead:

```zsh
source ~/config/nix/common/shell/interactive.zsh
```

After the next approved rebuild, normal startup and `omz reload` load the helpers
last. Sourcing this file does not activate the system; invoking `nrs` does.

### Fafnir repository secrets

`fafnir` opens the guided secrets workflow; `fafnir help` lists the scriptable commands.
The pinned native build is declared in `nix/common/packages/fafnir-package.nix` and
Home Manager declares `~/.local/bin/fafnir` through `nix/common/packages/fafnir.nix`.
The existing shell PATH already includes this directory; no alias or development
checkout is required. macOS builds retain native Keychain support (CGO enabled).
Updating Fafnir means changing the pinned revision/source hash and vendored dependency
hash, building it, then applying the approved Home Manager/system configuration.
This installs the command only: identity creation and per-repository authorization
remain explicit. Fafnir is experimental; do not treat installation as production-secret approval.

The command is installed locally now as the same store-backed link declared by the
module, with a GC root at `~/.local/state/fafnir/package`. The next approved
activation adopts the declaration; no full system activation was needed for this
installation. The package pins Go 1.27.2 because the configuration's Nixpkgs Go is
older. Native Apple Silicon macOS build/tests and an installed synthetic workflow
were exercised; Linux builds have not been verified here.



<details>
<summary>CLI tools and remote access examples</summary>

```bash

# New CLI tools
bat <file>               # cat with syntax highlighting and line numbers
fd <pattern>             # find replacement (fzf auto-uses it for Ctrl+T)
jq '.' file.json         # JSON processor — pipe curl output through it
jq '.[] | .name'         # extract fields from JSON arrays
zi                       # zoxide interactive picker (fzf-powered cd)
z <dirname>              # jump to frecent directory (replaced z plugin)
delta                    # wired as git pager — git diff/show/log/blame
#                        n/N jumps between diff sections, / searches

# Sigyn
sigyn                   # SSH shell over Tailscale
sigyn-screen            # auto-unlock + native Screen Sharing over an SSH tunnel
```

</details>

<details>
<summary>Per-project environments with direnv</summary>

```bash

# direnv — per-project env auto-loading
echo 'use flake' > .envrc && direnv allow   # auto-load flake on cd
echo 'use nixpkgs#python312' > .envrc        # auto-load python on cd
direnv allow                              # trust a new .envrc
```

direnv loads and unloads environments as you change directories. Review a new
`.envrc` before running `direnv allow`.

### Common .envrc patterns

```bash

# Project with flake.nix (has devShells.default)
echo 'use flake' > .envrc

# Project with shell.nix or default.nix
echo 'use nix' > .envrc

# Quick Python env — no Nix file needed
echo 'use nixpkgs#python312' > .envrc

# Python with packages
echo 'use nixpkgs#python312WithPackages(ps: with ps; [ numpy pandas ])' > .envrc

# Node / Go / Rust
echo 'use nixpkgs#nodejs_22' > .envrc
echo 'use nixpkgs#go' > .envrc
echo 'use nixpkgs#rustup' > .envrc

# Multiple tools at once
echo 'use nixpkgs#nodejs_22 nixpkgs#python312 nixpkgs#postgresql_14' > .envrc

# Apply after creating or changing a .envrc:
direnv allow
```

</details>

Open a **new terminal** (or `exec zsh`) once after first setup for these to load.

## Herdr navigation

In Ghostty 1.3+, **Hyper+A** (`Cmd+Option+Ctrl+Shift+A`) retains Herdr's prefix.
Press **Ctrl+B → a** or **Hyper+A → a** to enter agent-only navigation: **j/k** focuses
the next/previous sidebar agent; **1–9** jumps to an agent by sidebar index.
Repeat without the prefix; **Esc** or **Enter** exits. No picker or ordinary
terminal rows are involved. Pane navigation remains **Hyper+A → h/j/k/l** and
tab selection remains **Hyper+A → 1–9** outside agent mode.
Both Ghostty and Herdr configs must be deployed and reloaded together; see the
[Herdr guide](configs/herdr/README.md). Repository edits alone do not change
existing store-backed configurations.

For keyboard copying on the Danish layout, press **Ctrl+B → Option+8** (`[`),
then use **h/j/k/l**, **v**, **y** after the **COPY** indicator appears.
The internal numbered-agent chords use Ctrl+Alt to avoid the Option+8 collision.

The local [Host Summary plugin](configs/herdr/README.md#compact-host-metrics)
reports CPU, RAM, free disk and optional battery on macOS and Linux. The compact
layout places one summary above each machine's first workspace instead of
repeating host metrics under every project. Plugin deployment and activation of
the managed sidebar layout are separate; see the guide for limits and setup.
The accepted patched client is reproducible with
`bash scripts/build-herdr-client.sh --install`; source revision, toolchain pins
and the complete patch live under `configs/herdr/`. Installation never restarts
the running server. On macOS, the reloadable `herdr` shell function selects that
client and keeps Zsh syntax highlighting correct; `command herdr` uses the stock
client. Run `omz reload` to load shell changes without a system rebuild.


## Shell Discovery

The shell uses Starship, Oh My Zsh's Git plugin, syntax highlighting,
autosuggestions, zoxide, direnv and fzf. Nix provides fzf-tab and loads it after
completion initialization but before autosuggestions.

Useful shortcuts that are easy to miss:

| Keys | Action |
|------|--------|
| `Ctrl+X c` / `Ctrl+X Ctrl+E` | Edit a long command in Vim; `:wq` returns it to the shell without executing |
| `Ctrl+_` | Undo the last command-line edit |
| `Space` after `!!` or `!$` | Expand the history reference before execution |
| `Tab` | Fuzzy completions with directory previews; a shared prefix may need a second Tab |
| `Ctrl+R` | Fuzzy history search |
| `Ctrl+P/N` | Prefix-based history navigation |
| `Ctrl+X Ctrl+Y` | Copy the current command to the macOS clipboard |
| `Ctrl+L` | Clear the visible screen without losing the command buffer |
| `Ctrl+X Ctrl+L` | Clear screen/scrollback without losing the command buffer |
| `Ctrl+X g c` | Insert a Git commit template without executing it |

Type `README.md` to view it with `bat`, `flake.nix` or `app.vue` to edit in VS Code,
or `configs/starship/starship.toml` to edit the prompt source. File handlers and
keyboard customizations live in `nix/common/shell/interactive.zsh`, linked as
`~/.zshrc_local`. `omz reload` loads this customization, but does not regenerate
the generated `~/.zshrc` or update its embedded SSH source paths.
Use named paths such as `ls ~config` and `cd ~code`. For batch renames, start
with `zmv -n '(*).log' '$1.txt'` to preview changes.

The [command reference](COMMANDS.md#shell-keyboard-shortcuts) contains the full
shortcut table, suffix list, quoting caveats, and history/environment guidance.
The editor widget, undo and `magic-space` were already provided by Oh My Zsh.
The tracked config selects Vim and maps both editor sequences explicitly;
`Ctrl+X c` replaces the former spelling-correction binding.

## Music client

Spotifast (`crmne/tap/spotifast`) replaces the official Spotify desktop app.
Homebrew declarations intentionally exclude `spotify` so rebuilds do not reinstall it.
Uninstall Spotify without `--zap` to retain its user data.
AeroSpace routes new Spotifast windows to workspace `M`. Its Home Manager-managed
config is a Nix-store snapshot: repository edits need activation before a reload
can use them. Existing windows must be moved separately.

## Where everything lives

Repository files are source; deployment mechanisms differ by configuration.
Nix-store-backed files are snapshots until Home Manager activation (`nrs`),
while explicitly out-of-store links such as btop follow the checkout directly.
Some settings are applied by activation scripts or copied into application-owned
state. Shell customizations in `nix/common/shell/interactive.zsh` are linked to
`~/.zshrc_local` and can be loaded with `omz reload`; that does not regenerate
the generated `~/.zshrc` or update its embedded SSH source paths. After this
layout change, a new approved rebuild is required to activate the updated
generated shell init and store-backed app sources. Until then, existing store
snapshots and generated init remain unchanged. Existing SSH terminals using the
old source paths can select the moved files explicitly until activation:

```zsh
export STARSHIP_CONFIG=~/config/configs/starship/starship-ssh.toml
alias tmux='tmux -f ~/config/configs/tmux/tmux-ssh.conf'
```
Git-backed flakes omit untracked files. Stage the moved sources before a normal
`nix build .#…` or an approved `nrs`; otherwise Nix cannot see the new paths.
Staging is not activation or publication. Validation of an unstaged layout must
use an explicit `path:` flake containing the new sources, without local secrets.


Applications do not universally reload when a file changes.

```
~/config/
  flake.nix                  # Nix entry point and host configurations
  README.md / COMMANDS.md    # setup and command references
  AGENTS.md                  # repository architecture and contributor guidance
  nix_secrets                # local secrets; gitignored
  configs/<app>/             # app settings: aerospace, btop, ghostty, herdr,
                             # lazygit, sioyek, starship, swiftbar,
                             # syntax-highlight, tmux, zed
  # Ignored/local runtime artifacts may add other on-disk directories.
  nix/
    hosts/                   # per-machine identity and system settings
    common/                  # shared Home Manager packages, shell, dotfiles
    darwin/                  # macOS system and Homebrew modules
    nixos/                   # NixOS modules
    home.nix                 # shared Home Manager entry
    darwin.nix, nixos.nix    # platform entry modules
    MIGRATION.md             # historical migration record; not current guidance
  raycast/                   # ai/, scripts/, shell-discovery/, exports/
  scripts/                   # repository helpers and Mokka generator
  tests/                     # focused tests for scripts/configuration
  shell/                     # remote Bash prompt helpers
  docs/                      # recovery runbook and dated plans/specs
  .omp/                      # canonical OMP configuration and skills
  omp/                       # OMP configuration submodule
  volundr/                   # pinned shared skill library (Pi; Loki consumption configured separately)
```
## How to...

| Task | Quick way | Manual way | Then |
|------|-----------|------------|------|
| Add Nix package | `config-add ripgrep` | Edit `nix/common/packages/<category>.nix` | `nrs` |
| Add Brew formula | `config-add yt-dlp` (auto-detects) | Edit `nix/darwin/homebrew/brews.nix` | `nrs` |
| Add Brew cask | `config-add firefox` (auto-detects) | Edit `nix/darwin/homebrew/casks.nix` | `nrs` |
| Add App Store app | `config-add --mas Xcode 497799835` | Edit `nix/darwin/homebrew/mas.nix` | `nrs` |
| Add shell alias | `config-add --alias gs="git status"` | Edit `nix/common/shell/aliases.nix` | `nrs` |
| Quick alias test | `echo 'alias ...' >> ~/.zshrc_local` | — | `exec zsh` |
| Change dotfile | — | Edit its source under `configs/<app>/` | Usually `nrs`; see deployment mode above |
| Change macOS settings | — | Edit `nix/darwin/system.nix` | `nrs` |
| Change borders colors | — | Edit `nix/darwin/launchd.nix` | `nrs` |
| Change git config | — | Edit `nix/common/git.nix` | `nrs` |

### OMP MCP connections

Public MCP registrations live in `.omp/agent/mcp.json`, including Vercel and
Supabase (`https://mcp.supabase.com/mcp`). Home Manager generates
`~/.omp/agent/mcp.json` from that source plus `nix_secrets`; do not edit the
generated file directly. Validate the source with `jq . .omp/agent/mcp.json`
before activation.

After regenerating the configuration, run `/mcp reload` in OMP. Complete the
Supabase browser OAuth prompt, or use `/mcp reauth supabase` to authorize again.
Verify with `/mcp test supabase` and `/mcp list`. A Vercel MCP `401` with
`No authorization provided` is a separate login issue: use `/mcp reauth vercel`.
OAuth credentials belong in OMP's credential storage, not the tracked JSON.

The Supabase registration is account-wide so it can discover or create projects.
Once a project is selected, prefer a project-scoped connection using
`?project_ref=<id>`. See the [Supabase MCP documentation](https://supabase.com/docs/guides/ai-tools/mcp).

### Zig

Zig 0.17.0 is pinned from the official Zig release tarballs in
`nix/common/packages/languages.nix` for Apple Silicon Macs and x86_64 Linux
(Freyr). The package is managed through Home Manager; apply it with `nrs`
following the normal activation convention above. The Nix derivation copies
the upstream compiler and standard library together and patches the Linux
binary with nixpkgs' `autoPatchelfHook`.

### Salt / Muninn backups

[Salt](https://github.com/spicy-lemonade/salt) is managed through the official
`spicy-lemonade/tap` Homebrew tap, with the fully qualified formula
`spicy-lemonade/tap/salt` declared in `nix/darwin/homebrew/brews.nix`. Apply with
`nrs`; plain `salt` in nixpkgs or Homebrew refers to the unrelated SaltStack.

Salt encrypts backup copies; live notes remain plaintext. The encrypted Muninn
checkout is `~/Desktop/code/muninn`, exposed as `~/muninn`. Obsidian and the
local note fallback use `~/muninn-readable`, a restored plaintext snapshot.
The backup contains case-distinct paths, so the readable copy lives on a
case-sensitive APFS sparsebundle at `~/.local/share/muninn/readable.sparsebundle`,
mounted at `~/.local/share/muninn-volume`. The `muninn-readable` launchd agent
mounts the image at login; Home Manager preserves both symlink targets.

After applying this config with `nrs`, quit Obsidian and run:

```sh
muninn-refresh
```

Before activation, the same command is available directly:
`python3 ~/config/scripts/muninn-refresh.py`.

One-time prerequisite: inspect the expected Salt recipients and approve them
yourself with `salt trust ~/muninn`. The helper never runs `salt trust` and
refuses restores until Salt reports that the keys/settings match your approval;
it checks again after pulling in case the repository settings changed.

The command mounts the existing case-sensitive image if needed, pulls the
encrypted checkout with `--ff-only`, and uses Salt to verify/decrypt into a
fresh directory on that image. It preserves your local `.obsidian` settings,
keeps the previous vault in a dated `vault-before-refresh-*` directory, and
switches the stable `~/muninn-readable` target without opening Obsidian.
An interruption journal recovers a missing vault or finishes an interrupted
receipt on the next run. Rollback snapshots are not automatically deleted.
If the published commit already matches the verified local receipt, the command
returns without another restore or duplicate rollback. Local edits and Salt trust
are still checked before this shortcut.

Before each restore, the helper checks free space on both the image and the Mac.
It requires estimated headroom of twice the current vault's logical size plus
1 GiB. Salt's index is encrypted, so this is not an exact incoming-size check:
a much larger new backup can still exceed the estimate. On failure the current
vault stays intact. Nothing is resized, deleted, or pruned automatically.

If the image is full but the Mac has space, quit Obsidian, ensure no refresh is
running, and grow the existing image. Preserve all `vault-before-refresh-*` folders:

```sh
image="$HOME/.local/share/muninn/readable.sparsebundle"
volume="$HOME/.local/share/muninn-volume"
safety="$HOME/.local/share/muninn/readable-before-resize-$(date +%Y%m%d-%H%M%S).sparsebundle"

diskutil verifyVolume "$volume"
hdiutil detach "$volume"
ditto "$image" "$safety"
diff -qr "$image" "$safety"  # Must match while both images are detached.
diskutil image resize --size 32g "$image"  # Choose a larger limit if needed.
hdiutil attach "$image" -mountpoint "$volume" -nobrowse
diskutil apfs list  # Confirm the readable container grew too.
df -h "$volume" "$HOME"
muninn-refresh
```

Run each step only if the previous one succeeds. On failure, stop and reattach
the original image if needed; do not delete the safety copy. A writable
sparsebundle may have no image checksum (`hdiutil verify` cannot verify it);
use the APFS check and detached-copy comparison instead. Keep the copy until
refresh and rollback checks pass. Sparsebundle capacity is a ceiling, not an
immediate allocation, but retained snapshots still consume real Mac disk space.

Local changes are protected: on its first run, the command compares the current
readable files with a restore of the encrypted checkout's pre-pull commit;
later runs compare a SHA-256 manifest in `~/.local/state/muninn/refresh.json`.
Only `.obsidian` is excluded. If notes differ, it stops without replacing them.
Reconcile those changes through Muninn MCP first; there is no overwrite/force
option, automatic upload, or bidirectional synchronization.

After verifying a local file matches its canonical Muninn MCP note, acknowledge
that specific path with `muninn-refresh --reconciled README.md` (repeat the flag
for multiple files). This is not a force option: each named file must exactly
match Salt's verified incoming snapshot; mismatches, missing files, and other
local edits still stop replacement. It requires an existing receipt and always
restores to verify changed bytes, even at the same commit. Successful refreshes
preserve the old vault and record the acknowledged file hashes in the new receipt.
Never manually edit the receipt or restore old bytes just to silence the guard.

Salt uses the saved macOS Keychain key; otherwise enter the passphrase only
in its terminal prompt. No recovery material is stored in config. The readable
image is plaintext and relies on Mac storage protection. `muninn-refresh`
downloads the latest **published backup**, not newer unpublished MCP edits.
It never seals, stages, commits, pushes, or prunes the backup history.

Verification: `python3 tests/muninn-refresh.py` exercises isolated Git/restore
scenarios for replacement, rollback, local-edit refusal (including post-crash
edits), explicit reconciliation with incoming hash verification, interrupted-run
recovery, trust refusal, unchanged-commit no-ops, and image/host low-space refusal
before decryption. On October 20, the live image
was expanded with a hash-verified detached safety copy and a successful APFS
check; a real Salt refresh restored 4,926 files while retaining prior snapshots.
No Nix activation is needed for Python changes: the installed launcher uses
`~/config/scripts/muninn-refresh.py` directly. Newer MCP changes reach the Mac
only after publication and a successful refresh.

Working Copy on iPhone can pull the Salt ciphertext, but cannot decrypt it by
itself. For readable mobile notes, use a separately planned Obsidian Sync
(end-to-end encrypted) or iCloud mirror, or browse Loki over SSH. Mobile edits
do not currently reconcile back into the authoritative MCP vault; do not
create a plaintext GitHub mirror or enable competing sync writers implicitly.

### SSH access and remote shell

SSH aliases include `neo`, `mini`, `vps1`, `vps2`, `freyr`, `mimer`, `ecoray3d`,
`plato`, `loki`, `sigyn`, `sep` and `windows`. Private endpoints and users stay in
gitignored `nix_secrets`; `nix/common/ssh.nix` generates the included host file.
Local shortcuts live in `nix/common/shell/interactive.zsh`; reload with `omz reload`.

The remote shell bundle lives at `~/.local/share/huginn-shell`; launch it with
`~/.local/bin/huginn-shell` or `ssh -t <host> '~/.local/bin/huginn-shell'`.
Neo, Mini, Freyr, Mimer, VPS1, VPS2 and Ecoray3D use the Mac-like Zsh profile:
Catppuccin Starship, Git aliases, shared/deduplicated history, fuzzy completion,
autosuggestions, syntax highlighting, fzf history, zoxide, direnv and Vim buffer
editing. Missing tools are checksum-pinned user-local binaries; existing tools
are reused. No Homebrew bootstrap, account login-shell change or service restart.
Plato and Loki retain Bash; Sigyn uses a dependency-free minimal Zsh profile.

Every updated SSH shell shows its stable alias on the right in teal. The
managed launcher also shows it without SSH environment variables, including new
Herdr panes. Existing panes keep their current shells. Plain SSH retains the
account's existing shell and host-specific startup, with additive identity and
portable keybinding hooks (`shell/keybindings.zsh` and `shell/keybindings.bash`).
`Ctrl+X Ctrl+L` clears screen/scrollback without executing or losing the pending
command in both Zsh and Bash. Zsh also shares `Ctrl+X c` / `Ctrl+X Ctrl+E`
(Vim buffer editor) and `Ctrl+X g c` (insert a Git commit template) with the Mac.
The hooks preserve the host's editing mode and prompt; the full plugin/alias
profile still requires the managed launcher when preserving an existing `.zshrc`.
If `.zshrc` is absent, the Zsh installer creates a guarded startup file loading
the full shared profile. VPS2’s separately approved login-shell change uses
`/usr/bin/zsh`; the installer itself never runs `chsh`.
To update an already-open shell:

```sh
# In an existing Zsh pane:
source "$HOME/.local/share/huginn-shell/keybindings.zsh"
# In an existing Bash pane (including Loki):
. "$HOME/.local/share/huginn-shell/keybindings.bash"
```

Run these only at a shell prompt, not inside Vim or another running program.
For the complete shared profile, start `~/.local/bin/huginn-shell` instead.
VPS1's pinned OpenClaw Bash wrapper and Ecoray3D's `remote.bash` source and original
`.bashrc.pre-huginn` backup are retained. No gateway configuration is copied.

Preview with `python3 scripts/deploy-shell.py <host>`; `--apply` stages verified
assets and runs the payload's `setup.sh` with `--host <host> --profile <profile>`.
The installer does not install Zsh, restart services, or reload Herdr.
After separately approved `~/.local/bin/herdr server reload-config`, new panes use
the launcher. Payload swaps retain the previous private directory; startup and
Herdr backups live under the bundle's `backups/` (directory 0700, files 0600).

On 2026-10-16, fresh SSH and new Herdr-pane checks passed on all seven saved Herdr
hosts. Ecoray3D and Plato passed SSH checks; their Herdr servers were not running
and were not started for verification. Sigyn passed fresh minimal and ordinary SSH
checks without package installs. SEP and Windows timed out and remain unchanged.
Zsh was installed through each Ubuntu host's own APT repositories; VPS1 also needed
an explicitly approved `/tmp` permission repair to standard 1777 before APT worked.

Freyr and Mimer's primary `.zshrc` symlinks were explicitly approved for replacement
with regular identity-hook copies; `/nix/store` targets remain untouched. A future
Home Manager activation can conflict with these files: preserve the hook/copy and
restore managed ownership deliberately before activating, rather than overwriting
either side silently. This rollout did not activate their Nix configurations.

### Syntax Highlight

The application is managed by the Homebrew `syntax-highlight` cask. Rendering
preferences live in `configs/syntax-highlight/settings.json`; custom Catppuccin
Latte and Mocha themes live in `configs/syntax-highlight/themes/`. Light/dark
selection follows macOS appearance. Tabs render as two spaces; the font is
JetBrains Mono Nerd Font.

Home Manager applies these settings on activation while the app is closed,
preserving unrelated preferences. To apply without a full rebuild, quit Syntax
Highlight and run `python3 ~/config/scripts/apply-syntax-highlight-config.py ~/config/configs/syntax-highlight`.
After activation, `apply-syntax-highlight-config` provides the same operation.
Themes are copied to `~/Library/Application Support/Syntax Highlight/Themes/`;
renderer settings are merged into `~/Library/Preferences/org.sbarex.SourceCodeSyntaxHighlight.plist`,
not the GUI's sandbox preferences. Reopen the app after applying.

### Superbacked 2

Superbacked **2.0.0-rc.3** is pinned in `nix/common/packages/apps.nix` for
Apple Silicon Macs, using the official DMG with a fixed SHA-256 hash.
Nix fixup is disabled to preserve the upstream app signature. Apply with `nrs`;
the app is included in Home Manager's Applications, and the package exposes
`superbacked` on the managed PATH without a shell alias or manual PATH entry.
The CLI launcher executes the absolute app-bundle binary so Electron can find
its helper apps; a direct executable symlink breaks interactive commands.
Run `superbacked --help` to list CLI commands or `superbacked --version` to
check the installed release.

This is a [testing-only release candidate](https://superbacked.com/v2).
Do not use it to protect real secrets.

### Spotifast

Spotifast replaces the official Spotify desktop app. It is managed through the
upstream `crmne/tap/spotifast` Homebrew cask in
`nix/darwin/homebrew/casks.nix`; its tap is declared in the adjacent `default.nix`.
Apply with `nrs`. AeroSpace routes `rocks.spotifast.Spotifast` to workspace `M`.

On first launch, accept macOS's Open confirmation, then choose **Sign in with
Spotify**. Enable **Set up playback here** in the device menu for the separate
local-playback approval. Spotify Premium is required. Offline downloads,
lossless audio, and local-file playback are not supported; see the
[upstream limitations](https://spotifast.rocks/what-spotify-allows/).

Appearance is managed in `configs/spotifast/`: native **Follow system**,
**Catppuccin Latte** for light mode, **Catppuccin/Mocha** for dark mode, and
artwork-derived accents disabled. The serialized `theme_pair` includes the
GUI-selected palettes so the first frame uses the correct colours. Requires
Spotifast 0.14.1 or newer. No external appearance watcher is needed.

Home Manager installs `apply-spotifast-config` and applies the settings during
an approved `nrs` **only while Spotifast is closed**. If it is running, activation
leaves it untouched and prints a reminder. Quit Spotifast, apply, then reopen:

```sh
apply-spotifast-config
```

Before the helper has been installed by a rebuild, the equivalent explicit command is:

```sh
python3 ~/config/scripts/apply-spotifast-config.py ~/config/configs/spotifast
```

The helper copies regular theme files (Spotifast rejects symlinked themes) and
atomically merges only the tracked appearance keys into the local `settings.json`.
It preserves unrelated preferences and never reads or copies credentials, sessions,
history or logs. GUI edits stay local; update the repository appearance file and
palettes deliberately when changing the managed setup. Corrupt local settings or
symlinked settings are refused rather than overwritten; such errors fail the
activation step and require correction before retrying.

Homebrew activation uses `cleanup = "none"`, so removing the Spotify declaration
does not uninstall an existing copy. After confirming Spotifast opens, use
`brew uninstall --cask spotify` without `--zap` to retain Spotify's user data.

### MacPacker and MacTap

MacPacker is managed as a Homebrew cask. MacTap 2.1.2 is pinned in
`nix/common/packages/apps.nix` for Apple Silicon and fetched from its official
GitHub release with a fixed SHA-256 hash; Nix fixup is disabled to preserve its
signature. Apply changes with `nrs`. MacTap requires macOS 14.6+ and a MacBook
with a supported motion sensor (M2 or later, or M1 Pro/Max/Ultra); enable
Accessibility permission for shortcut actions.

### DisplayLink Manager

DisplayLink Manager is installed from the Homebrew `displaylink` cask declared
in `nix/darwin/homebrew/casks.nix`. Each `nrs` skips DisplayLink updates when
it is pinned; otherwise it refreshes metadata and attempts a targeted upgrade.
Other outdated formulas and casks are left unchanged. Network or Homebrew errors
produce a warning without failing the system rebuild.
Reboot after a version change so the login-screen agent and ServiceManagement
helpers load the same build.

Verify the managed installation with:

```bash
brew list --cask --versions displaylink
defaults read /Applications/DisplayLink\ Manager.app/Contents/Info.plist CFBundleShortVersionString
/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' /Library/LaunchAgents/com.displaylink.loginscreen.plist
```

## New machine setup

### Before you start (on old machine)

You'll need to copy these from your old machine — they're gitignored, never in the repo:

- GPG private key (`gpg --export-secret-keys > key.asc`)
- SSH keys (`~/.ssh/id_*`)
- `~/config/nix_secrets` (SSH aliases, API tokens)
- Agent auth: `~/.omp/agent/`

### On the new machine

```bash
# 1. Install Determinate Nix (this repo leaves Nix daemon management to it)
sh <(curl -L https://install.determinate.systems/nix) install

# 2. Install Homebrew
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 3. Clone
git clone git@github.com:lucasfth/config.git ~/config
cd ~/config

# 4. Create your host config (copy from existing):
mkdir -p nix/hosts/$(scutil --get LocalHostName)
cp nix/hosts/lucas-macbook-pro/default.nix nix/hosts/$(scutil --get LocalHostName)/default.nix
# Edit the new host file: system, username, hostname, homeDirectory, stateVersion
# Add it to flake.nix using the existing mkDarwin factory pattern

touch nix_secrets                          # create (copy from old machine)

# 5. Bootstrap
nix build .#darwinConfigurations.<your-hostname>.system
./result/sw/bin/darwin-rebuild switch --flake .

# 6. Switch shell
sudo chsh -s ~/.nix-profile/bin/zsh $USER
```

### After bootstrap

```bash
gh auth login                              # GitHub CLI
# Copy ~/.ssh from old machine
# Copy ~/.omp/agent/ from old machine
brew services start postgresql@14          # if using postgres
brew services start redis                  # if using redis
```

## Raycast config

Raycast preferences are configured through the app UI (not Nix-managed).
To back up your settings, export them and commit the snapshot:

```bash
raycast export --output ~/config/raycast/exports/Raycast-$(date +%Y-%m-%d).rayconfig
# Review the snapshot for sensitive data before committing it.
git add raycast/exports/*.rayconfig && git commit -m "chore(raycast): refresh settings export"
```

Custom Script Commands (such as `invert-scroll.applescript`) live in
`raycast/scripts/` and are linked into Raycast by `nix/common/dotfiles.nix`.

### Shell Discovery Extension

`raycast/shell-discovery/` contains a native Raycast extension, separate from
Script Commands:

- **Daily Shell Tip:** a visible card with one local-calendar-day tip.
- **Shell Tip Menu Bar:** the compact `Zsh` widget with copy, learned and next-tip
  actions.
- **Shell Cheat Sheet:** searchable commands and shortcuts with examples,
  category filters, copy actions and learned/unlearned tracking.
- **Ask Shell Discovery:** Raycast AI searches the same catalogue for configured
  shortcuts, commands, file handlers, examples and cautions.

The extension counts matching entries in recent local Zsh history and prefers
unlearned tips with the lowest counts: unseen commands first, then rarely used
commands. Each tool has its own count, so frequent `rg` use does not hide `jq`.
Open cards and the cheat sheet rescan every 30 seconds; the menu bar refreshes
hourly and when opened. A daily selection remains stable unless it becomes
learned or another tip has a lower usage count.
Individual tip cards and the menu show only that tip's usage. The catalogue-wide
scan summary stays in the cheat sheet's overview, not inside individual tips.
History-read errors remain visible.

Counts cover the recent history tail, not lifetime executions. Zsh deduplication
can remove repeated commands and underestimate use. Key bindings do not leave
history records, so shortcut use remains unknown until you mark the tip learned.
An absent history entry is a discovery hint, not proof of non-use. No raw history
entries are displayed, persisted by the extension, or sent to a service.

In AI Chat, type `@` and select **Shell Discovery**, or open **Ask Shell Discovery**
from Raycast search. Try "How do I clear the screen without losing my command?"
or "How do I edit my current command in Vim?". The AI tool searches catalogue
text only; it does not read history, learned state or usage counts, and cannot
execute commands. Search supports keywords, literal shortcuts and categories;
an empty query returns the full catalogue.

Install or update the local extension:

```bash
cd ~/config/raycast/shell-discovery
npm ci
npm run build
npm run dev
```

The development command imports the extension into Raycast and watches its
source. Open **Daily Shell Tip** for the card, or **Shell Cheat Sheet** to browse
the full catalogue. Run **Shell Tip Menu Bar** once to activate the `Zsh` widget.
If it disappeared while updating from the earlier menu-only Daily Shell Tip,
activate the new menu command rather than the card.

Learned tips and the daily selection persist in Raycast's local extension
storage. Configure the history path in the extension's preferences if your shell
does not use `~/.zsh_history`. The terminal icon has transparent outer corners.

This is a local extension; these commands do not publish it to the Raycast Store.

## Local state and ignored files

`nix_secrets`, agent databases, caches, worktrees, and build outputs such as
`result` are local state, not configuration source. Ignored directories may
remain in an existing checkout; this layout change does not delete their data.
Ignore rules do not untrack existing files: `.omp/puppeteer/package.json`, for
example, remains tracked despite the directory's ignore rule. Review actual
tracked files rather than assuming every file under `.omp/` is either source or
runtime state.

## Brew vs Nix

**Nix:** CLI tools — git, gh, curl, fzf, bat, fd, jq, zoxide, delta, ripgrep, python, node, go, rust, zig, ffmpeg, imagemagick, pandoc, tesseract, cmake, gcc, and ~70 more. See `nix/common/packages/`.

**Brew (formulas):** Tools not in nixpkgs — multica, claude-code, cmux, minio-warp, mole, nightlight, `ykman` (YubiKey Manager), and others. See `nix/darwin/homebrew/brews.nix`.

**Brew (casks):** GUI apps — ghostty, zed, vscode, discord, signal, slack, telegram, obsidian, notion, bitwarden, raycast, google-chrome, zen, betterdisplay, Electrum, and ~20 more. See `nix/darwin/homebrew/casks.nix`.

The Electrum cask is Intel-only and requires Rosetta 2 on Apple Silicon. If Rosetta is missing, install it with `softwareupdate --install-rosetta --agree-to-license`.

**Brew services:** postgresql@14, redis — Nix modules aren't mature on macOS yet.

## Caveats

- Per-machine config lives in `nix/hosts/<name>/default.nix`; add each configuration to `flake.nix`.
- Postgres/Redis remain Brew services; check the current declarations in `nix/darwin/services.nix` before changing their lifecycle.
