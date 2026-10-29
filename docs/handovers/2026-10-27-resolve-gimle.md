# Handover — finish native Resolve rendering on Gimle

## Goal and current status

Lucas wants to edit in Resolve on his MacBook and use Gimle's stronger hardware through **native remote rendering**, with matching Resolve-related custom packages managed by this configuration. Native remote rendering offloads Deliver jobs, not interactive timeline/Fusion processing. No unrelated package sync was approved.

**Installation is complete; the end-to-end goal is not.** Do not report remote rendering as working until a MacBook-submitted job demonstrably executes on Gimle and its output is checked.

Last verified on 2026-10-27, immediately before this handoff:

- Gimle: Mac mini M4 Pro, 64 GB RAM; MacBook: M3 Pro, 18 GB RAM.
- Resolve Studio **21.1.1** installed on Gimle, receipt `com.blackmagic-design.Manifest`.
- Rosetta installed; `/usr/bin/arch -x86_64 /usr/bin/true` passed.
- Gyroflow OFX and custom CorridorKey OFX installed. Their executable SHA-256 values match the MacBook byte-for-byte:
  - CorridorKey2.ofx: `26cfef8485128ab63014571d7fe0bca5f7bc1d681b620874bc18504372b8d1b7`
  - Gyroflow.ofx: `b3aa007c622fd2b7b2aba766657dc3a292cc22dc7a21da1de017650df932b680`
- CorridorKey Fusion/script integration and runtime setup/model manifest are Home Manager linked.
- Gimle CorridorKey runtime **not provisioned**: no `~/Library/Application Support/CorridorKey-Resolve/ready.json`.
- No project library server listener was found on TCP 5432.
- Studio licence entry/app launch, plugin UI discovery, real runtime inference and remote render have **not** been verified.
- `dk.loki.gateway`, `dk.loki.browser`, `dk.loki.vault` were running after activation.

## Source ownership — critical

Main repository: `/Users/lucasfreytorreshanson/Desktop/code/config` (`~/config`).

Uncommitted implementation is on branch **`feat/resolve-gimle`** in:

```
/Users/lucasfreytorreshanson/Desktop/code/config/.worktrees/resolve-gimle
```

Modified tracked files there:

- `configs/davinci-resolve/README.md`
- `nix/darwin.nix`
- `nix/darwin/davinci-resolve.nix`
- `scripts/setup-corridorkey-resolve`
- `tests/README.md`

Untracked implementation/docs:

- `configs/davinci-resolve/remote-rendering.md`
- `docs/superpowers/plans/2026-10-27-resolve-gimle.md`
- `tests/corridorkey-runtime-setup.py`
- `tests/resolve-hosts.py`
- `result-resolve-gimle` (build output link, not source; do not commit)

Nothing was committed, pushed or merged. This handoff is a separate new file in the main checkout. Preserve others' changes and inspect current worktree status before editing.

Gimle's `~/config` was at `a6ac3c15` with many unrelated modified/untracked files. It was **not changed or deployed**. **Do not run `nrs` or rebuild/switch from that checkout.** It does not contain the deployed Resolve setup; a future activation could lose its managed integration and deploy other actors' changes.

## Exact deployment and approval record

The initial feature-branch build had unrelated Homebrew drift (adding ente-auth, removing cmux/typewhisper). It was NOT deployed.

Lucas explicitly selected **the exact running source plus Resolve-only overlays** instead. A staging snapshot was built from Gimle's deployed source, not represented as a matching Git commit:

- Baseline source: `/nix/store/qbidd7dib46qdy9cdqc468a9i853gy6i-source`
- Baseline NAR hash: `sha256-2FPPDfgwhy9FDAl9kkb9jPeEkztTBplFCSCtEbgVCs0=`
- Local ignored staging directory: `.worktrees/resolve-gimle-deploy.RRRSYt`
- Staging path pointer: `/tmp/resolve-gimle-deploy-path`
- Staging NAR hash: `sha256-0DeuwdP2giPC1CFDK1rTghXB7oWqvl3Wzo6/Mmkwwls=`
- Explicit manifest: 28 byte/mode-verified Resolve overlays plus the host gate edit; 16 actual changed/new files versus baseline.
- Baseline generation: `/nix/store/fp3xdllsqn8fv09wxif7b861yfmzggfd-darwin-system-26.11.57abbd5`
- **Successfully deployed generation**: `/nix/store/1nlrwaisl9b9vp2vxl0z2x4h8kkb3vpy-darwin-system-26.11.57abbd5`
- Both `/run/current-system` and `/nix/var/nix/profiles/system/systemConfig` now point to that deployed candidate.

Review established identical Brewfile, nine identical system daemon plists, identical empty managed Applications trees, five Resolve Home Manager additions, and 18 source-path-only home-file changes with byte-equivalent contents and no removals. System package changes added the CorridorKey setup helper. Existing activation hooks still ran, including Mokka generation; source equivalence is not an assertion that activation has zero side effects.

Lucas separately approved the candidate switch, spare Studio activation availability, transfer, one-time privileged import without global trust changes, and subsequently Rosetta installation/retry. He personally authenticated sudo and handled Apple's licence prompt. These are receipts for completed operations, not blanket authorization for future services, rebuilds, licence agreements or publication.

Transfer initially failed Nix signature checks on locally built CorridorKey. A reviewed one-time root `nix-store --import` resolved this without modifying global trusted keys/settings. Complete 10 GB archive hash:

```
ac10d1bde132047ef30bb4d8f3e5ff24e2baf7eab717efc7ffe867c1c5724849
```

First switch failed at Studio due to missing Rosetta, temporarily leaving profile/candidate and running/baseline mismatched. **This was resolved**: Rosetta installed, then `darwin-rebuild activate --no-flake` completed using the exact selector, not a checkout. Final interactive session `gimle-rosetta-resolve-retry` exited 0 with `ROSETTA_AND_REVIEWED_ACTIVATION_COMPLETE`.

Do NOT rerun the initial import/switch script: its baseline and absent-file collision checks are now intentionally obsolete. The Rosetta retry script also expects the old partial state; do not rerun it blindly.

## Evidence locations

Local review artifacts (temporary; not durable across cleanup):

```
/tmp/resolve-gimle-review.BT7voT/
```

Key files: `reviewed-candidate.md`, `baseline-review.md`, `overlay-manifest.json`, `overlay-paths.json`, `source.diff`, `activate.diff`, `Brewfile.diff`, `home-activation.diff`, `home-files-diff.json`, `etc-diff.json`, `exact-candidate.nix`, `import-paths.txt`, `import.sha256`, `import-and-switch.sh`, `rosetta-and-retry.sh`, `approved-import.nar`, and `result`.

Remote staging:

```
/Users/gimle/.local/state/resolve-gimle-deploy/
```

The imported archive and scripts remain there. Leave cleanup until Lucas approves/they are no longer needed. Global Nix trust settings were unchanged. Installer backups exist under `/Library/OFX/Plugins/.gyroflow-backup.FTQIDI` and `.corridorkey2-backup.n4cv9f3m`; preserve them.

**Historical notes are stale:** `reviewed-candidate.md` and the runbook's original source/build receipt describe the earlier pre-activation state. This handoff records subsequent successful deployment. Recheck the host for current state rather than assuming either receipt is live proof.

## Implementation details and tests

Read the feature worktree's `configs/davinci-resolve/README.md`, `configs/davinci-resolve/remote-rendering.md` and `docs/superpowers/plans/2026-10-27-resolve-gimle.md` first.

- Shared `programs.resolveStudio` gate now includes MacBook and Gimle.
- Studio uses `requireFile`, not an automatic unrestricted download:
  - Name `DaVinci-Resolve-Studio-21.1.1.pkg`
  - SHA-256 SRI `sha256-WK7esoMidMzUCb8ceFHwkoUbhLDjFrDHGPymJnpSkt4=`
  - Store `/nix/store/kf46bh43ls2dh2pfynpha34jhwaxfq87-DaVinci-Resolve-Studio-21.1.1.pkg` (now imported on Gimle).
- Gyroflow OFX pinned at 2.1.1.
- Managed `setup-corridorkey-resolve` command provisions pinned Python/dependencies/source/model manifest, requiring explicit model-licence acceptance. Do not copy a MacBook virtualenv or activation state.
- Setup was fixed to coexist with Home Manager's managed-directory symlinks; refuse ready.json/venv/models/unknown runtime data; use setup lock and clean up only this invocation's additions. Preserve working runtimes.
- Installers defer while Resolve is open. Do not treat an activation success with deferrals as proof of version parity.
- Rosetta prerequisite was installed manually with approval; **not yet represented as a managed prerequisite/source instruction**. Account for this in reproducibility docs or a narrow config fix; don't silently enable broad x86 emulation packages/settings.

39 focused checks passed, and Gimle-only candidate builds succeeded. To rerun source checks inside the feature worktree:

```sh
set -e
for test in resolve-hosts resolve-activation resolve-studio gyroflow-install \
  corridorkey-ofx-install corridorkey-runtime-setup corridorkey-single-setup \
  corridorkey-matte-menu; do
  python3 "tests/$test.py"
done
git diff --check
```

Unit/mock checks do not prove licensed runtime correctness, GUI operation or remote rendering.

## Next session: finish in order

1. **Re-establish state, preserve concurrent work.** Read repository/skill instructions, inspect both worktrees and Gimle's live/profile generation. No bare nrs. Agree the source integration strategy before reconciling the deployed snapshot with Git. Do not commit a reconstructed snapshot or overwrite Gimle's edits. Publication/integration needing commits remains Lucas-approved only.
2. **Studio activation and GUI proof.** Lucas privately enters his key on Gimle. Never request the key in chat, read/copy activation files, or put it in Nix/Git/commands. No app launch/activation was performed as proof yet. Use only permitted Gimle UI capabilities; don't start/reconnect browser infrastructure without current approval. A first-run challenge/login is Lucas-handled.
3. **CorridorKey runtime.** Confirm explicit Corridor Key Licence 2.0 weight acceptance before running the managed setup as user `gimle`, not root. Inspect `--help`, current runtime contents and readiness first. Validate pinned model/source hashes and real imports/inference using disposable fixtures. Existing MacBook runtime remains untouched.
4. **Project library server.** Pin/review Blackmagic's supported Project Server installer and qualified PostgreSQL version. It is NOT provided by current Resolve module. Confirm TCP ownership, private LAN/tailnet scope, credentials and backups before an approved provision/start. Don't repurpose MacBook's development Postgres or create public/trust-auth access. Same-subnet discovery may not work over Tailscale; prove the actual route. Start with a new disposable library; no production-library migration.
5. **Media/output path design with Lucas.** Agree a narrowly scoped shared volume or supported mapped mounts. Include footage/audio, .gyroflow sidecars, LUTs/fonts/referenced assets. Cache stays machine-local. New SMB/filesharing/network exposure needs current approval. Never share the home/vault/database directory or move real footage just to pass a test.
6. **Native remote mode + consumer proof.** Put Gimle's Studio in Workspace → Remote Rendering in a logged-in graphical session. From MacBook Deliver, select Gimle and submit a disposable synthetic timeline from the shared library. Verify remote execution and inspect output. Repeat with CorridorKey alpha/colour checks and representative gyro-data footage; registration alone does not prove stabilization.
7. **Durable config integration.** Reconcile only the Resolve source changes into the chosen configuration base, preserve others' edits, update deployment receipts/runbook and record Rosetta prerequisite. Build/review the resulting candidate against current live before any separately approved activation. Do not claim future nrs parity while the source remains only on this feature branch.

Finish line: Gimle can render a MacBook-submitted job with matching plugins/runtime, checked output, documented library/media arrangement, and a configuration source that preserves this on future approved rebuilds. Until then state exactly which layers are complete.

## Session close boundaries

Lucas requested `/done` and a handoff, not an AAR. No vault note, commit, push, service restart or further installation is implied. This handoff is the durable continuation pointer; start the next session by reading it.
