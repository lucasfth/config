---
type: skill
tags: [herdr, terminal, multiplexer, config, ssh, remote, nix]
status: active
updated: 2026-07-28
---

# Herdr Configuration

Herdr config is managed centrally in the Nix config repo (`~/config`) and deployed identically to all machines.

## Config Source

- **Canonical file:** `herdr/config.toml` in the Nix config repo
- **Config is identical on all machines** — one source of truth

## Per-Machine Installation

### macOS (lucas-macbook-pro)
- Binary: `brew install herdr` (managed in `nix/darwin/homebrew/casks.nix`)
- Config: symlinked by `nix/common/herdr.nix` → `~/.config/herdr/config.toml`
- Update: `nrs` rebuilds + symlinks

### freyr (NixOS, x86_64-linux)
- Binary: Nix package in `nix/common/packages/herdr.nix` (fetches v0.7.5 pre-built binary)
- Config: symlinked by `nix/common/herdr.nix`
- Update: `sudo nixos-rebuild switch --flake ~/config#freyr`

### mimer (Ubuntu, home-manager standalone)
- Binary: Nix package in `nix/common/packages/herdr.nix`
- Config: symlinked by `nix/common/herdr.nix`
- Update: `home-manager switch --flake ~/config#ecoray-admin@mimer`

### se1, se2, se3 (non-Nix VPS)
- Binary + config: run `scripts/setup-herdr-remote.sh` from this repo
- One-liner: `curl -fsSL https://raw.githubusercontent.com/lucasfth/config/main/scripts/setup-herdr-remote.sh | bash`
- Re-run to update config after changes

## Config Details

The herdr config (`herdr/config.toml`):
- Catppuccin theme
- Prefix key: `ctrl+b` (matches tmux)
- Split bindings: `prefix+|` vertical, `prefix+-` horizontal
- Detach: `prefix+d`, reload: `prefix+r`
- System toast notifications
- Onboarding disabled

## Adding a New Machine

1. Nix-managed (freyr/mimer pattern): rebuild, config auto-symlinked
2. Non-Nix (VPS pattern): run `scripts/setup-herdr-remote.sh`
