# Repository Layout Implementation Plan

**Goal:** Group application source files consistently and keep repository documentation current without changing deployment behavior.

**Architecture:** Raw app settings live under `configs/<app>/`; Nix retains installation and deployment ownership. Raycast scripts and exports join the existing Raycast integration directory. Canonical `.omp/` sources and the `omp` submodule stay in place.

## Move map

- `.aerospace.toml` → `configs/aerospace/aerospace.toml`
- `config.ghostty` → `configs/ghostty/config`
- `starship.toml`, `starship-ssh.toml` → `configs/starship/` (same names)
- `.tmux.conf`, `.tmux-ssh.conf` → `configs/tmux/tmux.conf`, `configs/tmux/tmux-ssh.conf`
- Tracked contents of `btop/`, `herdr/`, `lazygit/`, `sioyek/`, `syntax-highlight/`, `zed/`, and `swiftbar/` → matching directories under `configs/`
- `raycast-scripts/` tracked scripts → `raycast/scripts/`
- Root Raycast `.rayconfig` snapshots → `raycast/exports/`

## Execution

1. Inspect callers, record the move map, and distinguish tracked source from ignored state. Do not delete ignored files or change live state.
2. Move tracked sources and update Nix store sources, out-of-store paths, remote bootstrap URLs, shell paths, tests, and ignore rules. Preserve installed destinations and deployment mechanisms.
3. Refresh README and COMMANDS, correct the root agent guide's source layout, and add concise guides for configs, Nix, Raycast, scripts, and tests where useful. Historical dated plans remain historical.
4. Evaluate the Darwin configuration using the working source without staging or switching. Check source mappings exist, exercise Starship config rendering and the Syntax Highlight helper against an isolated temporary target where feasible, and run affected existing tests. No permanent source-text tests.

## Invariants

- No commits, pushes, system switches, application restarts, secret edits, or submodule changes.
- Existing live repository links must continue resolving after sources move; retain ignored-only directories rather than deleting runtime state.
- Store-backed versus live-linked deployment remains unchanged.
- `.omp/skills/` remains canonical. Tracked `.omp/puppeteer/package.json` is not made untracked merely because its directory is ignored.
