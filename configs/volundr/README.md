# Nightly Volundr synchronization

Adopt **config's published Volundr pin**, never arbitrary Volundr main. Local edits and divergent history stay in isolated review candidates; consolidation is proposals-only.

## Schedule

| Component | Schedule | Behavior |
| --- | --- | --- |
| Mac controller | :01/:31 while awake; once daily after 02:31 Copenhagen | Fetch published refs and deliver the exact gitlink via bundle |
| Loki sync | 02:53 Europe/Copenhagen | Validate clean fast-forwards; preserve local work in private candidates |
| Existing dreaming | 03:07 Europe/Copenhagen | Shared sync lock; legacy hardener auto-apply disabled; consolidation pointer |
| Proposal companion | 03:43 Europe/Copenhagen | Tool-free reasoning over scrubbed skill-name pairs/conflict counts |

The Mac is not woken. Calendar checks use its local clock; the daily gate uses Copenhagen. Missing delivery preserves current skills. Late delivery may be consumed the following night. First unattended scheduled executions and actual companion output were not observed during installation; verify those independently.

## Controller installation

From this repository, after approval to provision runtime files:

```sh
python3 configs/volundr/install_controller.py --apply
```

This is the canonical provisioning step. It installs `controller.sh`, `controller.py` and `deliver.py` under `~/.local/libexec/volundr/` and initializes/verifies bare GitHub repositories `~/.local/state/volundr/{config,library}.git`. Runtime/state directories are 0700. Existing unexpected origins or repository types are rejected. It does **not** load/restart launchd, fetch credentials, or activate Nix.

The LaunchAgent declaration is in `nix/darwin/launchd.nix`. Provision runtime files **before** an approved activation of that declaration. Nix does not itself provision them. A fresh Mac therefore needs the installer and existing GitHub/Loki SSH access; a rebuild alone is insufficient. Runtime code updates also require rerunning the installer explicitly; changing the source does not update installed copies.

The runtime command is `/bin/sh ~/.local/libexec/volundr/controller.sh`. Keeping it and the bare repositories outside Desktop avoids macOS blocking launchd access. The initially approved rollout bootstrapped only the equivalent user agent; no full Nix rebuild or gateway restart was run.

```sh
python3 "$HOME/.local/libexec/volundr/deliver.py" \
  --config "$HOME/.local/state/volundr/config.git" \
  --library "$HOME/.local/state/volundr/library.git" --check
launchctl print gui/$(id -u)/org.nixos.volundr-delivery
```

## Loki installation and private settings

Installed code lives under `~/.hermes/volundr-nightly/code/`. Private `settings.json` supplies `repo`, `home`, `state`, `inbox`, `path`, `runtime_python`, `runtime_source`, `runtime_env`, `dream_script`, `dream_job_id` and `delivery_target`. Keep settings, job IDs, chat routing, backups, credentials and raw captures out of public source. No default delivery to origin/DM is allowed.

`install_loki.py --apply` is an explicit live operation, not an import-time action. It requires the prepared settings and Hermes runtime, verifies the existing dream job, makes verified script/vault/state/job backups, and registers sync/review jobs. It refuses an existing deployment receipt unless the prior attempt rolled back. Do not reinstall over an active deployment merely to update code. Use the private deployment receipt to inspect existing installation state first.

Review is an LLM job (`no_agent=false`) with `enabled_toolsets=[]`, no session attachment and no injected skill bodies. Sync is script-only (`no_agent=true`). Both use the private explicit `delivery_target`. The companion cannot resolve actual conflicts from counts; its output is a proposal, not an inspected patch. Repeated identical evidence suppresses review attempts, not proof of successful model output.

## Safety boundaries

Delivery uses existing authenticated Mac SSH access without credential export or host-key bypass. Loki's direct GitHub SSH remains unresolved. Bundles are checksum-, ref-, target- and age-checked; installed automation is separate from incoming skill content.

Local edits/commits divert to a private disposable clone and rebase candidate. Even clean local reconciliation remains review-required. No stash, reset, blanket ours/theirs, force-push, candidate activation or semantic publication. Raw conflict paths, bodies and exceptions do not enter companion context.

Validation runs the library validator and Hermes loader in scratch profiles, checking canonical active names, ambiguity and archive exclusion. Failed postchecks attempt attached-branch rollback. Injected tree/CAS failures reconcile recognizable old/new bytes to actual HEAD; unknown concurrent edits stop recovery and retain receipts rather than overwrite work. This is not isolation from an uncooperative writer or comprehensive privacy clearance.

Dream installation verifies script, `dreams/`, `.dream_state.json` and job backups before rewriting. The original proactive suggestion body remains under a private name; a wrapper adds an evidence pointer on every return path. The retired hardener consumer returns a report and zero applied/queued counts, matching its three-value caller. Existing suggestions do not authorize shared-skill edits. A real dream run mutates the vault: never use it as a smoke test.

## Verification

```sh
PYTHONDONTWRITEBYTECODE=1 python3 configs/volundr/nightly.test.py -v
PYTHONDONTWRITEBYTECODE=1 python3 configs/volundr/automation.test.py -v
PYTHONDONTWRITEBYTECODE=1 python3 configs/volundr/loki_job.test.py -v
# Private capture intentionally excluded from Git:
VOLUNDR_DREAM_SOURCE=/path/to/captured/dream_obsidian.py \
  PYTHONDONTWRITEBYTECODE=1 python3 configs/volundr/dream_guard.test.py -v
```

`install_loki.test.py` runs only on Loki against copied private source/job fixtures. It exercises failures after script replacement/job creation, wrapper cleanup/retry and actual managed-cron sync/review/dream-stub entrypoints. Fixture jobs do not reach the live store or real dream.

During initial installation, a real controller bundle advanced a scratch library from `9731393` to `26c5425`, loaded 219 active roots, rejected all 15 archives and preserved unrelated YAML. First live managed-runner sync was up-to-date with HEAD/config unchanged. The initial Desktop-backed agent failed with exit 126; relocating runtime code and repositories produced launchd exit 0 and a fresh delivery receipt. These are manual-path observations, not proof of a subsequent scheduled night or model output.

## Operations and rollback

Controller plist: `~/Library/LaunchAgents/org.nixos.volundr-delivery.plist`. State/logs: `~/.local/state/volundr/`. To stop it:

```sh
launchctl bootout gui/$(id -u)/org.nixos.volundr-delivery
```

Remove/disable the Nix declaration before a later activation if retiring it.

Loki receipt: `~/.hermes/volundr-nightly/deployment.json`; state/candidates/errors: `~/.hermes/volundr-nightly/state/`. Read job IDs and original dream definition from that **private receipt**, then pause the two new jobs before rollback. Compare the current dream script against the receipt's `after` hash, atomically restore its backed-up original, and restore only the existing dream job's `script` field. Keep new jobs paused afterwards. Preserve newer dream notes/runtime results; never replace the whole cron store or vault from a stale snapshot. No gateway restart is needed.

Each activated sync retains revision/config backups under `state/rollback-*`. Unknown concurrent work requires manual review, not deletion of drafts. Original migration backups remain separate under `~/.hermes/skill-backups/`.

Publication of these sources does not provision another host, rotate credentials, resolve the Hermes source-updater mismatch, clear opaque Raycast exports, complete historical catalogue audits, or clear the separate Pi integration-context budget issue.
