# AAR skills-first migration — implementation checkpoint

Date: 2026-10-29. Published and scoped-deployed after Lucas's `/full-send`; native behavioral uplift remains unproven.

## Implemented locally

- Candidate-only extraction outside Muninn; recent-first bounded selection with a backlog slot; honest skip/error/partial-failure statuses. Legacy startup promotion and direct-filesystem archival are removed from this source.
- Evidence/source/target-bound pattern triage, incident-copy deduplication and diagnosis routes. Reviewed JSON inputs are not authentication or an autonomous authorization mechanism.
- Hash-bound skill diff preparation and deterministic captured-run comparison. No autonomous patch writer, scheduler installation or publication bypass.
- Hugi fresh-session injection keeps required Muninn guidance, drops legacy lesson supplement reads, points at installed Volundr skills, and persists a payload-hash availability receipt. This proves availability, not body reads or behavior.
- Audit-skill correction published as Volundr `50cea89b449a2ce90b4778f6962612c478e90717`, with reviewed maintenance record and manifest; remote tests and secret gates passed. Metadata preserved. Independent reviews had read-only source access but no Git/test execution; parent reconciled exact changes and gates.
- Continued implementation groups components/tests/fixtures under `configs/volundr/learning/`; root `aar_learning.py` is a compatibility adapter. One package CLI and explicit opt-in job action connect fresh reviewed patterns to supplied candidates, immutable private receipts and count/status digests.
- Replacement cron entrypoint is installed on Gimle at `~/.hermes/scripts/aar_distill_nightly.py`, importing the deployed `learning.cron`. Existing job `7dbbff77e0e8` remains enabled at 03:07 Copenhagen time with `no_agent: true`; no schedule or job-authority expansion. Disabled-config CLI proof returns exit 0 and exact JSON without provider requests. First scheduled fire remains unobserved.
- A reviewed cycle using exact October 20/28 AAR copies returned one recurring existing-guidance enforcement pattern, zero packets, and identical repeated receipt `278a01e8d3589fbf3e560d4c60dcaa87394b941129f171d6783cf8ed2d573059`. No new rule was justified.

## Fresh local verification

- Pi full suite: 172 passed; typecheck passed; on-Gimle targeted consumer tests 11 passed and fresh-session integration passed.
- Native SDK startup integration: two fresh sessions, four loopback fixture requests, required guidance and installed skill catalogue present, durable startup receipts with four learning-owner hashes, zero legacy supplement reads, once-per-session injection.
- Learning package: 35 tests passed locally and from the selected installed source on Gimle. Other selected tests pass with explicit external-fixture skips; broad historical correction-writer gate still needs `CORRECTION_DREAM_SOURCE`. Running the skill-contract test from the runtime-only code directory has no source-relative Volundr checkout; use config source root or the separate native-loader proof.
- Volundr validation: 245 skills, 1841 files; 56 library tests passed.
- Both repository diffs pass whitespace checks.

## Behavioral evaluations — NOT qualified

Lucas authorized two batches capped at 32 real provider requests each.

1. First batch: 16 Pi answers, but output keys were unspecified; 16 Hermes provider rejections for unsupported reasoning-off. The failed native envelope was mistakenly treated as a nonempty answer. Not qualifying.
2. Second batch: 16 Pi answers against the current metadata-preserving payload; both variants agreed with all five boolean/numeric fixtures. Three string-valued outcomes remained underspecified, so raw 5/8 scores are schema agreement, not accuracy or improvement. The candidate explicitly reported partial downstream failure on the relevant case; this alone is not comparative proof. Hermes made nine provider requests on the first case and no completed capture: the runner converted native streaming into JSON, causing nested native retries despite SDK retries being disabled. Not qualifying.

Total: 57 real provider requests within 64 explicitly authorized. No further model requests after the second failure. Unused allowance is not silently recycled. Local runner now preserves streaming, prevents duplicate upstream requests per case, stops on failed envelopes, uses supported low reasoning and exposes allowed output enums rather than expected answers. Loopback tests pass; corrected native model comparison remains unrun.

Private temporary artifacts (not durable evidence storage): Mac `/tmp/aar-native-eval.dzA0Ns`, `/tmp/aar-native-repeat.jsTXSS`; Gimle `/tmp/aar-native-eval.Tj8RYO`, `/tmp/aar-native-repeat.gS63rO`. Keep raw traces private and sanitize before any publication.

## Muninn cleanup inventory

Before this continuation's handoff write, MCP listing and recursive inspection found zero legacy approved files under `tech/learning/`, including project paths. That inventory is historical; the folder now contains an explicitly non-injected implementation handoff and its index, not restored startup supplements.

The 190 old candidate/diff artifacts remain historical evidence. Their producer has now been replaced; no new active-vault candidates or startup diff files are produced by the migrated extractor. Preserve unique content and inspect backlinks before any future archival rather than deleting the evidence corpus. No legacy approved startup supplement existed to remove.

Saved `tech/learning/AAR-To-Volundr-Learning.md` and `tech/learning/_INDEX.md` through MCP; added the root index row and dated shared-skills runbook pointer. All four active contents were read back exactly. The prior root index (`archive-9024ec76b9f62f4368568457604a5465`) and shared-skills runbook (`archive-bd5321178b3372b8f7378314e2bad2c5`) were read back and matched the pre-write hashes/content. New-note search warnings were reviewed; legacy writes report filing unverified, so manual exact index verification supplies the evidence rather than claiming atomic filing. No direct SSH overwrite, artifact archive, backup publication, snapshot refresh, live profile/gateway/schedule or installed skill change occurred.

## Open gates

1. Corrected native comparison and autonomous trigger checks under a fresh explicit model budget. Current proofs establish installation/context/loader operation, not behavior improvement.
2. Observe the first scheduled run and private `runs/` receipt, including nonzero partial-failure semantics. No extra billed extraction run was started during deployment.
3. Gimle config HEAD remains `a6ac3c1` because pending tracked/untracked work blocks fast-forward. Exact published selected files were conflict-checked and deployed individually; whole-checkout alignment remains distinct and must preserve pending work.
4. Historical artifact archival, if desired, needs per-note provenance/backlink review; nothing was bulk-deleted.

## Published rollout evidence

Config implementation `0356b44833e955188a1f1a97401ca84010b309a9` and scoped deployment helper `c5035b0a9f044ec19700c1218b6a69af515c54f1` are on `lucasfth/config` main. The pinned Volundr main is `50cea89b449a2ce90b4778f6962612c478e90717`. Remote readbacks and CI gates verified.

Signed bundle delivered using the existing delivery path; Gimle `last-sync.json` reports `up-to-date` at that skill pin. Both `/Users/gimle/loki-data/live/volundr` and `/Users/gimle/config/volundr` advanced without discarding unrelated edits. Native Hermes catalogue plus `skill_view` returned the new body/hash `4c3f5ebe09f8d534a1f2d995e822e46373c03e2935d9c2ddb071b4a5964d7f14`.

Scoped deployment receipt: `~/.hermes/volundr-nightly/deployments/20261029T114618Z-c5035b0a9f04/receipt.json` (56 payload mappings, before bytes retained). The second deployment added the published `credentials.mjs` dependency missing in Gimle's older checkout. No credentials were copied into public source or logs.

Hugi's live settings on Mac and Gimle point to their updated source `muninn.ts`; fresh native SDK sessions exercised exact installed hook, required Muninn guidance, catalogue and startup hash receipt with fixture MCP/provider. Current existing sessions and gateway prompt caches were not restarted or retroactively rewritten. No additional billed model calls, gateway restart, automatic skill writer, autonomous publication or encrypted-backup publication was performed.
