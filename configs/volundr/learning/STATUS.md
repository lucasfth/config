# AAR skills-first migration — implementation checkpoint

Date: 2026-10-29. Branch: `feat/aar-volundr-learning`. Source only; not published or activated.

## Implemented locally

- Candidate-only extraction outside Muninn; recent-first bounded selection with a backlog slot; honest skip/error/partial-failure statuses. Legacy startup promotion and direct-filesystem archival are removed from this source.
- Evidence/source/target-bound pattern triage, incident-copy deduplication and diagnosis routes. Reviewed JSON inputs are not authentication or an autonomous authorization mechanism.
- Hash-bound skill diff preparation and deterministic captured-run comparison. No autonomous patch writer, scheduler installation or publication bypass.
- Hugi fresh-session injection keeps required Muninn guidance, drops legacy lesson supplement reads, points at installed Volundr skills, and persists a payload-hash availability receipt. This proves availability, not body reads or behavior.
- One staged existing-skill body correction: `improvement-loop-audit`. Metadata preserved. Manifest and honest local review record updated in the isolated submodule checkout. No publication or independent review.
- Continued implementation groups components/tests/fixtures under `configs/volundr/learning/`; root `aar_learning.py` is a compatibility adapter. One package CLI and explicit opt-in job action connect fresh reviewed patterns to supplied candidates, immutable private receipts and count/status digests.
- Added a replacement `python3 -m learning cron` extraction entrypoint with private run receipts, count-only output, redacted error types and nonzero partial-failure/boundary exits. It is not installed or scheduled; CLI and fixture paths run without model calls.
- A reviewed cycle using exact October 20/28 AAR copies returned one recurring existing-guidance enforcement pattern, zero packets, and identical repeated receipt `278a01e8d3589fbf3e560d4c60dcaa87394b941129f171d6783cf8ed2d573059`. No new rule was justified.

## Fresh local verification

- Pi full suite: 171 passed; typecheck passed.
- Native SDK startup integration: two fresh sessions, four loopback fixture requests, required guidance and installed skill catalogue present, durable startup receipts with four learning-owner hashes, zero legacy supplement reads, once-per-session injection.
- Current Python checks: 34 learning-package tests passed; 35 other selected tests passed with two explicit missing-external-fixture skips. A broad root glob additionally exposed five pre-existing `correction_writer.test.py` failures because `CORRECTION_DREAM_SOURCE` is unset; that external historical fixture gate is unavailable, not green.
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

The live vault has 190 Markdown artifacts under `dreams/aar-learning/` (95 candidate/diff pairs), and the installed legacy producer still exists. These are unapproved historical artifacts, not active startup instructions. Do not bulk-archive them while their producer remains installed or before preserving any unique proposal context. Current operational notes cover independent systems and deployment history, so they are not obsolete whole-file deletion candidates.

Saved `tech/learning/AAR-To-Volundr-Learning.md` and `tech/learning/_INDEX.md` through MCP; added the root index row and dated shared-skills runbook pointer. All four active contents were read back exactly. The prior root index (`archive-9024ec76b9f62f4368568457604a5465`) and shared-skills runbook (`archive-bd5321178b3372b8f7378314e2bad2c5`) were read back and matched the pre-write hashes/content. New-note search warnings were reviewed; legacy writes report filing unverified, so manual exact index verification supplies the evidence rather than claiming atomic filing. No direct SSH overwrite, artifact archive, backup publication, snapshot refresh, live profile/gateway/schedule or installed skill change occurred.

## Open gates

1. Independent semantic/security review before integration.
2. Corrected, enumerated native comparison on both harnesses under a new explicit model budget; avoid claiming uplift if baseline already passes.
3. Fresh autonomous discovery/trigger checks (preloading does not test discovery).
4. Publication and pin approval, reviewed merge/rebase with concurrent main-checkout edits, signed delivery and fresh loader/behavior checks on both actual consumers.
5. Explicit activation of the migrated extractor; verify installed wrapper hashes and schedule without resurrecting retired jobs.
6. After producer migration, reassess old candidate/diff artifacts and any now-superseded active note sections; preserve/archive through Muninn MCP and verify prior bytes and references.

Retain the worktree and its isolated submodule edits. Do not copy wholesale into the dirty main checkout or publish the skill because unit tests pass. This is a tested source checkpoint, not the completed unattended improvement loop.
