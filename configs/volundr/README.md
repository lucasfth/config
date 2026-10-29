# Nightly Volundr synchronization

Adopt **config's published Volundr pin**, never arbitrary Volundr main. Local edits and divergent history stay in isolated review candidates; consolidation is proposals-only.

## Schedule

| Component | Schedule | Behavior |
| --- | --- | --- |
| Mac controller | :01/:31 while awake; once daily after 02:31 Copenhagen | Fetch published refs and deliver the exact gitlink via bundle |
| Loki sync | 02:53 Europe/Copenhagen | Validate clean fast-forwards; preserve local work in private candidates |
| Proposal companion | 03:43 Europe/Copenhagen | Tool-free review of supplied summary evidence; proposals only |

The Mac is not woken. Calendar checks use its local clock; the daily gate uses Copenhagen. Missing delivery preserves current skills. Late delivery may be consumed the following night. Verify enabled schedules and execution receipts on the current production host; historical installation results do not prove current delivery. The retired dreaming/AAR-learning job is not part of skill synchronization.

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

Sync is script-only (`no_agent=true`). The source installer configures the evidence reviewer with `enabled_toolsets: []` and verifies that no toolsets resolve. It receives only sanitized skill-name pairs and local-review/conflict counts from `loki_job.py`; it cannot inspect candidate bodies or establish redundancy from name overlap. Its prompt requires proposals only and forbids invented inspections or patches. Both jobs use private explicit delivery routing. Read back installed job definitions separately: source configuration does not prove live permissions, and this description does not authorize changing them. Repeated identical evidence suppresses review attempts, not proof of successful model output.

## Safety boundaries

Delivery defaults to the existing authenticated `gimle` SSH alias, Loki's production host. The retained `loki` alias can still address the retired phone; do not use it for production delivery. No credentials are exported and host-key checking remains enabled. Bundles are checksum-, ref-, target- and age-checked; installed automation is separate from incoming skill content.

Local edits/commits divert to a private disposable clone and rebase candidate. Even clean local reconciliation remains review-required. No stash, reset, blanket ours/theirs, force-push, candidate activation or semantic publication. Raw conflict paths, bodies and exceptions do not enter companion context.

Validation runs the library validator and Hermes loader in scratch profiles, checking canonical active names, ambiguity and archive exclusion. Failed postchecks attempt attached-branch rollback. Injected tree/CAS failures reconcile recognizable old/new bytes to actual HEAD; unknown concurrent edits stop recovery and retain receipts rather than overwrite work. This is not isolation from an uncooperative writer or comprehensive privacy clearance.

To adopt a newly published Volundr release, update the clean config submodule and publish that gitlink separately. Delivery intentionally ignores an unpublished local pin. Before running the installed sync wrapper, compare the signed inbox target, config's published gitlink and live library HEAD. Never send an older pin to a newer dirty checkout or treat `last_status=ok` as convergence: verify `last-sync.json`, the actual library revision and a fresh Hermes skill loader. Pending live skill edits remain unpublished overlays, not permission to publish or overwrite them.

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

## AAR-to-Volundr procedural learning

Implementation, tests and fixtures live in [`learning/`](learning/README.md).
The root `aar_learning.py` is only an installed-wrapper compatibility adapter;
deploy the whole package with it. `learning.cycle` connects fresh reviewed evidence
to candidate packets and private content-addressed receipts without model calls,
skill writes, publication or activation. The explicit `loki_job.py learning` action
prints only count/status summaries and is not automatically scheduled.

The source now routes reusable AAR findings toward reviewed skills, not Muninn
startup supplements. Publication and activation are separate: existing installed
wrappers may still run the legacy candidate/diff implementation until migrated.
Do not run the full installer over an active deployment or restore retired jobs.

### Read-only evidence and external candidates

`aar_learning.py nightly` makes at most eight model attempts: seven newest pending
AARs and one oldest backlog item when more than eight are available. Sources are
bounded at 24,000 characters, sensitive paths excluded, and changed-source results
rejected. Classification skips are separate from actual parse/provider/I/O errors.
Actual errors produce partial-failure output and a nonzero CLI exit status.

All generated candidates now live under the private external state's `candidates/`
directory. The schema-1 proposal ledger remains compatible; historical dispositions
are retained, not reinterpreted as authorization. No candidate, diff, startup rule
or obligation note is written into Muninn. Legacy guidance-review and filesystem
archive commands are removed. `archive_enabled: true` fails closed; preservation
and active-vault cleanup use reviewed Muninn MCP writes/archives only.

### Reviewed pattern routing

`learning.patterns` takes a reviewed findings JSON array plus the vault, external
state and canonical skills checkout. Findings contain `record_id`, `lesson_index`,
an exact source `quote`, reviewed `incident`, `pattern`, `workflow`, `system`,
`diagnosis`, existing `target`, exact `coverage_quote` and review `reference`.
These are review inputs, not proof that an operator approved them. Do not let an
unattended model invent trusted incident identities or review references.

Identical source bytes and shared incident IDs merge transitively. Two independent
incidents make a pattern review-ready; one stays on watch. Existing-coverage
findings cannot be labeled a missing procedure. Diagnoses route to skill content,
discovery, enforcement, code review, history or hold. New skills and urgent single
incidents need separate explicit review rather than an invented recurrence count.
Fresh source and target hashes bind the report; changed evidence requires retriage.

`learning.review` prepares a diff from a qualified group and a candidate file.
It writes no target, grants no approval and rejects stale targets, no-ops, changed
frontmatter and unsafe targets. V1 handles existing-skill body patches only; trigger
metadata and new-skill changes remain explicit manual reviews. Hashes provide
integrity, not semantic safety. This helper is not a sandbox.

### Evaluations and delivery

`learning.evaluate` compares captured baseline/candidate artifacts for both Hugi
and Loki. Public development cases cover downstream job failure, intentional
silence, unrelated requests and staged/published/loaded/behavior-proven distinctions.
The comparator checks completeness, exact skill/artifact hashes and measured usage.
Synthetic runs remain fixture-only; native labels still require independent trace
and loader review. It never turns supplied claims into publication authorization.

Native exploratory runners are `configs/pi/evaluate-aar-skill.mjs` and
`learning/evaluate_hermes.py`. Both use scratch profiles, zero agent tools and
transport budgets of at most sixteen requests per harness. The corrected Hermes
gate blocks repeated attempts for one case even if native outer retries fire.
They preload the selected skill equally: content behavior only, not autonomous
discovery, production-profile parity or live adoption. Model/provider identity
must remain constant within each comparison. The Hermes runner uses the installed
native dependency closure and reads only the configured inference credential; it
does not copy plugins, MCP, memory or live configuration into the scratch profile.
Credentials stay in the transport gate and never in model prompts/artifacts.

The first authorized 32-request run is not a qualifying benchmark: Pi produced
answers but the original prompt omitted exact output keys, invalidating strict
schema scores; all sixteen Hermes calls failed the provider's unsupported
reasoning-off setting. Its error envelope was mistakenly accepted as a nonempty
answer. The second authorized batch completed sixteen Pi requests against the
metadata-preserving payload; both variants passed the five boolean/numeric cases.
String-valued outcomes remained too underspecified for exact scoring (5/8 each
is schema agreement, not task accuracy or uplift). Hermes made nine requests on
the first case before failing: the gate had incorrectly converted streaming SSE
into JSON and native outer retries bypassed the SDK retry setting. No answer or
completed Loki capture resulted. Across both batches 57 provider requests were
made, within 64 explicitly authorized; unused allowance is not silently reused.

The local runner now preserves native SSE, hard-blocks same-case retries at the
transport boundary and rejects failed result envelopes. Two loopback tests prove
the corrected streaming and retry boundaries without model calls. Explicit allowed
string values are now in the development contract. A fresh budget is needed for
another behavioral run; the contract must not expose expected answers.
Neither batch qualifies the candidate or establishes cross-agent improvement.

Real native behavior remains an acceptance gate. Do not run arbitrary commands
from evidence or expose live tools to the patch writer. Agree a bounded model
budget, preserve acceptance cases outside the writer, and inspect actual traces
rather than trusting structured claims.

After review, use the existing Volundr maintenance-record, manifest and secret gates;
publish/pin/deliver only with current authorization. Verify exact installed revisions
and fresh loaders separately on Hugi and Loki. No framework, publication bypass,
new schedule, automatic SOUL.md edit or unrestricted self-modification is added.

### Fresh Hugi sessions and Muninn retirement

The Pi Muninn hook retains mandatory identity, safety, coding and project guidance
and the bounded prior-session index. It no longer fetches `tech/learning/general.md`
or project supplements. It adds a short skills-first pointer; native installed
skills remain the procedure consumer. Historical notes are still explicitly
recallable, and archived session paths retain the old recall fallback.

Do not bulk-delete AARs or `dreams/` evidence. Inventory any actual supplement files
and active producers, preserve unique facts, repair inbound links/indexes, and use
MCP archival/readback only after the replacement is ready. No absent file needs
a fake tombstone. Source-only tests are not permission to remove still-used notes.

### Commands and checks

Private nightly configuration retains absolute `vault`, external `state`, existing
`dream_script`, optional allowlisted `provider_env`, `enabled`, and
`archive_enabled: false`. It contains no credential values or delivery targets.

```sh
cd configs/volundr
python3 -m learning extract --config /private/aar-config.json
python3 -m learning triage --vault /private/vault --state /private/aar-state \
  --skills /private/volundr --findings /private/reviewed-findings.json
python3 -m learning review --skills /private/volundr \
  --group /private/fresh-group.json --candidate /private/candidate.md
python3 -m learning evaluate --root /private/captures \
  --suite learning/fixtures/pilots.json \
  --packet /private/packet.json --traces /private/traces.json
```

Local verification (no live vault/model/job changes):

```sh
cd configs/volundr
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s learning/tests -v
for test in learning-layout dream_guard nightly automation loki_job; do
  PYTHONDONTWRITEBYTECODE=1 python3 $test.test.py -v || exit
done
cd ../pi
node --import tsx --test extensions/muninn.test.ts extensions/muninn-learning.test.ts
npm run typecheck
node integration-learning.mjs
```

The native SDK integration captures two fresh sessions and four fixture-provider
requests through the actual hook, MCP client and installed skill catalogue. It
proves context delivery and absence of legacy supplement reads—not model compliance,
Loki adoption, unattended scheduling or a behaviorally improved skill.

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
