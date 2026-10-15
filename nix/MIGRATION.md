# Nix Migration — Historical Record

This file records the initial Homebrew-to-Nix migration (2026-05-31 through
2026-06-03). Its checklist, TODO list, and file tree below were historical and
must not be used as current status or instructions. In particular, later app
settings were regrouped under `configs/<app>/`, and Nix modules now live under
`nix/common/`, `nix/darwin/`, `nix/nixos/`, and `nix/hosts/`.

Use the current [repository README](../README.md) for the layout, deployment
modes, and operational guidance; [AGENTS.md](../AGENTS.md) for architecture and
contributor guidance; and [Nix README](README.md) for the current Nix module
map and commands.

The original migration notes are retained below for historical context only.
They include stale paths, deferred ideas, and point-in-time descriptions; verify
all operational facts against the current guides and configuration before use.

---

## Original migration checklist (2026-06-03)

Nix installed and flakes enabled; nix-darwin and Home Manager integrated; CLI
packages migrated; remaining Brew packages declared; initial dotfiles and shell
configuration managed; GPG signing configured; command aliases added; secrets
excluded; and the `repolicense-cli` submodule added. This checklist describes
the initial migration only, not the current repository or deployed machine.
