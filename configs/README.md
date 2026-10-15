# Application configuration sources

One directory per application, including single-file configurations. Source filenames do not need a leading dot: Home Manager owns the installed destination.

| Directory | Deployment |
| --- | --- |
| `aerospace/` | Store-backed `~/.aerospace.toml` on macOS |
| `ghostty/` | Store-backed `~/.config/ghostty/config` |
| `starship/` | Normal config is store-backed on the Mac; SSH config is selected directly from this checkout. Mimer's standalone module uses a live repository link. |
| `tmux/` | Normal config is store-backed as `~/.tmux.conf`; SSH startup selects the checkout's `tmux-ssh.conf`, which loads the installed normal config. |
| `btop/` | Live repository links for the config and theme on macOS |
| `herdr/` | Store-backed `~/.config/herdr/config.toml` |
| `lazygit/` | Store-backed `~/.config/lazygit/config.yml`; application state is not source |
| `sioyek/` | Store-backed preferences under macOS Application Support |
| `syntax-highlight/` | Activation copies themes and merges selected renderer preferences while the app is closed |
| `zed/` | Store-backed `~/.config/zed/settings.json` |
| `swiftbar/` | Plugin source scripts; this repository does not declare their installation directory |

## Editing and applying

Deployment mappings live in [`../nix/common/dotfiles.nix`](../nix/common/dotfiles.nix), with Herdr in [`../nix/common/herdr.nix`](../nix/common/herdr.nix) and SSH selection in [`../nix/common/shell/init.nix`](../nix/common/shell/init.nix).

Store-backed settings require an approved rebuild, followed by the application's own reload/restart if necessary. Editing a source file does not update an existing store snapshot. Live-linked settings expose file changes immediately, but application reload behavior still depends on the application.

To apply Syntax Highlight without a full rebuild, quit the app and run:

```sh
python3 ~/config/scripts/apply-syntax-highlight-config.py ~/config/configs/syntax-highlight
```

The remote Herdr installer fetches the `main` branch from GitHub. Local path changes are not available to remote machines until published; do not run it against an unpublished layout.

## Boundaries

- Keep package declarations, Nix modules, and service definitions in `nix/`.
- Keep Raycast integrations in `raycast/` and shared remote-shell snippets in `shell/`.
- Do not add caches, sessions, credentials, generated preferences, or application state here.
- Keep canonical agent sources under `.omp/`; the portable `omp/` directory is a separate Git submodule.
