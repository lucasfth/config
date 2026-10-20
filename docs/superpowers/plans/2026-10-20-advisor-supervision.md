# Advisor supervision without feedback loops

Approved scope: retain continuous supervision and repeat warnings for serious unresolved issues, without routine waits or autonomous reply chains.

## Implementation

1. Add regression tests in `configs/pi/extensions/advisor.test.ts` for concern/nit delivery without automatic continuation, blocker interruption, one interruption per user/tool-activity interval, abort handling and unrelated-message passthrough. Implement the delivery guard in `configs/pi/extensions/advisor.ts`.
2. Extend the tracked `configs/pi/patches/pi-omplike-advisor+1.0.2.patch`: deliver reviews asynchronously without the `runTurnBlock` catch-up wait; add stable issue identifiers and evidence to the private advise tool. Deduplicate reworded findings by issue. Permit repeated blockers after new primary activity and changed concrete evidence; preserve severity escalation. Tighten the supervisor prompt: no status messages or invented approval gates, user-accepted trade-offs respected. Apply through the existing idempotent `setup.mjs`, not hand-edited installed dependencies.
3. Exercise the real extension and Pi 1.3.0 session with a deterministic loopback provider: idle routine advice remains in the next user prompt, routine findings cannot restart a finished agent, blockers can request a corrective continuation, and advisory-only replies cannot create a loop. Run focused tests, typecheck, existing tests and SDK integration.

## Boundaries

No new dependencies, publication, service restart, live provider requests or profile activation. Preserve unrelated working-tree changes. Source changes require extension reload/new session before affecting an already-loaded advisor. Loopback checks prove transport/control flow, not live model judgment quality.
