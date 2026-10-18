# Pi discovery and cache diagnostics

**Goal:** Adopt two bounded jcode-inspired improvements without adding services, dependencies, or changing live sessions.

**Design:** A deferred `source_outline` tool uses the existing optional TypeScript parser lazily to enumerate named JS/TS declarations and member ranges. It accepts one workspace-relative file, rejects escapes/symlink escapes and files over 256 KiB, caps results at 200 symbols, and points callers to anchored `read`. It does not claim cross-file references or support Vue/Python/Rust. Missing TypeScript produces an actionable tool error, never an extension-load failure.

A passive `cache-report.ts` extension records only whether explicit raw-provider cache-usage fields appeared, keyed by provider/model/response ID and bounded to 20 IDs. `/cache-report` joins those flags to existing branch assistant usage; no prompt fingerprints, miss calculation, headers, credentials or raw payloads are retained. Missing or unattributable zero counts remain unknown. Positive normalized counts remain evidence. Reports use UI notifications when available and stdout otherwise, without model calls or context injection. Pi's native miss notices and compaction handling are unchanged. ID-less deltas, nested summary/advisor usage and cache warming are outside scope; no potentially ambiguous stream-ID fallback is attempted.

**Trade-offs:** Agentgrep would add a native binary/install path; full semantic indexing would add state and dependencies. A one-file JS/TS outline is narrower but deterministic and sufficient for our main application code. Provider-neutral normalized usage cannot distinguish absent counters from explicit zero, so raw-event presence gates reporting. No cost savings, miss attribution, or speed improvement is claimed.

## Execution (inline; no commits or deployment)

- [x] Write failing cache tests for absent versus explicit zero telemetry, usage shapes, same-model nested responses, repeated start events, unknown IDs, output bounds, reset and non-UI reporting.
- [x] Implement the bounded raw-field observer and wire it into generated source settings; do not inspect prompts or override native notices.
- [x] Write failing outline tests for declaration/member ranges, TSX/JS, output limits, unsupported files, outside-root symlinks, oversize files, cancellation and absent parser.
- [x] Implement lazy parser tool and wire it into source settings. Preserve existing grep/search behavior.
- [x] Exercise real SDK registration and deterministic loopback provider transport, including `/cache-report`, with synthetic credentials and isolated temporary state.
- [x] Run `npm run typecheck`, `npm test`, targeted integration scripts and `git diff --check`; inspect the final diff for security, lifecycle and consumer-contract errors.
- [x] Update root/profile README, parity and command references; report source versus live acceptance limits. No live reload, runtime preparation against the real profile, dependency installation, service changes, commit or push.

## Verification

Final typecheck and all 71 tests passed. `npm run verify:integration` passed with exit 0 on the first complete run (480-second command timeout). The initial attempt exceeded its 240-second limit before condensation/compaction completed; use a longer timeout for the full gate. Both terminal/UI regression fixtures and the new deterministic discovery SDK fixture ran. Condensation and compaction also passed individually. `git diff --check` passed. New-tool terminal appearance and live-provider telemetry were not verified. No activation occurred.
