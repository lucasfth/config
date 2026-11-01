# AAR-to-Volundr learning loop — research and proposed plan

Status: proposal for Lucas's review; not approved for implementation, publication, activation or autonomous worker execution.
Date: 2026-10-29

## Goal

Turn verified, reusable findings from existing AARs into small, evaluated Volundr skill improvements consumed by Hugi and Loki. Track recurrence and root cause rather than generating a new skill for each mistake. Keep Muninn as the evidence record, Volundr as the procedural library, and runtime code as the place for enforceable constraints.

## Research findings

These are public documentation, authors' reports and selectively inspected code, not independent reproduction of benchmark results or access to private provider practices. Repository main branches can change after this review.

- Anthropic's skill-creator supports skill-vs-baseline comparisons, trigger evaluation, benchmarks and blind comparisons. It distinguishes capability-uplift skills from encoded preferences; a capability workaround may become unnecessary after a model upgrade, while workflow preferences still need fidelity checks.[1]
- Anthropic's harness experiments separate generation from evaluation because agents tend to grade their own work too generously; the article also acknowledges that a separate evaluator can still be lenient.[2]
- OpenAI reports replacing a giant AGENTS.md with a short map to structured documentation, and promoting rules into mechanical checks when documentation is insufficient.[3]
- OpenAI's Tax AI case study groups recurring practitioner corrections, distinguishes actionable failures from workflow noise, and turns reviewed findings into bounded tasks with targeted and regression evaluations. Architecture and shipping remain engineering responsibilities.[4]
- Google DeepMind's AlphaEvolve pairs generated candidate programs with automated verification and scoring. This is an algorithm-optimization example, not a general personal-assistant memory system.[5]
- Letta's Skill Learning uses trajectory reflection followed by skill creation. Its published experiment derives skills from baseline benchmark trajectories and evaluates on the benchmark; this is not by itself proof of unseen-task or cross-harness transfer.[6]
- NousResearch's self-evolution README identifies skill evolution as implemented, but continuous improvement, tool descriptions, system prompts and code evolution as planned.[7] The inspected skill optimizer catches GEPA exceptions and falls back to MIPROv2; full test execution is opt-in.[10] Its selected fitness function scores keyword overlap rather than actual tool execution, despite a richer judge class also being present.[11]
- EvoSkill supports benchmark-driven skill/program evolution and held-out evaluation, but its README marks continuous evolution and evolution without a benchmark as work in progress.[8]
- Neosigma's auto-harness implements a benchmark/change/gate loop, with regression and score gates and newly passing cases promoted into a suite. It is useful as a prototype reference, not evidence of safe unattended production improvement.[9]

### Recommendation

Borrow Anthropic's skill and trigger evaluation, OpenAI's recurring-correction triage, Letta's reflection-to-skill separation, and benchmark harnesses' bounded candidate/gate/record loop. Do not install another agent framework for v1. Do not adopt a claimed optimizer without verifying its actual scoring and execution route.

Two alternatives were considered: retaining proposal-only processing leaves the current consumption gap; unrestricted self-modification puts instructions and permissions at risk. Prefer automatic evidence processing and tested patch preparation, followed initially by approval-gated publication and activation. A later policy can authorize narrow maintenance once evaluation and delivery work reliably.

## Current local integration points

Inspected source:

- `configs/volundr/aar_learning.py`: bounded extraction, source hashes, proposal ledger, explicit startup-guidance approval and separate archival.
- `configs/volundr/aar_learning.test.py`: existing extractor/review/archive tests.
- `configs/volundr/loki_job.py`: sync/review wrapper; existing review input is not an AAR-to-skill writer.
- `configs/volundr/nightly.py`, `deliver.py`, `controller.py`: existing pin/bundle delivery, verification and state machinery.
- `configs/volundr/README.md`: deployment ownership and known historical limitations.
- `volundr/skills/volundr-shared-skills/SKILL.md` and its sync reference: canonical skill ownership, maintenance-record/manifest requirements, publication and consumer receipt distinctions.
- `configs/pi/extensions/muninn.ts`: approval-gated supplemental startup learning; leave intact, not the default destination of this work.

Earlier live inspection in this conversation found an operating candidate-only AAR distiller, generated proposals, no review dispositions and no approved supplements. Historical documentation contains contradictory retired-job and unobserved-run statements; inspect installed hashes and job definitions again before changing runtime. Do not restore a retired dream job or run the full installer to upgrade an active deployment.

The extractor sorts by pathname, not actual AAR date. Its comment claims oldest-first but that is not a chronological guarantee. Implement explicit date selection and a bounded backlog allocation, with tests.

## Architecture and policy

Existing AAR evidence → normalized observations → incident deduplication and pattern grouping → current-skill/root-cause inspection → proposed scoped patch → behavioral comparison and review → approved publication → pinned delivery → fresh-consumer verification.

### Evidence and recurrence

An observation links to exact source revision, supporting passage and, when available, the user correction or execution result. Model-extracted evidence references are not trusted until checked. Record uncertainty explicitly.

Group by failure mechanism, workflow and affected system, not just wording or storage repository. Multiple notes about one incident count once. Revised notes supersede previous observations instead of inflating recurrence. Model clustering proposes group membership; retain evidence and uncertainty so weak clusters cannot automatically qualify.

Proposed initial routing policy, subject to approval:

- One low-impact incident: retain evidence; normally no standing change.
- Two independent incidents sharing a mechanism: prioritize diagnosis and an evaluated patch proposal. This threshold is a practical starting policy, not a scientifically established constant.
- One explicit durable Lucas correction or serious reproducible defect: immediate review candidate; do not wait for repetition or auto-publish it.
- A model's unsupported explanation: hold as a hypothesis.
- Stale or changed evidence invalidates pending qualification until reconciled.

Track recurrence relative to applicable task opportunities when available. A quiet week with no relevant tasks is not proof of improvement.

### Target selection

Inspect the matching skill body, description and loader evidence before editing:

- Missing procedure: patch the existing skill.
- Useful skill not selected: fix discoverability/description or routing.
- Loaded instructions ignored: simplify, test a checkpoint or propose enforceable runtime changes.
- Broken runtime: hand off a separate code fix; do not hide it with prose.
- No existing owner and a reusable task family: propose one new skill after overlap review.
- Incident-only facts: keep in Muninn.

No broad new startup-memory layer. No automatic SOUL.md or AGENTS.md rewriting. Successful repeated workflows may qualify too, but v1 prioritizes supported failures and user corrections.

### Trust boundaries

The evidence reader cannot alter source AARs. A patch writer gets sanitized evidence and a disposable worktree; its allowed writes cover only the named skill payload. It cannot write graders, held-out cases, approval records, credentials, live runtime, deployment settings or permission policies. A path checker alone is not a security sandbox: use actual file/tool isolation for any autonomous execution. If unavailable, remain in reviewed proposal mode.

AAR prose and embedded web/tool text are untrusted data. Repetition does not turn malicious instructions into authority. Publication, deployment and external-action authority cannot be expanded by a learned skill. A different model is not, by itself, an independent trusted judge.

Raw traces, personal/company details, host identifiers and secrets stay private. Committed fixtures must be sanitized and inspected. Git/source diffs and secret scanners complement semantic review; they do not replace it.

## Implementation sequence (after design approval)

### 1. Establish evidence routing and recurrence

Files: extend `configs/volundr/aar_learning.py` and its test file for date-based selection and result categories; add `configs/volundr/aar_patterns.py` and `aar_patterns.test.py` for normalized observations, deduplication, grouping decisions and target classification. Keep the existing proposal ledger compatible; use a separate versioned pattern-state artifact, not invented Lucas approval fields.

First failing checks: two copies of one incident inflate counts; recent notes lose priority to pathname order; changed evidence retains qualification; non-AAR skips are mixed with genuine parse/provider failures.

Implementation: import existing candidate records without approving them; verify exact evidence pointers; record independent incidents, scope, severity, current coverage and root-cause status. Keep processing bounded and reserve a small backlog allocation. Quarantine invalid JSON/oversized sources visibly; never silently truncate or retry without limits.

Acceptance: fixture runs are deterministic and idempotent; copied/revised evidence does not increase recurrence; sensitive exclusions remain intact; retry and partial-failure counts are honest. No skill, guidance, source AAR or archive changes.

### 2. Turn one verified pattern into a scoped skill patch

Files: add `configs/volundr/aar_skill_review.py` and `aar_skill_review.test.py`; target an existing `volundr/skills/<selected-owner>/SKILL.md` only after current coverage review. This is one narrow workflow, not a new general orchestration platform.

First failing checks: a covered rule generates a duplicate; unrelated paths can be changed; stale base/source hashes are accepted; agent-produced text can masquerade as operator approval.

Implementation: create an evidence packet with base payload hash, selected owner, intended change, explicit non-goals and proposed checks. Stage one candidate in an isolated worktree, preserving any canonical pending work. Bind review/evaluation receipts to source, candidate, grader and fixture hashes. Stop on concurrent changes rather than resetting or merging others' work.

Acceptance: reject off-target writes, authority changes and stale evidence; distinguish skill content, trigger, enforcement and software defects. Compare existing coverage before creating a new skill.

### 3. Evaluate the first two pilots through real consumer paths

Files: add a small fixture-driven runner `configs/volundr/aar_skill_eval.py`, its test file and sanitized fixtures under `configs/volundr/fixtures/aar-learning/`. Reuse configured Hugi and Loki native launch paths rather than a toy prompt-only surrogate. Launcher-specific details and isolation must be qualified before any model run; do not modify the live gateway/profile to obtain a test.

Pilots:

1. Overnight health: a scheduler reports success while downstream writes fail. Expected behavior: report partial failure and name missing artifacts/delivery, not blanket success.
2. Deployment evidence: source or publication changed but the consumer revision is old. Expected behavior: distinguish staged/published/delivered/loaded/behavior-proven states.

Start with 4–6 cases per pilot: positive triggers, near-miss/non-triggers, a realistic failure fixture and a transfer case. Run baseline and candidate in fresh contexts on each target harness. Use repeated trials for model-sensitive checks; three trials is an initial diagnostic budget, not statistical proof. Record actual model/provider, skill hash, harness revision, tool traces, artifacts, elapsed time and usage.

Deterministic artifact/tool checks take precedence; independent rubric review handles residual judgment. Blind comparison may help but does not override failed checks. Freeze operator-reviewed safety tests and keep an untouched acceptance set away from the patch writer. Once a case's feedback is used for optimization it is development data, not an untouched holdout.

Acceptance: relevant defect reproduced or baseline limitation honestly recorded; candidate improves the target behavior without observed safety/regression failures or excessive unrelated triggering. If baseline already passes, do not claim uplift; assess removal/no-change instead. Failure, mixed evidence or no isolated runner blocks qualification. Tests do not send messages, publish, use credentials or mutate live services.

Cap candidate attempts and model spending before execution; stop at the cap rather than looping until green. Exact budget requires approval after dry-run cost estimation.

### 4. Review, publish and prove delivery

Reuse Volundr's existing reviewed maintenance record, manifest, validators and secret gates. Do not create a bypass or make a candidate its own trusted gate. Publication requires current Lucas approval. Retain an exact reviewed-file inventory and do not sweep others' pending edits into a change.

Then separately publish the approved config gitlink and use the existing signed-bundle delivery path. Verify current receipts and fresh skill loaders on both Hugi and Loki, including exact skill content hashes and routing. Unpublished local pins and Volundr main alone are not consumer adoption.

Acceptance: review is bound to exact evaluated payload; required repository checks pass; remote revision and published pin match their intended values; delivery receipt and fresh loader prove the selected version; one approved, non-destructive consumer scenario demonstrates the relevant behavior. A blocked host remains explicitly blocked, not closed as complete.

Rollback: preserve all evidence, stop new candidate generation using its separately approved control, and publish a forward revert with a new pin through the existing delivery mechanism if an adopted skill regresses. Do not rewind pins, restore old vault snapshots or re-enable retired writers.

### 5. Enable bounded recurring operation

Files: update `configs/volundr/loki_job.py`, its tests and `README.md` only where the qualified workflow needs integration. Treat installed wrappers and scheduler definitions as separately approved activation work; recover exact live definitions rather than inventing a replacement schedule.

Begin with a small shadow batch of historical patterns and at most one prepared patch per run. Keep source AAR generation on explicit request, archival disabled and startup supplements unchanged. A digest reports observations, distinct incidents, held/covered findings, patches, evaluation results, approval blocks, published pins and per-agent adoption.

Do not label proposal generation "agent improvement." A pattern closes only with consumption and relevant behavioral evidence; future recurrences reopen it.

After several reviewed cycles, Lucas may authorize a narrow low-risk publication policy. New skills, executable helpers, core instructions, trust policy, deployments and permissions remain separately gated unless explicitly authorized. The intended endpoint is not a permanent human bottleneck, but broader automation must be justified by measured review accuracy and reliable checks.

## Planned verification commands

Run only against fixtures/scratch state during implementation:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 configs/volundr/aar_learning.test.py -v
PYTHONDONTWRITEBYTECODE=1 python3 configs/volundr/aar_patterns.test.py -v
PYTHONDONTWRITEBYTECODE=1 python3 configs/volundr/aar_skill_review.test.py -v
PYTHONDONTWRITEBYTECODE=1 python3 configs/volundr/aar_skill_eval.test.py -v
PYTHONDONTWRITEBYTECODE=1 python3 configs/volundr/nightly.test.py -v
PYTHONDONTWRITEBYTECODE=1 python3 configs/volundr/automation.test.py -v
PYTHONDONTWRITEBYTECODE=1 python3 configs/volundr/loki_job.test.py -v
```

The three new test files are proposed, not present or passing yet. Native behavioral evaluations are a separate approved, costed step; Python unit success is not proof of model behavior. Volundr publication adds its existing `validate.py`, unittest and secret-gate requirements.

## Non-goals and approval checkpoints

No model training, framework replacement, broad prompt rewrite, automatic creation of AARs, automatic archival, unconstrained agent spawning or live-service experimentation. No installation of DSPy/GEPA/EvoSkill just to start this loop. Optimizer adoption is a later experiment only if a reliable evaluation set shows a need.

Checkpoints: approve this design → authorize local implementation and any bounded workers/model budget → review first evaluated pilot → separately approve publication/pin/activation → decide the scope of recurring automation. This document grants none of those permissions.

## Sources

[1] https://claude.com/resources/articles/improving-skill-creator-test-measure-and-refine-agent-skills
[2] https://www.anthropic.com/engineering/harness-design-long-running-apps
[3] https://openai.com/index/harness-engineering
[4] https://openai.com/index/building-self-improving-tax-agents-with-codex
[5] https://deepmind.google/blog/alphaevolve-a-gemini-powered-coding-agent-for-designing-advanced-algorithms
[6] https://www.letta.com/blog/skill-learning
[7] https://github.com/NousResearch/hermes-agent-self-evolution
[8] https://github.com/sentient-agi/EvoSkill
[9] https://github.com/neosigmaai/auto-harness
[10] https://raw.githubusercontent.com/NousResearch/hermes-agent-self-evolution/main/evolution/skills/evolve_skill.py
[11] https://raw.githubusercontent.com/NousResearch/hermes-agent-self-evolution/main/evolution/core/fitness.py
