# Nix Config

## Commands

```bash
nrs                     # rebuild + check DisplayLink updates + reload shell
                        # other windows: omz reload
nix-search <name>       # find a package in nixpkgs
nix-which <tool>        # check which version (shows Nix vs Brew)
nix-update              # update flake.lock + rebuild + reload
nix-rollback            # list generations, show rollback command

# NOT managed by nrs/nix-update:
omp update              # update omp (bun global package, not in nixpkgs)

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

# direnv — per-project env auto-loading
echo 'use flake' > .envrc && direnv allow   # auto-load flake on cd
echo 'use nixpkgs#python312' > .envrc        # auto-load python on cd
direnv allow                                  # trust a new .envrc
direnv runs automatically on `cd`. It loads/unloads the env as you move in
and out of directories. First time with a new `.envrc`, run `direnv allow`.

### Common .envrc patterns

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

Open a **new terminal** (or `exec zsh`) once after first setup for these to load.

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
or `starship.toml` to edit in Vim. File handlers and keyboard customizations live
in `nix/common/shell/interactive.zsh`, linked as `~/.zshrc_local`. Edit that file
and run `omz reload` to apply changes without a system rebuild.
Use named paths such as `ls ~config` and `cd ~code`. For batch renames, start
with `zmv -n '(*).log' '$1.txt'` to preview changes.

The [command reference](COMMANDS.md#shell-keyboard-shortcuts) contains the full
shortcut table, suffix list, quoting caveats, and history/environment guidance.
The editor widget, undo and `magic-space` were already provided by Oh My Zsh.
The tracked config selects Vim and maps both editor sequences explicitly;
`Ctrl+X c` replaces the former spelling-correction binding.

## Where everything lives

```
~/config/
  flake.nix                # entry — darwinConfigurations + nixosConfigurations
  nix_secrets              # SSH keys, API tokens (GITIGNORED)

  scripts/
    config-add             # helper: add packages/aliases to the right file
    nix-health             # detects a missing Nix store, profile, or login shell
    sigyn-vnc             # short-lived scripted VNC actions over SSH
    sigyn-screen          # on-demand native Screen Sharing over SSH
  starship.toml            # prompt
  config.ghostty           # terminal
  .aerospace.toml          # window manager
  .tmux.conf               # tmux
  lazygit/config.yml       # lazygit
  zed/settings.json        # zed editor
  sioyek/prefs_user.config # PDF reader
  raycast-scripts/         # Raycast script commands
  docs/
    nix-recovery.md         # recovery runbook after a macOS update
  nix/hosts/               # per-machine config (hostname, username, system)
    lucas-macbook-pro/
    lucas-nixos/           # NixOS placeholder

  nix/common/              # cross-platform home-manager modules
    packages/              # Nix packages (cli, languages, data, cloud, media, apps, extras)
    shell/                 # zsh config (init, aliases, paths, completions, env)
    git.nix                # git, gh, GPG
    tmux.nix               # tmux binary
    vim.nix                # vim + catppuccin theme
    dotfiles.nix           # symlinks (starship, ghostty, tmux, zed, sioyek, etc.)

  nix/darwin/              # macOS-only modules
    system.nix              # macOS defaults (dock, finder, trackpad)
    hostname.nix            # Determinate Nix compatibility
    launchd.nix             # launchd services (AeroSpace, Nix health, cleanup)
    services.nix            # Nix services stubs (postgres, redis)
    homebrew/
      brews.nix            # brew formulas
      casks.nix            # brew casks (GUI apps)
      mas.nix              # Mac App Store apps
      activation.nix       # brew trust + cleanup scripts

  nix/nixos/               # NixOS system modules (placeholder)
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
| Change dotfile | — | Edit the file directly | `nrs` |
| Change macOS settings | — | Edit `nix/darwin/system.nix` | `nrs` |
| Change borders colors | — | Edit `nix/darwin/launchd.nix` | `nrs` |
| Change git config | — | Edit `nix/common/git.nix` | `nrs` |

### DisplayLink Manager

DisplayLink Manager is installed from the Homebrew `displaylink` cask declared
in `nix/darwin/homebrew/casks.nix`. Each `nrs` checks for and attempts to install
DisplayLink updates; other outdated formulas and casks are left unchanged.
Network or Homebrew errors produce a warning without failing the system rebuild.
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
- Agent auth: `~/.omp/agent/`, `~/.hermes/auth.json`

### On the new machine

```bash
# 1. Install Nix
sh <(curl -L https://nixos.org/nix/install)

# 2. Enable flakes
mkdir -p ~/.config/nix
echo "experimental-features = nix-command flakes" >> ~/.config/nix/nix.conf
sudo launchctl kickstart -k system/org.nixos.nix-daemon

# 3. Install Homebrew
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 4. Clone
git clone git@github.com:lucasfth/config.git ~/config

# 5. Create your host config (copy from existing):
mkdir -p nix/hosts/$(scutil --get LocalHostName)
cp nix/hosts/lucas-macbook-pro/default.nix nix/hosts/$(scutil --get LocalHostName)/default.nix
# Edit the new host file: system, username, hostname, homeDirectory, stateVersion
# Add to flake.nix: darwinConfigurations."<hostname>" = mkDarwin "<hostname>";

touch nix_secrets                          # create (copy from old machine)

# 6. Bootstrap
nix build .#darwinConfigurations.<your-hostname>.system
./result/sw/bin/darwin-rebuild switch --flake .

# 7. Switch shell
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
raycast export --output ~/config/Raycast-$(date +%Y-%m-%d).rayconfig
git add *.rayconfig && git commit -m "backup: raycast settings"
```

Custom scripts (like `invert-scroll.applescript`) live in `raycast-scripts/`
and are symlinked into Raycast's extensions folder by `common/dotfiles.nix`.

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

## What's gitignored (never pushed)

`nix_secrets`, `.omp/agent/*.db*`, `node_modules/`, `result`

## Brew vs Nix

**Nix:** CLI tools — git, gh, curl, fzf, bat, fd, jq, zoxide, delta, ripgrep, python, node, go, rust, zig, ffmpeg, imagemagick, pandoc, tesseract, cmake, gcc, and ~70 more. See `nix/common/packages/`.

**Brew (formulas):** Tools not in nixpkgs — opencode, multica, claude-code, cmux, minio-warp, mole, nightlight, and others. See `nix/darwin/homebrew/brews.nix`.

**Brew (casks):** GUI apps — ghostty, zed, vscode, discord, signal, slack, telegram, obsidian, notion, bitwarden, raycast, google-chrome, zen, betterdisplay, and ~20 more. See `nix/darwin/homebrew/casks.nix`.

**Brew services:** postgresql@14, redis — Nix modules aren't mature on macOS yet.

## Caveats

- Per-machine config lives in `nix/hosts/<hostname>/default.nix` — create one per machine
- Postgres/Redis are brew services — nix-darwin service modules don't auto-init (see `services.nix`)
