# Gimle bootstrap and unattended recovery

Gimle is an Apple Silicon Mac mini. Its local account is `gimle`, with home
`/Users/gimle`; do not substitute the MacBook account or home directory.
The profile is `darwinConfigurations.gimle`, built from the shared flake lock.

## Scope

Gimle shares the MacBook's Zsh/Starship, tmux, Vim theme, Git defaults, safe SSH
client defaults, CLI/development packages and Herdr configuration. It does not
inherit private Git signing keys, login credentials, `nix_secrets`, or the
MacBook's generated EcoRay SSH host include.

Lucas requested desktop application parity on 2026-10-25 after the initial
headless profile omitted GUI apps. Gimle now shares the Homebrew cask catalogue,
except BetterDisplay and DisplayLink (MacBook dock/display integrations). The
crmne tap supplies Spotifast. Desktop appearance hooks and AeroSpace/borders
were added by the later desktop-parity activation. The MacBook readable-vault
mount, OMP profile delivery and Tailwind cleanup remain excluded. Pi's pinned
Volundr submodule was initialized separately; this is not account/sign-in parity.
Only Bun, Container and Herdr are Homebrew formulae. Vim uses terminal Vim;
the locked GTK-enabled `vim-full` fails to compile with missing `gui.scale`
members. The MacBook's cask order, formulae, taps and Vim choice are unchanged.
Resolve/CorridorKey installation remains MacBook-only.

Gimle retains Python with pip, virtualenv, NumPy and Pillow but excludes
JupyterLab. The locked notebook dependency tree failed native builds in
`trio-websocket` and `backrefs` timeout tests; no upstream tests are disabled.
The MacBook retains JupyterLab and its original Python package order.

Gimle's host now sets `lokiProduction = true` after the approved cutover on
2026-10-25. The shared module still defaults off for other hosts.
`services.gimle.production` explicitly enables five
system LaunchDaemons running as `gimle`: gateway, vault, Ask Loki, browser and Hue.
Their Nix-pinned Python runner checks the encrypted mount and root-owned enable
gate. Gateway startup additionally requires a final-snapshot and stopped-phone
receipt; it never uses `--replace`. Failed starts retry with a 30-second throttle.
Successful exits stay stopped. Private configuration and runtime live inside
the encrypted volume; no secrets or migration state belong in the repository.

## Boot-chain source — 2026-10-25

`nix/darwin/gimle.nix` is host-scoped: automatic restart after power failure,
no system sleep, and `dk.loki.volume` at boot. macOS changes from
`autorestartatconnect` to `autorestart` when applying restart-after-failure.
Failed unlocks retry with a 30-second throttle; successful unlocks exit without
polling. The mount helper checks the exact image, owner and permissions and
passes the key through stdin.

Encrypted storage: `/Library/Application Support/Loki/LokiData.sparsebundle`,
root-only `volume.key` beside it, mounted at `/Users/gimle/loki-data`. Lucas
approved unattended on-host key storage. This protects the image separately,
not against a disk-level attacker who can obtain both image and key. Secrets
and health data must never enter Git. A reboot/power test is still required.

`services.gimle.tailscaleAtBoot` defaults to false; the Gimle host explicitly
enables it after the approved GUI-to-daemon handoff on 2026-10-25. The daemon
enrolled with a new node identity; both tailnet SSH and LAN fallback passed.
The GUI node stays disconnected. Do not reuse or copy its private node state.
Service ordering uses readiness checks, not LaunchDaemon labels.

`configs/loki/mcp-requirements.txt` pins the additional browser MCP dependency
from the phone's lockfile. Install it with hash checking into the private
`live/service-vendor` directory, not Hermes' managed dependency environment.
Ask Loki recovery delegates to launchd; do not run the Android stack launcher
on macOS. Keep copied cron jobs disabled until each job's paths and external
dependencies have been validated.

Clean committed repositories can be pulled; dirty patches, SQLite backups,
credentials, sessions and untracked vault content require separate verified
migration. Preserve phone originals until the cutover/rollback window closes.

## Current acceptance ledger — 2026-10-25

These are dated checks, not unattended-recovery acceptance. Historical bootstrap
instructions below do not describe the current installed state.

| Boundary | Evidence / remaining work |
| --- | --- |
| Config source | Backup/SSH-gate changes published as `3e8ba72e`; SSH/starship owner subsequently published `4637dde2`. Source publication is not broad system activation; preserve concurrent owner edits. |
| Vault | Encrypted volume mounted; Muninn reports healthy with vault `/Users/gimle/loki-data/loki-memory`. |
| Gateway | Reports Telegram and API connected. This is not a new Telegram round-trip or existing-session acceptance. |
| Boot policy | `pmset` reports `sleep 0`, `autorestart 1`; FileVault reports Off. No reboot or power-loss test performed. |
| Tailscale | Boot socket `/var/run/gimle-tailscaled.socket`; GUI socket is not authoritative. Approved DNS integration repair enabled `CorpDNS`; normal Pi model/MCP calls subsequently passed. Other sessions own exit-node work; do not overwrite their preferences. |
| Pi | Native launch regression tests passed; normal Gimle launch returned the exact diagnostic marker; Muninn and company library connected. Gimle Vercel/Supabase still require sign-in. |
| MacBook consumers | Two Muninn client URLs changed to Gimle with private backups and unchanged auth. Normal MacBook MCP list connected all four configured servers. Lucas separately approved retaining the matching canonical private URL, with no token changes or activation. |
| Hue | Real read-only room-list call succeeded. No lighting changes were made. |
| Browser | Legacy port-8767 browser MCP is unhealthy and still expects Freyr CDP. The separate restricted `loki_browser` uses dedicated Gimle Chrome; its owner reported live same-tab cPanel handoff and native-click acceptance. Public Hbit isolation remains blocked and its source is active WIP. Do not repurpose the legacy MCP or disturb Freyr's active tunnel. |
| SSH aliases | Added host variables were rolled back. Gimle's shared-host include/activation gate was restored in published `3e8ba72e`. Separate owner published/verified the MacBook's Gimle shortcut as `4637dde2`; resolve effective config rather than assume the historical `loki` alias follows the agent. No private SSH/GPG keys copied. |
| Accounts | Later GitHub-auth owner verified fresh env-unset `gh` API and ordinary private HTTPS Git using the existing managed gh helper after Lucas's approval. No usable Keychain copy was verified. Gimle Vercel/Supabase consent and other app sign-ins remain open. |
| Zen | Nine user extensions registered and active in Gimle's main profile; Zotero Connector is the one missing laptop extension. Shared extension IDs/active states match; public-container metadata and bounded layout preferences do not. Additional laptop profiles have no name match. No workspace parity claimed; no cookie/password/session stores inspected or copied. |

### Copied cron jobs: static preflight only

Private per-job report on Gimle:
`/Users/gimle/gimle-setup/cron-static-preflight-20261025.json` (`0600`).
At this static audit, all 45 entries were disabled. The jobs file was verified
byte-for-byte unchanged during that inspection. Scripts were parsed, not imported
or executed; no delivery occurred. This is historical, not the latest scheduler
state: the 2026-10-25 18:33–18:34 UTC reads found 43 jobs, with EOD nudge,
Morning check and Mail & Slack
check enabled by an unknown writer. This backup session did not change those jobs
and does not claim their qualification or approval. The old Hermes backup remains
disabled; do not enable a duplicate publisher.

| Classification | Jobs |
| --- | ---: |
| Legacy-path review required | 13 |
| Paused: retain disabled | 11 |
| Behavioral qualification required, no static path flag found | 7 |
| Old lifecycle watchdogs: retain disabled under launchd ownership | 3 |
| One-shot date review required | 3 |
| Completed: retain disabled | 8 |

A legacy literal can be in an unused branch or portable fallback; its presence
is a review flag, not proof of failure. Conversely, no path flag is not a pass.
Before enabling a job, inspect reachable paths, local helper dependencies,
credential consumers, intended delivery and duplicate producers. Exercise a
documented no-delivery/dry-run path where available; never assume `--help` or
an arbitrary script import is side-effect free. Backups need a restore check,
not just an upload or archive-exists check. Do not revive completed one-shots,
paused jobs or Android watchdogs merely because their Python parses.

### Controlled recovery acceptance — prepared, not executed

1. Coordinate with sessions using Gimle's browser, network and containers.
   Obtain explicit reboot approval, physical-console availability and a verified
   current LAN address; DHCP addresses in older receipts are not stable.
2. Record source versus deployed Nix generation, boot-daemon preferences,
   encrypted-volume mount, gateway PID and MCP health. Verify a fresh consistent
   backup and the stopped-phone/final-snapshot receipts before disruption.
3. Approve and perform one normal restart. Do not log into the GUI. From another
   machine, verify tailnet SSH, encrypted mount, all expected launchd jobs, vault
   health/read, Hue read, normal Pi inference and a real Loki Telegram response.
   Do not start a phone poller if Gimle's state is uncertain.
4. Separately approve a power-restoration test with physical supervision and a
   current backup. Establish safe shutdown/power removal procedure with Lucas;
   do not pull power from a live writable volume as an improvised test.
5. After power is restored, repeat the full no-login checks. A normal restart
   pass does not establish power-restoration recovery or delayed-router recovery.
6. Record timestamps and each boundary independently. If it fails, inspect
   state over the LAN or physical console; do not silently restart services,
   change node identity, or enable competing pollers.

### Bounded behavioral check: dream staleness monitor

The reviewed `dream_staleness_check.py` was exercised with missing, fresh and
stale temporary artifacts; all three logic fixtures passed. A captured-output,
no-delivery invocation then found its configured `~/loki-memory/dreams` absent,
while the encrypted vault's `dreams` directory exists. **Production-path check
failed; this job is not qualified and remains disabled.** No script was edited.
The private `0600` receipt is
`/Users/gimle/gimle-setup/dream-staleness-qualification-20261025.json`.
Do not substitute fixture results for a production-path pass.

### Interactive steps still required

- GitHub CLI: later owner acceptance passed using the explicitly approved existing
  token and managed gh credential helper. Do not repeat login merely because an
  older receipt says unauthenticated, or copy another machine's sessions/keys.
- Gimle Pi: after sourcing its existing private environment, use the managed
  launcher to run `pi mcp login vercel` and `pi mcp login supabase`. Lucas handles
  consent. Verify with `pi mcp list --json`; an OAuth file's presence alone does
  not establish valid sign-in. The CLI intentionally returns 1 for any enabled
  server whose state is not `connected`, including `needs-auth`, or config errors.
- Zen: use supported UI/Sync selectively, with fresh website logins. Do not copy
  session stores as a shortcut to workspace parity. Complete profile mapping,
  Zotero Connector, container metadata and layout verification in the actual UI.
- The old Hermes backup entry remains disabled. Three other jobs were later
  observed enabled; see the dated static-preflight comparison above. Native backup scheduling
  and acceptance below are independent from these copied jobs.

### TTS persistence and independent browser handoff

`services.gimle.auxiliary` independently gates `dk.loki.tts-tunnel` (9500).
`services.gimle.legacyHeadless` defaults off: legacy Chrome 9377 is not installed
while the browser owner reconciles its bridge with dedicated Chrome 9444.
Neither browser/profile/tunnel is changed by this handoff. Auxiliary services use
the mount-checked runner, root-managed store-backed `/etc/loki/auxiliary-enabled`
and throttled launchd restarts. TTS transport metadata is private `0600` encrypted
`live/tts-transport.json`, derived from the approved existing tunnel, not Git.

`scripts/gimle-auxiliary-activate` performs only the approved TTS process handoff,
one evaluated plist install (`root:wheel 0644`), runner/gate adoption and vault-only
restart. It verifies the exact existing9500 listener and free port before loading;
it neither reinstalls backup nor runs a full activation. An explicitly approved
root import accepts locally built artifacts only after every transferred cache
file hash matches; no global Nix trust changes occur. Private rollback restores
the previous runner and removes TTS launchd, without silently reviving legacy
processes. The next approved full activation adopts the source definitions.
The vault runner pins native managed Node before dotenv loading, avoiding a
cached Android Node path in the serving process.

Acceptance: the first operator-run activation FAILED. Its private umask produced
root-only managed symlinks, preventing TTS from resolving its enable gate; no9500
listener remained. After lockfile-pinned QuickJS dependencies were restored without
install scripts, `read_code` still failed in its isolated Python worker. Lucas ran
the validated rollback: TTS job/gate removed, previous vault runner restored, vault
running again. The approved legacy TTS tunnel was subsequently restored and real
speech generation produced valid 24-kHz mono WAV; it is not yet reboot-persistent.
Neither browser nor backup was changed.
Source now uses readable managed-link permissions with a failing-before/passing-after
regression test; 9 runner and 3 activation checks pass. No Python interpreter change
is staged. The consumed rollout remains reverted; do not rerun the old handoff
(its stopped PID precondition and saved recovery record intentionally reject retry).
The final worker repair is separately operator-approved: `readcode/worker-vendor`
contains only the 11 exact versions in `configs/loki/readcode/worker-packages.json`,
copied with distribution RECORD verification into private encrypted storage.
`upstream_worker.py` adds this one fixed directory only for `MuninnLocal`;
`server_transports.py` is the preserved original. No parent sys.path scanning,
Hermes venv inheritance, interpreter change, guest permission expansion or restart.
Scratch `python -I` tests reproduce failure before the fix and pass afterward;
normal MCP list/read PASS and write DENIED after live deployment. Vault PID39031
was unchanged. Company workers do not receive the vault vendor directory.
TTS launchd remains disabled; legacy TTS43544 works but persistence handoff is open.
The first pinned adoption helper also FAILED full acceptance: delaying its profile
commit until after activation let `org.nixos.activate-system` (RunAtLoad) read the
pending vxp7 profile and overwrite `/etc/static` with that generation's aux-enabled
tree. Although running/profile later matched afawa and protected PIDs stayed stable,
managed `/etc` did not. `scripts/gimle-adoption-activate --apply` is now permanently
retired; do not rerun old copies. Read-only checks require static/running consistency.
The separately approved/reviewed `scripts/gimle-etc-repair` corrects only the exact
static link and removes the stale auxiliary symlink, preserving/rolling back those
two links without activation, profile writes or restarts. Its operator sudo step
was pending at the last verified check. Future switches must set the profile before
activation (standard nix-darwin ordering) and verify static/profile/running agreement.
`scripts/gimle-tts-activate` is a subsequent, separately reviewed/operator-run handoff;
it refuses until that repair completes. Neither browser is included.
Reboot/calendar acceptance remains independent and unproven.


### Native encrypted Muninn publication

Lucas explicitly approved Gimle as publisher, the existing Salt identity's direct
verified-SSH transfer into `0600` encrypted-volume storage, a new repository-only
GitHub deploy key, and the daily 01:07 Copenhagen backup after acceptance. The
recovery passphrase was not copied; retained phone and MacBook copies remain.
Native Salt 0.4.0 is declared in Gimle's Homebrew source. Its identity/signing/trust
store and plaintext change-detection cache are confined to the encrypted volume.

The first native run restored and hash-compared **5,165 files**, then published
ciphertext commit `6e6a95ca47356aa9284774eedbf3f646829123c9`. Receipt timestamp:
`2026-10-25T17:59:40Z`; `restore_verified` and `remote_verified` true; no history
pruning. Included Volundr snapshot: `de0f771`, 1,738 worktree files. This is an
earlier snapshot, not proof later AAR/config edits have been backed up.

Canonical publisher: `configs/loki/backup_obsidian.py`; native unit regressions
cover snapshot consistency, SQLite backup, symlink refusal, Volundr dirty-worktree
coverage, bounded retries and ciphertext-only paths. Private runtime receipt:
`~/loki-data/backup/muninn-salt-receipt.json`; log: `muninn-salt.log` in the same
directory. Read both and compare freshly fetched remote SHA before claiming a
new publication. Salt's plaintext cache must resolve to `~/loki-data/backup/cache`.

The dedicated Nix-declared job `dk.loki.muninn-backup` runs as `gimle`, daily at
01:07 host Copenhagen time, with `RunAtLoad = false`, no restart loop, private
logs and an overlap lock. Lucas approved this scheduler separately because the
old Hermes script timeout is unsuitable. Installation and an explicitly approved
launchctl kickstart test passed: exact evaluated plist/script verified root-owned,
logs `0600`, `runs = 1`, `last exit code = 0`, no stderr. That run restored and
hash-compared 5,167 files and published `e637e5df7879583c6291140b5893733f84e00e91`
at `2026-10-25T18:33:33Z`; fresh local/remote/receipt equality was checked.

Final manual publication after the AAR/status updates:
`97c466e23296a6f6f62e9c5732d27a205c86b43f` at `18:37:57Z`, 5,167 files,
`restore_verified` and `remote_verified` true, no history pruning. It includes
actual live Volundr `de0f771` plus 1,738 worktree files, not a clean rollout of
published `332718e`. The live dirty skills are preserved, not overwritten.

A later publication check found literal backup origin changed to HTTPS. The
publisher refused it; the exact approved scoped SSH URL was restored, then the
final manual publication passed. Cause/time/owner of drift remain unknown. Do
not change global gh protocol preferences or weaken the origin guard to hide it.

**Still untested:** the first clock-triggered 01:07 firing, unattended reboot,
power restoration and delayed-network recovery. A successful kickstart/manual
run does not establish these. Current notes were saved through preservation-
enabled MCP with prior-archive and read-back verification; later writes always
need their own backup, rather than claiming a snapshot contains its own receipt.

Credential rotation remains separate: `TYPESAFE_API_KEY` and `LOKI_START` appeared
in a tool response; rotate with Lucas's approval. `MUNINN_MCP_TOKEN` exposure was
alleged by advisory but not substantiated in the retained output reviewed here;
precautionary rotation must coordinate MacBook Pi/OMP, Gimle and Ratatosk rather
than breaking existing clients. No values belong in this document.

## Observed bootstrap state — 2026-10-24

Read over verified, key-authenticated SSH:

- macOS 26.6.2, model Mac16,11, 64 GiB memory.
- Account `gimle`; current local hostname is `Lucass-Mac-mini`.
- FileVault reports **Off**; no FileVault change was made by this setup.
- `sleep 0`, `autorestartatconnect 1`, `autorestart 0`.
- GUI Tailscale and its system extension are running; retain them until a
  coordinated daemon handoff is possible.
- No Nix, Homebrew, tmux or Command Line Tools found during bootstrap checks.
- Root installation is blocked on an interactive sudo password. A detached
  built-in `screen` session named `gimle-setup` is available.

These are dated observations, not proof of cold-boot recovery.

## Resume at the physical console

Use Gimle's Terminal. Passwords are typed only into trusted local prompts,
never supplied to an agent, command argument, log or chat.

```sh
screen -x gimle-setup
```

1. Install Command Line Tools and complete Apple's dialog:

   ```sh
   xcode-select --install
   xcode-select -p
   ```

2. Install Determinate Nix using its official installer, entering sudo locally.
   Keep `nix.enable = false`; Determinate owns the Nix installation.
   Obtain and review the current installer from
   <https://install.determinate.systems/nix> before executing it.

3. Install Homebrew using the official instructions at <https://brew.sh>.
   Do not run a root-owned Homebrew installation or copy the MacBook's prefix.

4. Clone the published configuration to `~/config` after Git is available:

   ```sh
   git clone https://github.com/lucasfth/config.git ~/config
   cd ~/config
   git log -1 --oneline
   ```

   If `~/config` already exists, inspect its remote and working-tree status
   before updating with `git pull --ff-only`; never overwrite local changes.
   Initialize required submodules from the published checkout; never transfer
   the MacBook's ignored secret files, node_modules or private keys wholesale.
   The earlier preview under `~/gimle-setup` was removed; it is not an
   installation source.

5. Build, inspect, then activate as distinct steps:

   ```sh
   . /nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh
   cd ~/config
   nix build .#darwinConfigurations.gimle.system
   less result/activate
   ```

   Review the generated Home Manager activation and Brewfile paths referenced
   in `result/activate`, including removal/replacement behaviour on first
   adoption. Obtain activation approval before using `darwin-rebuild switch`.
   Do not activate the MacBook from this setup checkout.

## Tailscale handoff: separate maintenance step

The GUI macOS apps do not run before login. Use a supported open-source
`tailscaled` system-daemon configuration, authenticate it and prove remote
access without a GUI session. Do not run competing Tailscale variants as a
casual test: they can interfere and the daemon may acquire a different node
identity/address. Prepare a tested LAN fallback or physical console first.
Never stop the only working connection while the operator is away.

FileVault preboot unlock prevents macOS daemons from starting after cold boot.
Its Off observation is not permission to change its policy later. No Recovery
mode, SIP reduction, automatic GUI login or unattended sudo grant is required.

## Acceptance before production cutover

- Confirm installed configuration and exact source revision.
- Confirm `tailscaled` is a loaded system daemon and SSH survives logout.
- With someone physically present, restart without logging into the desktop;
  verify Tailscale and SSH from another host.
- Back up state, approve a controlled power-restoration test, and verify
  power-on plus remote access with no keyboard intervention. A normal restart
  does not prove power-loss recovery; also test delayed router availability.
- Check case-sensitive-path requirements before copying Loki's data to APFS.
- Stop phone production polling and scheduled writers first, capture final
  consistent state including history, then enable Gimle production polling.
- Keep the phone intact for rollback. No phone wipe is part of bootstrap.

The canonical migration design remains in Muninn:
`tech/Loki-MacMini-Cutover-Plan-2026-10-22.md`. Bootstrap observations and source
validation do not establish that the migration has happened.
