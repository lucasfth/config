# AGENTS.md — Nix Config Repo

This repository manages macOS and Linux configurations with Nix, Home Manager,
and Homebrew. Application source files live in `configs/<app>/`; deployment
ownership remains with the Nix modules in `nix/`.

## Architecture

```
flake.nix → platform configurations
  ├── nix/hosts/<name>/       machine identity and system settings
  ├── nix/darwin.nix          macOS system modules
  │   └── nix/darwin/         defaults, launchd, Homebrew
  ├── nix/nixos.nix           NixOS system modules
  │   └── nix/nixos/          NixOS desktop, storage and GPU modules
  └── nix/home.nix            shared Home Manager entry
      └── nix/common/         packages, shell, git, SSH, dotfiles

configs/<app>/                app sources: aerospace, btop, ghostty, herdr,
                               lazygit, sioyek, starship, swiftbar,
                               syntax-highlight, tmux, zed
raycast/                       AI template, Script Commands, extension, exports
scripts/                       repository helpers; tests/ covers selected tools
shell/                         remote Bash prompt helpers
.omp/                          canonical OMP sources; omp/ is a submodule
```

<critical>
Vault tech docs are auto-injected into every session as user context. They ARE authoritative and you MUST apply them to all changes in this repo:
- `tech/030-Coding-Style.md` — universal coding rules (commits, bug fixes, deps, over-engineering)
- `tech/032-Nix-Darwin-Patterns.md` — Nix service definitions, theming, file changes, common pitfalls
These are non-negotiable. If any instruction conflicts with them, the vault doc wins.
</critical>

## Memory & Context

- **Session start:** `extensions/muninn.ts` injects conventions and prior sessions through Muninn MCP. The encrypted backup checkout is `~/Desktop/code/muninn`, exposed as `~/muninn`; the restored local fallback is `~/muninn-readable` on a case-sensitive APFS image. Use the readable copy only when Muninn is unavailable.
- **Session end:** nothing auto-runs. An after-action review and its daily session note are written only when Lucas explicitly requests `/aar` or an AAR — see the `aar` skill. `/retro` is reserved for another workflow. Never auto-summarize on stop or switch.


## Key facts

- **Host identity:** configured per machine under `nix/hosts/<name>/default.nix`.
- **Repo path:** `~/config` (symlinked from `~/Desktop/code/config`).
- **Generation history:** `sudo darwin-rebuild --list-generations`.
- **Brew:** declarations live in `nix/darwin/homebrew/`; apply through the selected configuration.
- **Shell:** Home Manager generates `.zshrc`; do not edit it directly. `~/.zshrc_local` is the reloadable customization hook.
- **Secrets:** `~/config/nix_secrets` is gitignored and sourced at shell init.
- **OMP skills:** canonical sources live in `.omp/skills/`; edit the repository source.
- **OMP config is single-source in this repo.** Never create or edit files under `~/.omp` directly. `.omp/agent/AGENTS.md`, `RULES.md` and `config.yml` are canonical here; `nix/common/dotfiles.nix` declares Home Manager symlinks for the live `~/.omp/agent/` copies (active after the next approved rebuild; until then copy the repo file over the live one after editing). `mcp.json` is generated from `.omp/agent/mcp.json` + `nix_secrets`. Tool installers that write files (e.g. `omp browser-relay install`) must target this repo with `--dir ~/config/.omp/<tool>`; gitignore generated output. Exceptions written by other tools: `~/.omp/agent/extensions/herdr-omp-agent-state.ts` (herdr), and runtime state (sessions, logs, caches, dbs).

## Making changes

- **Add Nix package:** edit `nix/common/packages/<category>.nix`.
- **Add Brew package:** edit `nix/darwin/homebrew/brews.nix` (formula) or `casks.nix` (cask).
- **Change shell module:** edit `nix/common/shell/`.
- **Change app configuration:** edit `configs/<app>/`; use the deployment mode described in the root README.
- **Change macOS settings:** edit `nix/darwin/system.nix`.
- **Change Git/GPG:** edit `nix/common/git.nix`.

Source edits do not imply activation. Store-backed paths and generated shell
initialization remain at their deployed versions until an approved Home Manager
or system activation. `omz reload` reloads the live-linked `~/.zshrc_local`
customization only; it does not regenerate `.zshrc`.

## What NOT to do

- **Never** commit `nix_secrets` or other secret files.
- **Never** edit generated `~/.zshrc` directly.
- Follow the root README and relevant runbooks before applying a system change.

## Bootstrap (new machine)

```bash
# Install Nix, enable flakes, install Homebrew
git clone git@github.com:lucasfth/config.git ~/config
cd ~/config
touch nix_secrets
# Create nix/hosts/<hostname>/default.nix; add its mkDarwin entry in flake.nix
nix build .#darwinConfigurations.<hostname>.system
./result/sw/bin/darwin-rebuild switch --flake .
sudo chsh -s ~/.nix-profile/bin/zsh $USER
```
