# Tests

This directory contains focused regression checks for repository scripts and
Nix configuration. They are not a single uniform test suite; inspect each
script's setup and prerequisites before running it. Tests may require Nix,
macOS-specific tools, or temporary local services/mocks.

- `muninn-refresh.py` exercises refresh, rollback, trust, local-edit refusal,
  and interrupted-run behavior using isolated temporary repositories.
- `sigyn-screen.sh` and `sigyn-vnc.sh` exercise the Sigyn helpers with mock
  commands and temporary credentials.
- `nix-health.sh` checks the Nix health helper.
- `rebuild.zsh` checks macOS/Linux rebuild command selection, strict shell reload, and failure propagation without invoking real sudo or activating a system. It sources `interactive.zsh` directly; it does not cover generated `.zshrc` startup ordering or prove that a deployed shell has loaded the fix.
- `herdr-host-summary.sh` checks summary ownership plus isolated concurrent collector starts, stop/restart, per-socket locks and unrelated-PID safety. It launches only its own temporary collectors, not a Herdr server or GUI client.
- `fleet-shell.py` exercises isolated installation, repeated preservation,
  private backups, approved/unapproved startup symlinks, actual launchers and
  plain-SSH identity, including minimal installation without awk or gzip.
  Run with `python3 tests/fleet-shell.py`; it never touches a live remote host.
- `nix-recovery-config.sh` and `setup-efficiency.sh` inspect evaluated Nix
  configuration and activation settings.
- `configs/pi/`: run `npm run typecheck`, `npm test` and `npm run verify:integration` there. These retain isolated loopback provider, RPC, normal-shell PTY and renderer checks. `pi update` runs them before reporting success; they do not prove live Freyr/Muninn/Herdr integrations.

Run an individual script from the repository root, for example:

```sh
python3 tests/muninn-refresh.py
bash tests/sigyn-screen.sh
bash tests/sigyn-vnc.sh
zsh tests/rebuild.zsh
```

Some checks require a working flake evaluation and are tied to the current host
or macOS. Follow each script's prerequisites; these tests do not activate a
configuration or replace operational verification of a deployed system.