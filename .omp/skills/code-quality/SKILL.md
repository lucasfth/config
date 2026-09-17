---
name: code-quality
description: Use when a user requests a semantic review of a non-trivial code change for security risks, consumer-contract regressions, or inadequate behavioral test evidence.
---

# Code Quality Review

Use Jev for semantic evidence—not as a universal quality score or a replacement for types, tests, linters, LSP diagnostics, or human review. Run only when requested; never make it an automatic completion gate.

## Collect review state

1. Read the exact diff, affected source sections, relevant callers, project policies, and actual validation output.
2. Exclude secrets, generated files, unrelated history, and guessed test results.
3. If a required fact is unavailable, state that gap rather than inventing it.

Read the `typesafe-ai` skill, then send one `jev-latest` request to `POST https://api.typesafe.ai/v1/systemone` using `TYPESAFE_API_KEY`. Keep credentials out of the request state and output. Batch these independent Noul questions over this structured state:

```json
{
  "security": {
    "type": "noul",
    "instructions": "Does the changed behavior plausibly allow an unauthorized operation, cross-boundary data disclosure, secret exposure, or unsafe destructive scope? Judge only from the supplied diff, code, policies, and evidence.",
    "criteria": {
      "true": "A concrete security or isolation regression is plausible.",
      "false": "The supplied evidence does not indicate such a regression."
    }
  },
  "contract": {
    "type": "noul",
    "instructions": "Does the changed behavior plausibly violate a caller-visible contract, including authorization, validation, errors, return values, migration cutovers, or documented invariants? Judge only from the supplied state.",
    "criteria": {
      "true": "A concrete caller-visible regression is plausible.",
      "false": "The supplied evidence does not indicate such a regression."
    }
  },
  "test_evidence": {
    "type": "noul",
    "instructions": "Does the supplied test evidence fail to demonstrate a changed observable behavior, boundary, or real error path that the code contract requires? Judge only from the supplied state.",
    "criteria": {
      "true": "The evidence leaves a concrete required behavior unproven.",
      "false": "The supplied evidence covers the material changed behavior."
    }
  }
}
```

## Report

Always report the raw Noul probability for **all three** dimensions. For each concrete finding supported by the state, also provide the exact diff or evidence it relates to, the consumer-visible consequence, and the smallest source fact or behavioral test that could resolve it. Label every other dimension **no finding from this review**, never as proof of safety. Do not apply universal thresholds: calibrate any future enforcement on representative project data.

If the credential, API, or evidence is unavailable, report **review skipped** with the reason. Never convert a skipped review into a pass. Never auto-edit, merge, block, or approve a change from this result.
