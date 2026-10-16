# Repository Scripts

This directory contains repository maintenance and configuration helpers. Most
are invoked directly or through Home Manager-installed commands; these paths do
not all share the same deployment or activation behavior.

- `config-add` edits the appropriate Nix package, Homebrew, or shell alias source.
- `nix-health [--check|--notify]` checks the local Nix installation. See
  [`docs/nix-recovery.md`](../docs/nix-recovery.md) for recovery instructions.
- `muninn-refresh.py` safely refreshes the local readable Muninn snapshot; the
  installed `muninn-refresh` command is provided after Home Manager activation.
- `apply-syntax-highlight-config.py` applies the tracked settings and themes to
  the app's local preferences; the root README documents the required app state
  and exact invocation.
- `sigyn-screen` and `sigyn-vnc` open the corresponding iPad remote sessions.
- `build-herdr-client.sh` rebuilds/tests the pinned macOS Herdr sidebar patch from
  `configs/herdr/client.patch` and `client-build.env`. Build-only by default;
  `--install` atomically replaces the independent client without restarting servers.
- `setup-herdr-remote.sh` installs missing Herdr, preserves existing config,
  repairs unresolved default shells and copies/links the host-summary plugin.
  It uses the local checkout when available, otherwise published GitHub `main`
  sources; unpublished changes are unavailable through the raw URL. It does not
  reload/restart servers or start collectors. Termux requires an existing build.
- `deploy-shell.py <host>` previews the shell bundle's missing tools; `--apply`
  transfers checksum-pinned tools/plugins and runs `shell/setup.sh`. It preserves
  account login shells and services; Herdr reload is separate. The bundle uses
  Zsh on regular hosts, Bash on Plato/Loki and minimal Zsh on Sigyn. See the root
  README for live deployment, backup and Home Manager ownership boundaries.
- `mokka/` contains the dynamic wallpaper generator and its local tests.

See the [test guide](../tests/README.md) for the tracked test inventory and invocation style.
