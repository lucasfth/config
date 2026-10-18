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
| `lazygit/` | Store-backed `~/Library/Application Support/lazygit/config.yml` on macOS, `~/.config/lazygit/config.yml` on Linux; application state is not source |
| `sioyek/` | Store-backed preferences under macOS Application Support |
| `syntax-highlight/` | Activation copies themes and merges selected renderer preferences while the app is closed |
| `zed/` | Store-backed `~/.config/zed/settings.json` |
| `swiftbar/` | Plugin source scripts; this repository does not declare their installation directory |
| `pi/` | Canonical native Pi sources and lockfile; `scripts/pi-native` generates a private runtime profile. Shell aliases are live-linked; no Nix activation is required. |

## Editing and applying

Deployment mappings live in [`../nix/common/dotfiles.nix`](../nix/common/dotfiles.nix), with Herdr in [`../nix/common/herdr.nix`](../nix/common/herdr.nix) and SSH selection in [`../nix/common/shell/init.nix`](../nix/common/shell/init.nix).

Store-backed settings require an approved rebuild, followed by the application's own reload/restart if necessary. Editing a source file does not update an existing store snapshot. Live-linked settings expose file changes immediately, but application reload behavior still depends on the application.

### LazyGit

LazyGit's native macOS directory is separate from `~/.config` unless `XDG_CONFIG_HOME` is set. Deploying only to `~/.config/lazygit` leaves the macOS app using its own config rather than the managed settings. The managed config disables the subprocess-return prompt and sets `git.overrideGpg: true` to avoid suspending for commits, as suggested in [upstream issue #4956](https://github.com/jesseduffield/lazygit/issues/4956). Git's signing configuration is unchanged, but successful signing and commit-to-UI behavior with this workaround have not been verified locally. It does not repair terminal resume for external editors or shell commands.

The reloadable `lg` alias selects the repository config explicitly. The generated shell now loads `~/.zshrc_local` after all shared aliases, so startup and `omz reload` retain that selection. This ordering change requires one approved system rebuild. Before activation, the deployed shell still restores the old plain `lg` alias; a direct `source ~/.zshrc_local` is only a temporary workaround. After activation, use `omz reload` normally.

Before activating this path correction on an existing Mac, back up the unmanaged `~/Library/Application Support/lazygit/config.yml` outside the managed destination so Home Manager can install its link. Leave `state.yml` untouched. Obtain approval before backing up/moving the live file and running a system switch. A correct deployment path alone does not establish that a post-commit blank-screen issue is resolved.

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
