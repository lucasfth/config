# CLAUDE.md — Agent context for lucasfth/config

This repo is my macOS nix-darwin + home-manager configuration. Every tool, dotfile, brew package, and macOS setting is declaratively managed here.

## Architecture

```tree
flake.nix → darwin.lib.darwinSystem
├── nix/darwin.nix imports:
│   ├── system.nix      # macOS defaults (dock, finder, trackpad, hot corners)
│   ├── hostname.nix    # machine identity + nix daemon + GC
│   ├── launchd.nix     # borders (AeroSpace borders), tailwind cleanup
│   ├── services.nix    # Nix services stubs (postgres, redis — still brew)
│   └── homebrew/       # brews + casks + mas + activation
└── home-manager:
    └── nix/home.nix imports:
        ├── packages/   # 8 category files (cli, languages, data, cloud, media, apps, extras)
        ├── shell/      # init, aliases, paths, completions, env, starship
        ├── git.nix     # git + gh + GPG + gpg-agent
        ├── tmux.nix    # tmux binary + basic config
        ├── vim.nix     # vim + catppuccin + lightline
        └── dotfiles.nix # symlinks for all dotfiles + raycast scripts
```

## Common tasks

| Task | Do this |
|------|---------|
| Add Nix package | Add to `nix/common/packages/<category>.nix` |
| Add Brew formula | Add to `nix/darwin/homebrew/brews.nix` |
| Add Brew cask | Add to `nix/darwin/homebrew/casks.nix` |
| Add App Store app | Add to `nix/darwin/homebrew/mas.nix` |
| Add shell alias | Add to `nix/common/shell/aliases.nix` |
| Add/enable a dotfile | Edit file, then symlink in `nix/common/dotfiles.nix` |
| Change macOS setting | Edit `nix/darwin/system.nix` |
| Quick alias test | `echo 'alias ...' >> ~/.zshrc_local` then `exec zsh` |

## Key facts

- **Hostname:** `lucas-macbook-pro` / user: `lucasfreytorreshanson`
- **Repo path:** `~/config` (also at `~/Desktop/code/config`)
- **Rebuild:** `nrs` = `sudo darwin-rebuild switch --flake ~/config && exec zsh`
- **Never** edit `~/.zshrc` directly — it's generated from `nix/common/shell/`
- **Never** `brew install` — brew is declarative via `nix/darwin/homebrew/`
- **Zed** config at `zed/settings.json` + `zed/keymap.json` + `zed/tasks.json`
- **Raycast** scripts at `raycast-scripts/`, symlinked by `dotfiles.nix`
- **Ghostty** config at `config.ghostty`
- **AeroSpace** config at `.aerospace.toml`
- **Secrets:** `~/config/nix_secrets` (gitignored, sourced at shell init)

## Cross-platform structure

The `nix/common/` tree is designed to work on both macOS and Linux.
Use `lib.optionals stdenv.isDarwin [...]` for macOS-only packages.
The `nix/darwin/` tree is macOS-only and not imported on Linux.

## Static analysis

```bash
nix flake check --flake ~/config   # Full validation
git ls-files --others --exclude-standard  # Check for untracked files
```

Always `git add` new `.nix` files before `nrs` — Nix flakes only track git-tracked files.
