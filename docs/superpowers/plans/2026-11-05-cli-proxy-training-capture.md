# CLIProxyAPI training capture implementation plan

Approved design: `../specs/2026-11-05-cli-proxy-training-capture-design.md` (Lucas approved proceeding on 2026-11-05).

## Scope and architecture

Implement a bounded, fail-open HTTP capture package, private local spool and standalone SSH archive utility. Source ownership is Config under `configs/cli-proxy-capture/`; a small reproducible overlay targets CLIProxyAPI v8.0.35 (`ae3ee3be303fb07fb8173279923413005bf32177`). Leave the newer `../CLIProxyAPI` branch untouched. Isolated target worktree: `.worktrees/cli-proxy-capture/` (ignored by Config).

No training job, provider migration, Usage Keeper queue consumption, automatic pruning, new public listener, commit or deployment is included. Capture all supported authenticated HTTP inference paths; enumerate WebSocket/realtime and direct sidecar gaps explicitly. Do not claim complete all-protocol coverage until those gaps are implemented and exercised.

## Baseline and setup

- Official tag was fetched and an isolated detached worktree created; HEAD is the expected release SHA.
- Existing middleware request-logging tests pass on the unmodified release.
- The default workstation compiler resolves to a Nix cc missing `-lresolv`; selecting `CC=/usr/bin/clang` corrects the environment without source changes. Commands that link the proxy use that explicit compiler.
- Scoped baseline command: `CC=/usr/bin/clang go test ./internal/api/middleware ./internal/api -run 'TestAuthMiddleware|TestRequestLogging' -count=1`. Middleware passes; the API package has no matching tests. Run its full suite before accepting integration.

## Task 1 — schema, credentials and private segments

Create `configs/cli-proxy-capture/go.mod`, `internal/trainingcapture/{record.go,scrub.go,spool.go}` and corresponding tests. Use the serving module path and its existing dependencies; no newly selected external library. Core archive operations use the standard library.

Red check: write a synthetic record containing a JSON-escaped provider key and bearer token, persist it, decompress/read it back, assert typed replacements, replacement counts, no original keys, exact non-secret Unicode text and 0700/0600 modes. Initially fails because package is absent. Implement versioned record, recursive JSON string scrubbing and stream-aware SSE payload scrubbing. Unsupported opaque body types must be marked omitted rather than persisted without credential handling.

Segments are immutable gzip JSONL, sealed at five minutes or 64 MiB uncompressed. Enforce 100 GiB disk cap and 50/55 GiB free-space pause/resume thresholds, using injectable filesystem probes/clocks for deterministic tests. Private temporary files, manifests with SHA-256/length/count, fsync before publish, path validation and symlink refusal are required. Recover/quarantine open crash leftovers without presenting corrupt records as complete. Never remove unshipped segments to admit new ones.

Verification: `cd configs/cli-proxy-capture && go test ./internal/trainingcapture -count=1`; small injected quotas/space floors, corrupted-tail, short-write, existing-path-mode and symlink fixtures. Keep all fixtures in temporary directories.

## Task 2 — fail-open capture and serving-release integration

Add `internal/trainingcapture/{capture.go,middleware.go}` and tests, plus `configs/cli-proxy-capture/overlay/internal/api/training_capture.go` and a pinned integration patch. Expose `New`, `Middleware`, `Close` and counters; exact signatures are specified by package tests before call-site integration.

Use a process-wide byte budget and 64 MiB per-interaction bound, covering requests and responses simultaneously. Never block on worker I/O or queue availability. Tee reads without pre-reading or changing errors; forward response writes/flush/status unchanged. Deep-copy only within reserved memory; retain stream write boundaries and cancellation/completion metadata. Release reservations only when the worker no longer owns the buffers. Saturation, filesystem failures and worker panic must not break inference; mark losses through counters without logging bodies.

Hook after successful access authentication by wrapping the existing `AuthMiddleware` result and installing the capture in its `c.Next()` chain. Exclude management/OAuth/credential endpoints and unauthenticated failures. In v8.0.35, `userApiKey` contains a credential: never persist it as a client label; use only configured non-secret labels or `unknown`.

Enable through a startup environment setting, default disabled. Use one server-owned collector with explicit stop/flush lifecycle. Capture initialization errors disable capture, not the server. Avoid imposing any deadline on upstream inference. Existing request-body error logs are a separate legacy surface; disclose rather than claim this change sanitizes all stock logging.

Red/green checks: `httptest` authenticated mock routes with SSE tools and exact client byte comparison, reader/write errors, canceled context, full queue, blocked sink, oversize, panic, unsupported upgrades and secret split across transport writes. Record protocol gaps; no WS hijack interception without a separate exercised implementation.

Apply overlay only to the isolated release; run gofmt, `CC=/usr/bin/clang go test ./internal/trainingcapture ./internal/api`, middleware tests, race tests, and required `CC=/usr/bin/clang go build -o test-output ./cmd/server && rm test-output`. Isolated build output is not deployment.

## Task 3 — verified receiver and 15-minute shipper

Create `internal/trainingcapture/archive.go`, tests and `cmd/trainingarchive/main.go`. A receiver reads one length-bounded segment and manifest through stdin, never shell-selected arbitrary paths. Verify UUID-like segment basename, SHA-256, compressed length, bounded gzip expansion, JSONL schema/count, fsync file and destination directory and atomically finalize before returning a matching receipt. Idempotent repeat verifies the existing archive; conflicting IDs fail closed.

Shipper reads sealed files only, takes a non-blocking process lock, invokes a fixed SSH receiver with strict host-key checking, BatchMode and a bounded job timeout (separate from inference), validates the exact receipt and only then deletes the source plus manifest. Always retain originals on remote error, bad receipt, timeout or partial delivery. Keep transfer output free of bodies/credentials. No `--remove-source-files` shortcut. No copy of broad identities to Neo.

Red/green checks: real local receiver subprocess with synthetic gzip segments, repeated upload, mismatched checksum, existing ID conflict, missing/forged receipt, lost ack, malformed/oversized input and partial writes. Fake SSH only at the transport boundary; exercise actual command stdin/stdout and return codes. Verify deletion/non-deletion and ownership/modes.

## Task 4 — reproducible build, scheduler source and runbook

Create `configs/cli-proxy-capture/{README.md,build-candidate.sh,com.lucas.cliproxy-capture-ship.plist.example}` and safe example configuration. Build helper refuses unexpected release SHA or dirty target paths; applies only capture overlay and the minimal patch. Never changes active symlinks or launchd state.

Document Neo's proxy-user state root, explicit 900-second launchd schedule, Freyr private archive ownership, pinned host key and restricted receiver authorization. Keep exact host/account configuration operator-supplied rather than inventing deployment ownership in Nix. Explain backup gap after Neo deletion and unknown at-rest encryption.

Run CLI help, shell syntax, local build, Linux cross-build for receiver and macOS candidate build. Document measured tests, coverage gaps and counters. Verify all specified quotas and scrub markers in fixture records.

## Task 5 — local acceptance and deployment handoff

Run the actual isolated proxy through its ordinary constructor and a mock upstream with capture enabled/disabled; compare discovery and streamed chat/tool semantics. Exercise disabled capture and failure injection. Benchmark identical fixture requests and report measurements only if collected; do not claim zero overhead.

Run independent aggregate verification: core tests, race tests, relevant upstream tests, required full compile, archive command E2E, permissions, diff checks and manifest provenance. Preserve failures as failures, not skipped passes.

Deployment remains blocked pending explicit approval: preflight live model/provider inventory and Neo-to-Freyr SSH, back up configuration, stage candidate/receiver and restricted credentials, install timer, approve/drain proxy restart, switch and verify public discovery/chat/tools plus actual scheduled transfer and rollback readiness. Rollback selects immutable 8.0.35 known-good binary and disables capture/timer without deleting backlog. No activation or restart in the local implementation phase.
