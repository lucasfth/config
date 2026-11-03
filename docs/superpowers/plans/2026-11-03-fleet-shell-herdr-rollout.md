# Fleet shell and Herdr rollout

## Approved scope

Lucas approved rollout to the audited remote machines, excluding local Mac and Gimle, with the correction that current repository shell aliases/functions/shortcuts—not the old portable subset—are authoritative. No commit/push, unrelated gateway restart, credential copying, Pi installation on new hosts or stopped Herdr server startup. Sigyn remains shell-only. SEP/Windows are unavailable pending reachability.

## Architecture

Share shell-compatible commands between the Nix interactive profile and remote shells. Evaluate aliases.nix locally with Nix when assembling the deployment; ship its rendered shell content, current interactive Zsh and keybindings, plus referenced public application configs. Guard unavailable platform tools and preserve each host's existing Pi launcher/provider. Keep existing host startup and private settings backed up; never copy secrets or replace the full remote config checkout.

## Tasks and acceptance

1. Add regression coverage in tests/fleet-shell.py for current commands in both plain SSH and managed shells, existing Pi preservation, missing Pi exclusion and canonical source payload generation. Prove red, then share canonical commands and update scripts/deploy-shell.py. Run existing fleet-shell and rebuild tests.
2. Stage/apply first VPS2, then other reachable hosts, using private backups and per-host identity assertions. Preserve Nix-owned startup links rather than copying generated startup. Read back hashes; exercise plain interactive and managed shell aliases/keybindings. No input to existing panes.
3. Synchronize canonical Herdr settings with host-specific default shell and additional unrelated settings retained. Reload through supported API, not server restart. Compare pane IDs before/after and ensure stopped servers remain stopped. Preserve plugin setup.
4. Install version-matched Herdr Pi hooks in Mini stock and VPS1 /opt/pi-native/agent profiles. Add auto-install to existing launch path without provider changes. Prove reporting on an isolated no-model session, then preserve and move the exact idle VPS1 native session from tmux into a new Herdr pane. Verify native session reference and idle agent state; test working lifecycle using isolated unavailable-provider fixture if possible without touching user history.
5. Update /tmp/huginn-fleet-audit-20261103 acceptance matrix with applied, verified, held and failed fields. Report actual consumer proof separately from file installation and unreachable hosts.

## Rollback

Retain prior payload directories and private per-file backups. Restore only task-owned paths against matching current hashes. Preserve existing native sessions and original VPS1 tmux until successful Herdr resumption; never have two writers on the same native session. No broad process kills, system activation or service restart.

## Verified outcome — 2026-11-03

- Shell rollout verified on all ten reachable hosts in ordinary SSH and managed shells, including current OMZ alias semantics. Shared commands load from canonical Nix sources; Bash alias generation uses the pinned plugin. Freyr's generated startup symlink remains intact.
- Herdr config verified on nine hosts. Seven running servers reloaded without diagnostics and retained all original panes; actual new-pane alias checks passed on all seven. Ecoray3D/Plato remain stopped; Sigyn remains shell-only.
- Missing SSH connection definitions were added privately and resolved with ssh -G. No private keys copied; cross-host authentication was not exercised.
- Mini/VPS1 native TUI fixtures reported idle, blocked, working and settled states through their real Herdr servers, with isolated profiles and a loopback fake provider. Initial fixture failures (wrong Node, premature readiness, raw CLI output assumptions) were reconciled; task workspaces closed.
- VPS1 exact session moved to workspace w4 / pane w4:p1 (Pi · VPS1). Original Pi exited before resumption. Session checksum remained 07f94d7af57ff0affe83c244d06b684106bd9960f93e80f0baa1c48057566aea. Private preservation backup: /opt/pi-native/backups/herdr-move-20261103.
- Final receipts: /tmp/huginn-fleet-audit-20261103/acceptance-matrix.json. SEP and Windows timed out again and remain unchanged. No local signed-in Herdr UI proof; remote server state and actual terminal paths verified.
- Verification: 24 fleet-shell tests, 5 deployment contract tests, rebuild/platform wrapper checks and git diff --check passed. No commit/push, Nix activation, gateway restarts, model billing or new Pi installation. Concurrent Herdr/Pi UI work was preserved.
