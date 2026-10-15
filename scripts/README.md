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
- `setup-herdr-remote.sh` fetches the Herdr config from the repository's GitHub
  `main` raw URL. The config is sourced from `configs/herdr/config.toml`; a newly
  changed source will not be available through that published URL until it is
  published to `main`.
- `mokka/` contains the dynamic wallpaper generator and its local tests.

See the [test guide](../tests/README.md) for the tracked test inventory and invocation style.
