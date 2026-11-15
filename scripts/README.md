# Repository Scripts

This directory contains repository maintenance and configuration helpers. Most
are invoked directly or through Home Manager-installed commands; these paths do
not all share the same deployment or activation behavior.

- `config-add` edits the appropriate Nix package, Homebrew, or shell alias source.
- `pi-native` runs the canonical `configs/pi/` profile. The reloadable shell aliases plain `pi` to this launcher; `pi update` uses a private npm cache and verifies the pinned profile, without changing global Homebrew Pi.
- `gimle-browser status|start|stop` manages only Huginn's dedicated Chrome profile
  on Gimle and loopback CDP tunnel `127.0.0.1:9444`, with strict SSH host verification.
  `status` is diagnostic; `start`/`stop` require explicit approval. No software install,
  ordinary personal-profile access, VNC or Freyr fallback. See the
  [Pi browser boundaries](../configs/pi/README.md#integration-boundaries) for source
  checks and separately recorded live acceptance.
- `gimle-boot-recover` and `gimle-next-boot-install PAYLOAD` inspect scoped Loki
  next-boot plist repairs. Both default to dry-run; `--apply` needs separately
  approved root access on Gimle and preserves rollback copies. Neither invokes
  launchctl or restarts live jobs. The latter accepts the reviewed v0.22.6 gateway
  payload only; it is not a general runtime-upgrade installer.
- `gimle-login-start`, `loki-dashboard-run` and `loki-service-run` are Nix-managed
  launchd entrypoints, not manual startup commands. Source publication does not
  activate them. Login startup's screen-saver request is not proof of a locked
  session; approved boot and client acceptance remain separate.
- `nix-health [--check|--notify]` checks the local Nix installation. See
  [`docs/nix-recovery.md`](../docs/nix-recovery.md) for recovery instructions.
- `muninn-refresh.py` safely refreshes the local readable Muninn snapshot; the
  installed `muninn-refresh` command is provided after Home Manager activation.
- `apply-syntax-highlight-config.py` applies the tracked settings and themes to
  the app's local preferences; the root README documents the required app state
  and exact invocation.
- `apply-spotifast-config.py` restores the tracked native light/dark theme pair
  and copies palettes while Spotifast is closed, preserving private app state.
  Installed as `apply-spotifast-config` by Home Manager; see the root README.
- `install-gyroflow-dmg` verifies/mounts the pinned DMG and calls
  `install-gyroflow-ofx` for a signature-preserving, guarded copy. Nix-darwin
  invokes these on activation. `install-resolve-studio` validates a supplied
  Studio PKG; only `--install` runs Apple's installer. See the
  [Resolve guide](../configs/davinci-resolve/README.md) before running them.
- `install-asciify-ofx install|status|uninstall` manages only the pinned signed
  user Asciify bundle; `--archive` permits offline installation. `resolve-user-ofx`
  is an opt-in fresh-launch wrapper preserving existing and system OFX paths.
  Neither command is run on activation. See the [Resolve guide](../configs/davinci-resolve/README.md#asciify-ofx--opt-in-user-install).
- `setup-corridorkey-resolve --accept-model-license` creates the separate pinned
  Apple Silicon inference runtime. It refuses to overwrite an existing runtime;
  it does not deploy the menu or implicitly accept the licence on rebuild.
- `sigyn-screen` and `sigyn-vnc` open the corresponding iPad remote sessions.
- `sigyn-chat [--json]` accepts a short UTF-8 prompt on stdin and runs the experimental
  Bonsai 2B uncensored adapter on Sigyn, on demand. From Gimle it uses `ssh sigyn`;
  from the MacBook it uses the existing `ssh gimle` route. Keys/known hosts must
  already be provisioned; host verification is mandatory. No listener or agent
  plugin is installed and neither agent's default provider changes.
  Example: `printf '%s' 'Reply with exactly READY.' | sigyn-chat`.
  Use `--json` for the validated transport envelope and timings, not a promise of
  structured model text. Output is untrusted: never execute it or use it for
  important decisions. Prompts are limited to 2048 bytes / 448 template-inclusive
  tokens; replies to 64 tokens. Leaked thinking/control tags, truncated replies
  and invalid backend envelopes fail closed, without stripping or retries.
  One device-wide lock serializes requests; busy/offline/guard errors remain errors.
  Requires the separately deployed `/var/mobile/smolmaxxing-trial/infer-guard.sh`,
  runtime, model and adapter; this CLI does not provision or modify those files.
  The guard uses sampled 128 MiB available / 700 MiB RSS / 120-second limits, not a
  hard kernel cap. Screen-off behavior and broad answer quality are unqualified.
  Home Manager declares `~/.local/bin/sigyn-chat` on the MacBook and Gimle; the
  declaration does not imply installation. Its normal activation covers the entire
  selected home generation, not one command. Do not manually link the evaluated
  wrapper as a substitute for Home Manager activation. Inspect the full generation
  delta and obtain approval for affected changes before activating; `nrs` also has
  unrelated system/Homebrew effects. Rollback must use a reviewed Home Manager
  generation change rather than replacing an individual managed link. Model files
  and SSH are outside this mapping. Do not run prompts containing
  secrets; while the helper does not log prompts, the calling agent can retain its
  tool inputs/outputs in conversation history. No public endpoint is provided.
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
- [`mokka/`](mokka/README.md) generates four dithered wallpaper styles, time-based
  Catppuccin HEICs and matching portrait dark/light PNGs; includes local tests.

See the [test guide](../tests/README.md) for the tracked test inventory and invocation style.
