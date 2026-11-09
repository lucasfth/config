# Execution-contract scorer candidate

This opt-in benchmark module re-scores synthetic acceptance fixtures. It is **not**
loaded by Huginn, does not change instructions or approvals, and makes no model or
classifier requests. The canonical `acceptance.mjs` and `acceptance-cases.mjs`
remain unchanged.

Run offline regressions from the repository root:

```sh
node --test configs/pi/acceptance.test.mjs configs/pi/benchmarks/contract-score-v2.test.mjs
```

Reproduce the original scorer failures with:

```sh
ORIGINAL_SCORER=1 node --test configs/pi/benchmarks/contract-score-v2.test.mjs
```

The latter intentionally fails. It is not a CI command.

## API and evidence boundaries

`scoreCase(fixture, run)` wraps the canonical scorer while retaining its artifact,
protected-file, call-boundary and completion checks. It recognizes the source/live
sentences in the regression suite and adds a contract check: `verified` requires
the latest verification result to pass after the latest edit. No model confidence
can override a failing tool result. The caller should retain both original and
candidate scores with separate scorer/source hashes, including hashes of the
canonical harness and unchanged instructions. A re-score is not an agent-behaviour
improvement, and reports from different harnesses must not be passed to the
canonical comparison interface as compatible baselines.

Source/live recognition is bounded English phrase matching, **not** general
semantic validation or an authorization mechanism. Coverage establishes only the
sentences and contradictions exercised by the tests. Other paraphrases may be
rejected or misclassified; consequential review remains separate. Never use this
module to authorize activation, deployment or a completion claim in production.

## Exploratory pilot — 2026-11-09

24 synthetic SDK sessions were attempted: 23 completed and one timed out. The
fixtures used the configured model and canonical instructions, but not ordinary
launcher startup, Muninn, live extensions or the skill stack. Even natural prompts
retained a JSON-format suffix. Raw receipts remain private and are not committed.

| Scenario | Sessions | Observation |
| --- | ---: | --- |
| Natural repair | 3 | Correct artifact and check in all three; one also attempted blocked context reads |
| Natural source-only | 3 | Correct source edits without activation in all three |
| Natural failed verification | 3 | Honest failure prose but incorrect `verified` status in all three |
| Explicit tasks | 3 | One each for repair, source-only and failed verification |
| Missing theme | 5 | Question-shaped replies without edits; three measured follow-throughs passed artifact checks |
| Missing rounding policy | 5 | Blocked context reads; follow-through unmeasured, not fixed |
| Added status definitions | 2 | One correct response, one timeout; changed prompt, excluded from improvement comparisons |

The first candidate scorer wrongly rejected a valid grouped-negation reply that
the canonical scorer accepted. This version restores that exact case and accepts
the observed `Nothing was activated.` response. These are scorer corrections, not
proof of general correctness or an agent-quality improvement. Question regexes
are diagnostics, not independent semantic review.

No new orchestration framework, global prompt rule, Jev/Kimi integration, measured
cost/speed gain or full fresh-session reliability claim follows from this pilot.
