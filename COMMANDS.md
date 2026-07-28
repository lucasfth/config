# Commands

All commands and aliases defined in this config, grouped by category.

## Rebuild & System

| Command | Does |
|---------|------|
| `nrs` | Rebuild system + reload shell |
| `nix-update` | Update flake.lock + rebuild + reload |
| `nix-rollback` | List generations, show rollback command |
| `nix-search <pkg>` | Search nixpkgs |
| `nix-which <cmd>` | Show path + Nix/Brew source |
| `config-add <name>` | Auto-detect and add package (nixpkgs → brew formula → cask) |
| `config-add --cat <cat> <name>` | Add nix package to specific category |
| `config-add --alias <name>=<value>` | Add shell alias |
| `config-add --mas <Name> <ID>` | Add Mac App Store app |

## Navigation

| Command | Does |
|---------|------|
| `z <dirname>` | Jump to frecent directory (zoxide) |
| `zi` | Interactive picker (fzf-powered) |
| `fd <pattern>` | Find files/dirs (replaces find) |

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
| `ssh-termux` | Android (Termux) |
| `ssh-windows` | Windows machine |

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
