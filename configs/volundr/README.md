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

### Legacy correction-table writer disable

After explicit approval, `disable_correction_writer.py` disables only
`_update_coding_style_corrections()` with an immediate return after its docstring.
Session analysis/counting stays intact. Existing correction tables, all other
dream steps, cron definitions and the Pi startup hook are unchanged.

The maintenance operation takes the existing sync lock, refuses a running dream
job, verifies the expected live SHA-256 and receipt baseline, makes private
script/receipt backups, and records the new `dream_guard.after` hash. It does not
run dreaming or install Volundr. Use `--script`, `--deployment`, `--expected` and
`--apply` only for an approved live operation; without `--apply` it checks a copy.

Rollback warning: the original Volundr installation backup predates this disable.
Restoring that historical script would re-enable the writer and requires explicit
approval; do not treat that restore as preserving the disable. A future installer
failure rollback computes its baseline from its own input, not a fixed hash;
the captured comparison round-trips disabled input, and a separate handler fixture
checks that an unexpected concurrent disable is not overwritten. These are isolated
checks, not an end-to-end installer run. No installer code or schedules are changed
by this maintenance operation.

Fixture-only regression (private captured script and adjacent captured
`dream_guard.py` / `install_loki.py`, never import or run the live dream):

```sh
CORRECTION_DREAM_SOURCE=/private/capture/pristine.py \
  PYTHONDONTWRITEBYTECODE=1 python3 configs/volundr/correction_writer.test.py -v
```

Each activated sync retains revision/config backups under `state/rollback-*`. Unknown concurrent work requires manual review, not deletion of drafts. Original migration backups remain separate under `~/.hermes/skill-backups/`.

Publication of these sources does not provision another host, rotate credentials, resolve the Hermes source-updater mismatch, clear opaque Raycast exports, complete historical catalogue audits, or clear the separate Pi integration-context budget issue.

## AAR learning — source implementation and activation

`aar_learning.py` is the separate bounded distillation/review/archive entry point.
This source implementation has fixture tests; it has **not been installed on Loki**.
The optional `dream_guard.run_dream` call is used only when private settings include
`aar_learning_config`. No existing cron definitions are changed by these sources.
Do not run the full installer over the active deployment to pick up this change.

### Data flow and approval

- Nightly reads at most eight previously unprocessed AAR/correction notes per run.
  Each source is limited to 24,000 characters, with no silent truncation. It reuses
  only the local dream script's model-call function, not module setup or agent tools.
- Candidate Markdown and illustrative diffs go to `dreams/aar-learning/`. They are
  evidence, never startup instructions. The external JSON ledger binds source and
  proposal hashes and preserves explicit review decisions.
- `review --decision approved` requires a Lucas approval reference and an explicit
  `general` or exact `org/repo` scope. A model cannot supply approval fields.
  Existing-coverage findings cannot be promoted as duplicate rules. `covered` and
  `rejected` dispositions are also explicit review actions.
- Approved supplements live at `tech/learning/general.md` and
  `tech/learning/projects/<org>/<repo>.md`. Each is capped at 20 entries and 8,000
  rendered UTF-16 units; approval refuses overflow before writing the note/ledger.
- The existing Pi startup hook reads only these exact approved paths. It validates
  approval/provenance fields, excludes candidates, and never loads candidate prose.
  Retired generated correction tables are filtered from initial context without
  deleting source text; explicit recall still returns the original documents.

### Archival

`obligations --items <JSON array> --reference <review>` explicitly reconciles
historical open-item candidates. Durable obligations are written to
`tech/learning/open-items.md` before the ledger records the review. Neither the
model nor archival marks obligations resolved.

`plan-archive` is read-only. A source is eligible only after 30 days, unchanged
source bytes, dispositions for every lesson, and explicit obligation review.
`archive --apply` moves it to `projects/_archive/<org>/<repo>/<branch>/<file>.md`
using verified hard-link/journal/unlink steps, with interruption recovery and no
overwrite of unrelated collisions. Keep vault and archive on the same filesystem.
Original paths remain in provenance; Pi recall tries the deterministic archive path
if the original cannot be read, and startup excludes archived session-index entries.

Nightly always returns an archive plan. Actual automatic archival additionally
requires `archive_enabled: true` in the private config; default/missing is off.
Do not enable it until a live dry-run and its candidate dispositions are reviewed.

### Private configuration and commands

Create private config only during an approved activation; the following is a
template, not a deployed file. Use absolute host paths, external private state,
and the existing installed dream script; no credentials or delivery targets belong
in this config. Model credentials must already be present in the job environment.

```json
{
  "enabled": false,
  "archive_enabled": false,
  "vault": "/absolute/private/vault",
  "state": "/absolute/private/aar-state",
  "dream_script": "/absolute/private/dream_obsidian.py"
}
```

```sh
python3 configs/volundr/aar_learning.py nightly --config /private/aar-config.json
python3 configs/volundr/aar_learning.py plan-archive --config /private/aar-config.json
# Only after the specific proposal/obligations have been explicitly reviewed:
python3 configs/volundr/aar_learning.py review --config /private/aar-config.json \
  --id PROPOSAL_SHA256 --index 0 --decision approved --scope org/repo \
  --reference 'Lucas approval reference' --apply
python3 configs/volundr/aar_learning.py obligations --config /private/aar-config.json \
  --id PROPOSAL_SHA256 --items /private/reconciled-items.json \
  --reference 'Lucas reconciliation reference' --apply
```

Activation is a separate operation: back up/hash the existing private runtime,
copy only reviewed learning/wrapper sources, configure the opt-in, then exercise
one bounded distillation without the full dream. Real guidance approval and real
archival are separate from that candidate-generation run. Do not restart gateways,
reinstall Volundr, or change cron/delivery targets as part of this source update.

Rollback: remove the private `aar_learning_config` setting or set `enabled` false
to stop new processing; preserve the ledger, generated notes and archive evidence.
Approved guidance remains until explicitly withdrawn/curated. Restore an archived
source only after checking source absence, archive bytes and ledger state. Never
restore a pre-disable dream script as a shortcut: that can re-enable the old writer.
The requested writer-preserving rollback policy is not yet enforced by tooling.

Local verification (no real vault, provider, cron or archival):

```sh
python3 configs/volundr/aar_learning.test.py -v
python3 configs/volundr/dream_guard.test.py -v
cd configs/pi
node --import tsx --test extensions/muninn.test.ts extensions/muninn-learning.test.ts
npm run typecheck
node integration-learning.mjs
```

The SDK integration uses the actual startup hook and MCP client with a fixture
server and synthetic provider. It proves two fresh-session context fetches, not
live Loki scheduling, actual Muninn approvals, or improved agent behavior.

## Credential containment and secret gates

The October 19 security migration rewrote Volundr history to remove captured Spotify material and imported asset access-token queries. The operator deferred Spotify rotation: **the preserved credential is compromised, not safe to use**, and Volundr must remain private until rotation and a separate personal/company-data review. Private recovery copies and provider/GitHub caches are not erased by rewriting main. Do not make this repo public on the strength of a scanner alone.

`secret_gate.py` runs checksum-pinned-policy Gitleaks checks before controller delivery and Loki fast-forward/probing. Runtime gate code/policy are separately installed from config, never imported from an incoming skill checkout. Missing scanner/policy, modified policy, symlinks or findings fail closed. A candidate cannot self-allow using `.gitleaksignore`, inline comments or its own policy. Manifest hash exceptions are structural, not directory exclusions.

Install Gitleaks with `python3 configs/volundr/install_scanner.py --destination ~/.local/bin/gitleaks` on Mac/ARM64 Linux (including Loki) or x86_64 Linux. Re-run `install_controller.py --apply` after source upgrades; it now includes the gate/policy. Loki code deployment must include `secret_gate.py` and `gitleaks.toml`; private settings must set `gitleaks` to the absolute installed binary. Do not run the installer over an active deployment to upgrade code.

Volundr includes opt-in staged/pre-push hooks and a required GitHub `secret-gate` check. The trusted CI gate uses an immutable reviewed security-code revision, separately from candidate tests. Changing trust/policy requires explicit maintainer review; untrusted PR code must never run in the privileged gate job. Normal main updates prohibit force-pushes and enforce checks for admins. The authorized rewrite used a logged one-shot exception and exact lease, with protection restored immediately.

Security regressions: `python3 configs/volundr/secret_gate.test.py -v`, unsafe-delivery test in `automation.test.py`, and unsafe-bundle test in `nightly.test.py`. The history scan takes a Git revision expression: `HEAD` includes its full ancestry, whereas `--all` also scans unrelated fetched refs. Consumer checks scan the selected target's ancestry. Old backups/refs intentionally quarantined outside the live graph will still contain old material and must remain private.

History replacement is a coordinated maintenance action, not an automatic rebase: pause controller and all three Loki jobs, preserve local edits and originals privately, quarantine old bundles/state, install clean sanitized checkouts/mirrors, publish the new config gitlink, manually gate delivery/loading, then restore prior schedules. Never reset dirty Loki work or silently reactivate an old bundle.

### Android history attestation

The upstream ARM64 scanner's patch-history mode hits an Android-blocked syscall. Loki therefore fails closed on local history scanning. Instead, the Mac completes actual Gitleaks history/tree scans before signing a receipt bound to the exact target, config revision, bundle SHA-256, policy SHA-256 and creation time. Loki verifies the SSH signature against its separately installed public allowed-signers file, then runs its own tree gate. Missing/altered/expired proofs block acceptance. No per-snapshot fallback is accepted as the patch-history result.

Controller signing key: private `~/.local/state/volundr/history-signing-key`, never copied to Loki or Git. Loki's private settings specify `history_allowed_signers`; install only the matching public signer line in that file. Back up this key privately and explicitly provision its public key on replacement receivers; never auto-trust a key from an incoming delivery. The controller installer copies `attestation.py` but deliberately does not generate or distribute trust keys. `attestation.test.py` covers signature and target/bundle binding.

### Verified migration state and outstanding owner actions

At the October 19 containment check, config main selected sanitized Volundr `876be5b`; local standalone/submodule and remote main matched. Mac actual history/tree scans and both Volundr GitHub checks passed. Loki verified the signed exact-bundle history result, passed its local tree gate, loaded 219 active/15 archived roots, and completed a managed-runner no-op sync. Installed gate/attestation/policy bytes matched config source. The three saved Loki schedules were restored only after that proof; controller bootstrap completed with exit 0. First unattended execution after this security migration remains to be observed.

Two newly discovered Loki-local watchdog edits were preserved in the private migration recovery checkout, not reset, discarded, automatically published or reapplied. Their paths are recorded in the private manifest/receipt. They are **pending review/reapplication**; active canonical skill content does not include those local edits. Preserve the recovery copy until that decision is made.

Spotify rotation is still pending at the operator's request. The old value is explicitly compromised in ignored 0600 Mac nix_secrets; never test or reuse it. Keep Volundr private until rotation and the separate personal/company-data review pass. Old history remains in private recovery archives and may remain in GitHub caches; future public release needs a final history/ref/cache review, not merely a clean current scan.
