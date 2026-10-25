# Tests

This directory contains focused regression checks for repository scripts and
Nix configuration. They are not a single uniform test suite; inspect each
script's setup and prerequisites before running it. Tests may require Nix,
macOS-specific tools, or temporary local services/mocks.

- `muninn-refresh.py` exercises refresh, rollback, trust, local-edit refusal,
  and interrupted-run behavior using isolated temporary repositories.
- `gyroflow-install.py` checks isolated first/repeat installs, upgrades without
  old store sources, backups, signature/running/unmanaged refusal and rollback
  after marker failure. It mocks macOS tools, never touches the live plugin path.
- `resolve-studio.py` checks Studio/free metadata and downgrade refusal.
  `resolve-activation.py` evaluates both real Darwin module branches and tests
  Resolve-open deferral versus closed installation with isolated command stubs.
- `corridorkey-bridge.py` checks input size/colour/frame metadata and path/profile
  refusal, single-clip selection, cutout-only import and failure propagation.
  `corridorkey-menu.py` checks orchestration, project-change refusal and restoring
  the previous bin. These isolated mocks do not prove live menu/render acceptance.
- `sioyek-install.py` tests read-only app upgrades, retained backups, copy/final
  move rollback and dry-run preservation in temporary fixtures, never /Applications.
- `spotifast-config.py` checks isolated appearance restoration, fresh profiles,
  repeat application, preservation of unrelated state, and refusal while running
  or when local settings are invalid. Run with `python3 tests/spotifast-config.py`.
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
- `gimle-config.py` evaluates the Mac mini identity, host-isolation boundaries and retained MacBook integrations. Run with `python3 tests/gimle-config.py`; it does not activate either host.
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