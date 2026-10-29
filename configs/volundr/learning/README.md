# AAR procedural learning

Source-only implementation of AAR evidence → reviewed patterns → scoped skill
candidates → evaluation → operator review. There is no autonomous publication,
activation or model invocation in the cycle command. Muninn stores evidence and
handoff notes; Volundr owns reviewed reusable procedures.

## Components

| Component | Contract |
| --- | --- |
| `extract.py` | Bounded candidate extraction; private external state; no vault writes |
| `patterns.py` | Current-source/skill evidence checks, recurrence and diagnosis |
| `review.py` | Hash-bound existing-skill body diff; no writes or approval |
| `evaluate.py` | Captured-run comparison; failed calls never count as answers |
| `cycle.py` | Connect reviewed findings and supplied candidates; preserve immutable receipts |
| `cron.py` | Private extraction receipt, count-only output and honest partial-failure exit |
| `evaluate_hermes.py` | Explicitly budgeted native scratch-profile evaluation only |
| `fixtures/pilots.json` | Public development cases, never an untouched acceptance set |
| `tests/` | Fixture-only tests, including actual transport and CLI boundaries |

Hugi's native evaluation runner remains under `configs/pi/` because it imports
that harness's SDK. Its startup hook consumes installed skills rather than
`tech/learning/*` lesson supplements. A Muninn handoff in that folder is historical
implementation evidence, never automatically promoted instructions.

## Entry points

From `configs/volundr/`:

```sh
python3 -m learning --help
python3 -m learning extract --config /private/extraction.json
python3 -m learning cron --config /private/extraction.json
python3 -m learning cycle --vault /private/vault --state /private/aar-state \
  --skills /private/volundr --findings /private/reviewed-findings.json \
  --candidates /private/candidate-files.json
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s learning/tests -v
PYTHONDONTWRITEBYTECODE=1 python3 learning-layout.test.py -v
```

The findings array's fields and evidence rules are in `patterns.py`. Candidate
files are a JSON object mapping an existing skill target to an absolute private
candidate path. Do not supply a shell command, approval token or model-authored
review reference. At most three supplied candidates are allowed per cycle.

For `loki_job.py learning`, an explicitly configured private
`learning_cycle_config` names JSON with exactly `mode`, `vault`, `state`, `skills`,
`findings` and `candidates`; paths must be absolute and mode must be
`reviewed-inputs-only`. This adapter is opt-in; no scheduler is created.
The config cannot establish trust merely by calling itself reviewed. An operator
must inspect the supplied findings and incident identities first.

## Receipts and safety

A successful cycle rechecks exact source hashes, evidence quotes and target skill
bytes. It writes `cycles/<sha256>.json` and an atomic `last-cycle.json` pointer in
external private state. Repeating unchanged input reuses the identical receipt;
changed or invalid evidence cannot overwrite the last good pointer. Public/job
output contains only counts and status, not note paths or diff text.

The cycle does not edit the canonical skill, source AAR, Muninn index or live
profile. A receipt hash establishes integrity, not who reviewed it or whether a
patch is safe. Semantic review, native behavior/trigger checks, publication,
config pin, delivery and fresh-consumer verification remain distinct gates.

For a future approved producer migration, `python3 -m learning cron` preserves raw
extraction results only in external private run receipts and prints a single
count/status JSON line. Unexpected errors expose only their type; partial failure
and attempted guidance/skill/archive mutation fail closed. CLI subprocess tests
exercise the disabled and malformed-config paths without model calls. This is a
replacement entrypoint, not an installed or scheduled job.

The root compatibility adapter supports existing `aar_learning.nightly` wrappers.
Legacy promotion and direct-filesystem archival are intentionally absent. Copying
that shim without `learning/` is an incomplete migration. Do not run the historical
full installer or revive Dreaming to activate this package.

See [`STATUS.md`](STATUS.md) for current verification,
failed experimental runs, private evidence locations and open deployment gates.
