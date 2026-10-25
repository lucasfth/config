# Herdr

This directory contains the managed Herdr configuration. The configured prefix is `Ctrl+B`.

## Agent-only navigation in Ghostty

Requires Ghostty 1.3+ and the matching `../ghostty/config` source.

1. Press **Ctrl+B** or **Hyper+A** (`Cmd+Option+Ctrl+Shift+A`), release, then **a**.
2. Press `j/k` repeatedly to focus the next/previous agent immediately, or
   the **number-row keys 1–9** to focus an agent by sidebar index. Number triggers
   match physical key positions rather than layout-produced characters. Ordinary
   terminals are skipped; numpad digits are not bound by this table.
3. Press **Esc** or **Enter** to exit the mode. These exit keys are not sent to
   the shell or agent. Any other unbound key exits the mode and is forwarded
   normally, so unexpected typing cannot remain trapped in the agent table.

This uses a persistent Ghostty key table, not Herdr's Go To picker. Native Herdr
actions perform selection; Ghostty sends explicit Kitty-encoded modified keys
because plain control bytes can be ambiguous. No scripts, fork, or server restart
are required. The mode is local to the Ghostty surface, not a native Herdr mode.

Both Ctrl+B and Hyper+A enter the same one-shot Ghostty prefix table. Agent-mode
entry sends explicit Kitty Escape (`ESC [ 27 u`) to leave Herdr prefix mode;
a bare Escape can merge with the next shortcut and lose the first digit.

Outside agent mode, Hyper+A followed by `h/j/k/l` still navigates panes and
`1–9` still selects tabs. `Ctrl+B`, then `g` retains the separate Go To picker.
Other terminals retain native `Ctrl+B` shortcuts but not Ghostty's persistent mode.

## Copy mode on Danish keyboards

Press **Ctrl+B**, release, then **Option+8** (`[` on Danish macOS layouts).
After the **COPY** indicator appears, use `h/j/k/l` to move, `v` to select,
`y` to copy, and `q` or Esc to leave. Hyper+A can replace Ctrl+B in Ghostty.

The explicit copy-mode bindings accept plain `[`, Alt+`[`, and Alt+8. Numbered
agent transport uses Ctrl+Alt+digits instead of Alt+digits to avoid stealing
Option+8. The visible agent-mode digit shortcuts remain unchanged. Deploy both
the Herdr and Ghostty source changes together, then reload both configurations.

An isolated terminal test confirmed Danish Alt+8 enters COPY mode and `v`/`y`
copies an exact sentinel; the prior clipboard was restored. Physical keyboard
acceptance in the current Ghostty client is a separate check.

## Configuration

`config.toml` and Ghostty's config are Nix-store-backed sources. A repository edit
does not update either deployed file. After an explicitly approved system rebuild:

1. Reload Ghostty configuration with **Cmd+Shift+,**.
2. In each attached Herdr client, press **Ctrl+B**, then **r**. This reloads client
   keybindings and the selected server config without restarting agent sessions.

Do not reload just one half: old Herdr bindings cannot interpret the new transport
chords, and old Ghostty config still sends `prefix+a` to the old Go To binding.

Verification: isolated Herdr tests exercised the complete prefix-entry, cancel,
and agent-digit transport with two reported agents and an ordinary terminal.
The bare-Escape sequence failed; explicit Kitty Escape passed. The direct numbered
Herdr action worked, but plain digits in Ghostty agent mode initially failed.
Ghostty's CLI parses the revised number-row triggers as physical `digit_1..9`.
After the approved 2026-10-16 rebuild and reload, Lucas confirmed that agent
numbering works in his current window. Earlier he confirmed copy mode and j/k.
This is user-reported keyboard acceptance, not automated physical-key testing;
all nine indices, fallback typing, and every pane/tab shortcut were not exhaustively
checked. No further GUI windows or synthetic live input are used for verification.

## Compact host metrics

The local plugin in `host-summary/` reports host CPU, RAM and free disk space,
plus battery percentage where available. It supports macOS and Linux using
system utilities and requires Bash, jq and Herdr 0.7.5+.

`config.toml` renders `$host_load` and `$host_storage` before workspace names.
Only the first workspace in each server's ordered list receives those tokens;
other workspaces have them cleared. This shows at most two summary rows per
expanded machine. The local Herdr 0.9.5 client is patched to anchor indentation
and worktree controls to the workspace-name row, not the first metric row.
This is workspace-backed, not a native machine-header widget: collapsing the
machine hides it, and an empty server has nowhere to display it.

The collector refreshes about every six seconds (one second sampling plus five
seconds sleep). Metadata expires after 20 seconds if publication stops. Workspace
reordering transfers ownership at the next refresh. CPU uses a short sample, not
Sysmon's since-boot average. macOS RAM is active+wired; Linux RAM is total minus
available. Neither is a macOS memory-pressure indicator. Disk reports available
GiB on the home filesystem; the compact `G` suffix denotes GiB.

Nerd Font glyphs replace labels: `` CPU, `` RAM, `` free disk, `` battery.
They are monochrome hardware glyphs from JetBrainsMono Nerd Font, not emoji.

Install from this checkout and start without restarting Herdr:

```sh
herdr plugin link ~/config/configs/herdr/host-summary
bash ~/config/configs/herdr/host-summary/summary.sh --spawn
```

If Herdr is not on PATH, set `HERDR_BIN_PATH` to its absolute executable path.
The plugin's startup hook starts its per-server poller on future server starts;
the workspace-focus hook also starts it if absent. State lives under
`~/.local/state/herdr/plugins/huginn.host-summary/`, with an atomic per-socket
lock directory recording PID, script root, socket and process start time. Both
`--spawn` and direct `--run` use the same lock; duplicate starts cannot publish.
`--stop` waits for the recorded collector to exit, and owner-only cleanup cannot
delete a successor's lock. Linking alone does not invoke startup hooks. Stop/start
the poller after script changes; copying files does not update an existing shell loop.

Deployed collectors: Local, Neo, Mini, VPS1, VPS2, Freyr, Mimer and Loki. Remote plugin
files live at `~/.local/share/herdr/plugins/huginn-host-summary/` and use
`HERDR_BIN_PATH=$HOME/.local/bin/herdr`. These are copied sources, not an automatic
sync: redeploy both plugin files and restart only their poller after updates.
The prior Sysmon plugin was removed/unlinked and its pollers stopped on Local,
Neo and Mini. No Herdr server or agent-session restarts were used. Loki's existing
Herdr 0.9.4 server and `home` workspace now publish RAM and free disk. Android
denies `/proc/stat`, so CPU explicitly displays `n/a`; the battery CLI timed out
and battery is omitted. Hermes configuration and gateway were not changed.
Loki's SSH later became reachable again. The singleton collector was deployed
there and current RAM/disk publication verified; CPU remains `n/a` on Android.

Verification: `bash tests/herdr-host-summary.sh` covers workspace ownership and
reordering, empty sessions, concurrent starts, bounded stop/restart, independent
sockets and unrelated-PID safety. Stale old/new pollers were replaced on Local
and all seven remote hosts. Three successive refreshes showed one stable collector
PID and the new icon set on each; all eight Herdr server PIDs remained unchanged.
Mimer and VPS2 now have a `shell` workspace. Their copied host configs selected
unavailable `zsh` on PATH; Mimer now uses its installed
`/home/ecoray-admin/.nix-profile/bin/zsh`, VPS2 `/usr/bin/bash`. Both server reloads
returned no diagnostics and actual shell workspace creation succeeded.
The patched release client is installed at `~/.local/libexec/herdr-patched`.
The macOS `herdr` function in live-linked `nix/common/shell/interactive.zsh` selects
it independently of Homebrew and keeps Zsh syntax highlighting correct. Run
**`omz reload`** in an existing shell, detach the old client, then run **`herdr`**.
`command herdr` bypasses the function and uses
Homebrew's stock version (currently 0.9.5). A previous Cellar overwrite was
replaced by Homebrew; do not use that as the patch installation method.
The sidebar diff is captured in [`client.patch`](client.patch), and Pi profile
discovery in [`pi-profile.patch`](pi-profile.patch), with exact upstream commit
and Zig archive/hash pins in [`client-build.env`](client-build.env).
The separate development checkouts are no longer required to reproduce the build.

```sh
bash ~/config/scripts/build-herdr-client.sh            # fetch pinned source, test, build
bash ~/config/scripts/build-herdr-client.sh --install  # also atomically install client
```

Build prerequisites: Apple Silicon macOS, Command Line Tools, Rust/Cargo, Git and
network access. The helper downloads checksum-verified Zig 0.16.0 into its cache;
it does not change system compilers. It builds from a fresh disposable source
directory at the exact pinned revision and applies both captured patches.
`--install` saves the previous client as `~/.local/libexec/herdr-patched.previous`.
Neither mode starts, stops or hands off a Herdr server. Detach/re-attach to load
the installed client. Server updates require separate explicit approval and
preservation checks; a binary install alone leaves the running server untouched.
The helper was exercised in build-only mode from a fresh pinned source checkout:
343 client-shell tests passed (2 ignored), release build completed, and the
resulting executable reported `herdr 0.9.5`. This does not promise byte-identical
binaries across Rust toolchains or source/build paths.

### Huginn Pi integration discovery

Herdr's settings API runs in the server process, which does not inherit the
profile override set inside Huginn's Pi launcher. The Pi-only status patch
respects a nonempty `PI_CODING_AGENT_DIR` first, then an installed stock hook in
`~/.pi/agent/extensions/`, then an existing hook in
`~/.local/share/huginn-pi/agent/extensions/`. An empty Huginn directory is not
reported as installed. Both settings recommendations and CLI status use this
same resolution.

Installation and uninstallation are deliberately unchanged: stock Pi still uses
`~/.pi/agent`, and Huginn's launcher explicitly supplies its private directory.
OMP keeps its own resolution. Never export `PI_CODING_AGENT_DIR` globally to fix
this indicator: Herdr's OMP integration also reads that variable.

Verification on 2026-10-25: the regression failed before the discovery change;
the fresh pinned build passed 190 integration tests and 343 client-shell tests
(2 ignored). The built CLI reported both Pi and OMP current without a profile
override. An isolated real server's `integration.list` settings API reported
both current, and real unwrapped Pi loaded an extension from the stock directory
after installation there. No provider request was needed.

Lucas approved local installation and one live server handoff on 2026-10-25.
The verified artifact (SHA-256
`706cdd8f95632973cd7b742231233cf08a624aad89cd826acc396d08b99e090e`)
was atomically installed at `~/.local/libexec/herdr-patched`, retaining
`herdr-patched.previous`. The handoff returned OK and moved from server PID 1783
to PID 9272; the live settings API reported Pi and OMP current.

**Preservation check failed; do not call this a clean handoff.** The immediate
post-handoff snapshot retained all 20 panes and their agent-session references,
and all 35 tracked shell/Pi/bridge processes initially survived, but every
internal terminal ID changed. A subsequent snapshot had only the 19 original
panes: extra workspace `wA`, tab `wA:t1`, and pane `wA:p1` were missing.
That pane had run `-zsh` in `~/Desktop/code/config` (shell PID 8370, terminal
`term_65eb0b57ca12325`); PID 8370 subsequently no longer existed. All seven
original Pi session references survived. The disappearance followed handoff;
whether handoff or a concurrent close caused it is unconfirmed.

Evidence: `~/.cache/huginn/herdr-client/pi-live-handoff.mhuq4f8q/` contains
before/after snapshots, process tables, integration replies and handoff response;
`/tmp/herdr-pi-current-snapshot.json` captured the later missing pane.
No second handoff, restart or rollback was attempted. Further lifecycle changes
require fresh approval; restoring the previous executable alone cannot recover
the exited shell. Reattaching a viewing client is not a server discovery fix.

Home Manager now declares the plugin files under
`~/.config/herdr/plugins/host-summary/` and links the plugin after file deployment.
That declaration awaits the next approved activation; it does not start/stop
pollers. Existing remote copies are managed with
`bash ~/config/scripts/setup-herdr-remote.sh` run on each host from its checkout,
or the published raw helper after publication. The helper preserves existing
settings, repairs an unresolved default shell, copies the plugin and links it;
it does not reload/restart servers or start pollers. `jq` must already be installed.
On Termux, an existing compatible Herdr build is required.

For the one-time transition from the currently linked checkout to Home Manager's
plugin path, stop the existing collector with its current script before that
approved activation, then start the newly linked script afterward. The singleton
owner records its script root; changing roots does not replace a running collector.
This capture task did not activate or migrate that plugin path.

The Linux Nix package source is pinned to official Herdr 0.9.5 for x86_64 and
aarch64. This is a source change, not evidence that any remote host was activated.

Saved machine connections and sessions are runtime state, not tracked profiles.
Recreate the accepted connections explicitly with `herdr machine add <ssh-alias>`
for `neo`, `mini`, `vps1`, `vps2`, `freyr`, `mimer` and `loki` once SSH works.
Private endpoints, SSH credentials, opaque profile IDs, session data, binaries,
build caches and collector locks must stay outside this repository.

The current release build uses checksum-verified Zig 0.16.0 and invocation-local
Apple Clang without changing system compilers. On v0.9.5, 343 client-shell tests
passed (2 ignored), including stats-first alignment and the full ANSI-to-libghostty
terminal-grid regression. Lucas accepted the previous patched layout visually;
the preserved patch is now based on the current stable release rather than 0.9.4.

With Lucas's approval on 2026-10-16, the local server was upgraded using its
advertised `server.live_handoff` API, specifying the installed patched executable,
expected version 0.9.5 and protocol 22. Post-handoff status reported 0.9.5; all
3 workspace IDs, 9 tab IDs, 19 pane IDs and 19 original pane child-process PIDs
were preserved. Host metrics continued publishing. No `server stop` was used.
Existing viewing clients keep their old executable until detached and reattached;
run `herdr` afterward to load 0.9.5. Remote servers were not upgraded in this step.

The earlier 0.9.5 update notice was legitimate because the server was 0.9.4.
The local server and installed patched client now report current stable 0.9.5.
Direct `herdr update` can overwrite the sidebar patch: port and rebuild the patch
against a new stable tag for future upgrades instead of hiding version notices.
