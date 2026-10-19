# Nightly shared skills and dreaming

Lucas approved automatic nightly adoption of config's published Volundr pin, isolated conflict handling, and proposal-only dream consolidation. No service restart or Hermes source upgrade.

## Implementation

1. Add a tested Volundr sync CLI. Authenticate deliveries through the controller's existing SSH channel; ship only the remote-published config pin, bundle checksum, and config revision. No bundle means a recorded skip. Use a single flock, bounded Git commands, backup/rollback receipts, canonical selection and Hermes runtime probes before/after activation. Never reset or force-push.
2. Preserve dirty/local-only history in isolated candidate branches. Rebase local-only commits onto the pinned revision in the candidate (never merge the base into local history); preserve uncommitted bytes privately. Conflicts remain an explicit pending candidate. A bounded reasoning job may propose edits there, but cannot change the live library or publish. Local work prevents automatic activation until reviewed.
3. Approved rollout: controller checks :01/:31 while awake, gated daily after 02:31 Europe/Copenhagen; Loki consumes at 02:53. Existing dreaming stays at 03:07. Tool-free proposal companion at 03:43. No controller wake assumed.
4. Back up dreams/, .dream_state.json, dreaming script and job definitions. Disable legacy hardener auto-application. Add a deterministic consolidation evidence report consumed by the proposal companion and referenced by the dream report. No real dream run for tests. Preserve source notices and supporting references; Jev optional, not a permission or correctness gate.
5. Test fixture repositories: clean fast-forward/no-op, missing bundle, bad hash, rejected rewind, local edits, divergent commits, conflicts, failed validation and rollback. Test dream patch on an AST-loaded fixture with vault/network writes forbidden. Run actual scheduled script entrypoints in cron-like environment before enabling jobs. Verify job schedules, delivery and source receipts afterwards.

## Deployment / rollback

Controller calendar trigger is managed by source under configs/volundr; explicit install of that single user LaunchAgent does not require a full Nix rebuild. Record its installed plist and unload command. Loki jobs use the live Hermes cron API with Europe/Copenhagen schedule and existing cron-topic delivery. First run consumes the current published pin, expected to be a no-op.

Disable/unload the controller agent and disable the new Loki jobs to stop automation. Restore the backed-up dream script/config only after comparing concurrent changes. Each applied library update retains the prior revision, config bytes and pre-existing drafts; rollback preserves newer draft bytes instead of deleting them. Keep the original migration backup. Publication and config pin bumps follow verified Volundr publication, with unrelated terminal/UI work excluded.

## Implemented and activated

Lucas explicitly approved the concrete live rollout through the native approval prompt. The equivalent single user LaunchAgent was bootstrapped without a rebuild, two new Loki jobs were registered with explicit configured delivery, and the existing dream job was wrapped after verified backup. First managed-runner live sync was up-to-date; HEAD/config unchanged. See `configs/volundr/README.md` for installation, observed checks and rollback; machine-specific IDs and backup locations remain in private runtime receipts. Scheduled night firing and actual companion output remain unobserved. Source publication was subsequently requested separately.
