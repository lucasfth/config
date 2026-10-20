# AAR learning and startup context

## Goal and boundaries

Loki distils session notes into evidence-linked proposals. Only explicit Lucas
approval promotes a proposal into supplemental startup guidance. Preserve mandatory
rules, project scope, original evidence, and unresolved obligations. Never give
model output authority to approve itself. No commit, push, service restart or
real-AAR archival is implied by fixture verification.

## Architecture

- `configs/volundr/aar_learning.py`: bounded source discovery, tool-free model
  distillation, validation, proposal/diff storage, explicit approval/rejection,
  processed-source ledger, archive dry-run and reversible archive moves.
- Supplemental approved notes have fixed paths under `tech/learning/`; candidates
  stay under `dreams/aar-learning/` and cannot be loaded by the startup hook.
- `configs/pi/extensions/muninn.ts`: retain mandatory context, fetch only the
  general and exact repository approved supplements, bound their size, and omit
  generated legacy correction tables from startup text. Raw originals remain
  available through recall. Project evidence is labelled as historical data.
- A separate `aar_learning.py nightly` entry point uses explicit fail-closed
  configuration. `dream_guard.run_dream` can invoke it under the existing lock;
  today it only consolidates skill evidence and runs the old dream script.
  There is no repository `volundr_dream.py`: it is generated on Loki.
- Archival requires age >=30 days, unchanged source hashes, recorded review of
  obligations, and durable proposal dispositions; archive location stays under
  `projects/` so recall still works, but outside active session indexes.

## Slices and checks

1. Separate locally runnable Python and Pi tests: candidate produces a guidance
   diff against a fixture existing note, cannot appear as approved guidance, and
   the fixture VaultClient startup path excludes it. Keep live hooks/jobs unchanged
   during this initial slice. Test red before implementation.
2. Add validated per-source model proposals, explicit digest-bound approval and
   rejection, approved-note rendering, and factual open-items review. Test model
   approval spoofing, invalid paths, edited source, failed model, and cross-project
   separation. Preserve source paths and hashes; branch is evidence metadata.
3. Add archive planning and apply against fixture copies only. Test pending review,
   edited sources, unresolved items, destination collision, repeat runs, symlinks,
   non-AAR files, and interrupted moves. Never discard by age alone.
4. Extend exported context builder and real before_agent_start hook. Unit fixture
   tests plus a fresh SDK session/provider-request capture prove loaded context,
   no candidate leak, bounded optional failures and archived-index exclusion.
5. Prepare nightly wrapper configuration, docs and rollback policy. Live installation
   is blocked on explicit activation approval after fixture evidence is presented.
   Do not reinstall Volundr or run the full dream. Report source, deployed and
   fresh-session proof separately. Real archival stays disabled pending passing
   fixtures and review of a live dry-run. Mac tests are separate from the skipped
   Android-only install suite.

## Acceptance and non-goals

A new source produces a reviewable proposal, not a rule; an explicitly approved
proposal appears at the next startup in only its intended scope. A rejected or
stale proposal cannot load. Archival preserves raw bytes, source provenance and
open obligations. Failures leave source notes and existing guidance untouched.
No model training, automatic security/identity rewrite, new dependencies,
branch-inferred affected-system attribution, or claim of measured behavioral
improvement. Existing large guidance documents are not comprehensively rewritten.
