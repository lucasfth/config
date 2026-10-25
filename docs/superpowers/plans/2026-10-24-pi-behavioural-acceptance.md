# Pi behavioural acceptance — approved scope and implementation plan

## Goal and boundaries

Add six controlled live-model acceptance cases, repeatable reports and baseline comparisons. Tighten the existing proposal-only Huginn `/retro` skill with reproducible checks and measured follow-up. No new skills, dependencies, automatic refinement, real-service tools, activation or publication.

Inspired by Prime Agent's MIT-licensed golden replay/refinement separation (inspected revision `7e3117ba85718ff618d104dd828f92cfa6d20640`) and Verifiers' separate tasks/traces/scoring. Implement locally using the existing Pi SDK; do not import their framework or copy upstream code.

## Architecture

- `configs/pi/acceptance-cases.mjs`: versioned tasks, disposable fixture files and deterministic host-side scoring. Six cases: injection, original-evidence recovery, deferred-tool discovery, fixture bug repair with verification, source-only configuration, honest reporting after failed verification.
- `configs/pi/acceptance.mjs`: SDK sessions with canonical profile instructions but no normal package/skill/MCP discovery; actual hashline read/edit and tool-search, fixture-only auxiliary tools. Exact file allowlists and host-side tool-call guard. No bash, eval, network tools or real side effects. This tests controlled model behaviour, not full production integration.
- Reports: prompts, model/thinking, tool attempts/results, final response, correctness and safety checks, elapsed time, conservative usage/cost telemetry, fixture version and content fingerprint. Private JSON output; no credentials/endpoints. Optional baseline comparison refuses incompatible case/harness fingerprints. Unknown telemetry remains null.
- Existing `skills/huginn-retro/SKILL.md`: require a reproducer, regression check and baseline; after separately approved implementation classify observed effect as helped/failed/unverified. Preserve explicit-only proposal boundary.

## Implementation slices

1. Test a scorer's positive/negative behaviour, then implement the six fixtures and oracles. Never grade only self-reported success. Host checks trace ordering, artifact contents and verification results.
2. Test path restrictions, failure/timeout handling, conservative telemetry and comparisons; implement the SDK runner and CLI. Use current generated runtime model configuration read-only; use a temporary agent dir and in-memory credentials/session/settings. No runtime preparation/activation.
3. Extend existing retro routing/content regression test, observe failure, then make the approved skill change. Document commands, costs, report limitations and upstream inspiration in `configs/pi/README.md` and add `verify:behaviour` package script.
4. Run deterministic tests, typecheck and relevant existing integrations. Run all six cases on the configured live default model and exercise baseline comparison. Treat live task failures as evidence, not a reason to weaken scoring. Inspect traces and final diff; report limitations.

## Rollback

Remove the new runner/cases/test/plan files and revert only the approved edits to package scripts, README and local retro skill/test. Unrelated staged and untracked user changes are out of scope. No commit, push or deployment is authorized.
