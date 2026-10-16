# Nix Configuration

Nix remains the deployment owner for packages, system settings, and managed
configuration files. Application sources are grouped under `configs/<app>/`;
`nix/common/dotfiles.nix` maps them to the same installed home destinations.
Store-backed files are snapshots until Home Manager activation. Explicit
out-of-store links and activation scripts have different behavior; see the root
[README](../README.md) before assuming an edit is live. No rebuild or activation
is implied by changing source files.

## Module layout

- `../flake.nix` declares `darwinConfigurations`, `nixosConfigurations`, and
  `homeConfigurations`, using the host inputs in `hosts/<name>/`.
- `hosts/<name>/default.nix` holds per-machine identity and system parameters.
- `darwin.nix` imports `darwin/` system and Homebrew modules.
- `nixos.nix` imports `nixos/` platform modules.
- `home.nix` imports shared `common/` Home Manager modules: packages, shell,
  Git, SSH, tmux, herdr, desktop configuration, and dotfile deployment.
- `MIGRATION.md` is a historical record, not current guidance.

## Common operations

From the repository root:

```sh
nix flake check
nix eval .#darwinConfigurations.lucas-macbook-pro.system.drvPath
sudo darwin-rebuild switch --flake .#lucas-macbook-pro
```

These commands respectively check the flake, evaluate a derivation path, and
activate the Darwin configuration. Activation changes the system and requires
explicit authorization; consult the root README and host-specific runbooks first.
The command table there documents `nrs`, rollback, package and Homebrew changes.

Add a Nix package by editing the appropriate `common/packages/*.nix` module; add
Homebrew formulas, casks, or App Store apps in `darwin/homebrew/`. The
`config-add` helper can make these edits, but changes take effect only after
activation. Keep machine-specific values in `hosts/<name>/`, not shared modules.

Repolicense's optional styled terminal interface uses the `gum` Homebrew formula declared in `darwin/homebrew/brews.nix`. Its local Zig executable and conditional alias remain separate from Nix package management; see [local command setup](../COMMANDS.md#local-not-nix-managed) for build paths, launcher modes, and worktree behavior.

## Source path migration

The grouped sources are `configs/aerospace`, `btop`, `ghostty`, `herdr`,
`lazygit`, `sioyek`, `starship`, `swiftbar`, `syntax-highlight`, `tmux`, and
`zed`. `dotfiles.nix` preserves each installed home destination. SwiftBar sources
are present in `configs/swiftbar/`; this guide does not claim an installer or
Home Manager deployment mapping for them.