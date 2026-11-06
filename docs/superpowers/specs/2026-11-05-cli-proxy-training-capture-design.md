# CLI proxy training-data capture

Status: proposed design for Lucas's review. Research and read-only host checks completed; no capture code, service activation, proxy restart or provider change performed.

## Goal and agreed constraints

Capture all inference clients passing through Neo's CLIProxyAPI for later dataset curation and model fine-tuning/distillation. Preserve personal/internal conversation content without anonymization. Logging must fail open: capture failure must not become an inference error or wait for storage/network recovery.

Write locally on Neo and attempt transfer to Freyr every 15 minutes. If transfer fails, retain the local backlog and continue capture while its safe storage budget allows. Delete local data only after verified durable receipt. Do not automatically erase old unshipped data to admit newer data.

This is a capture/archive project, not an automatic training pipeline or an observability-dashboard replacement. Keep Usage Keeper and its consuming usage queue untouched. Service deployment and any proxy restart require separate current approval.

## Observed state, 2026-11-05

Read-only SSH checks established:

- Neo's serving symlink selects CLIProxyAPI 8.0.35. Its proxy LaunchAgent reports PID 54950 and last exit status 0.
- Neo's home filesystem reports approximately 270 GiB available; Freyr's home filesystem reports approximately 606 GiB available. These are filesystem snapshots, not reserved capacity or a backup guarantee.
- Freyr provides rsync and sha256sum.
- The local CLIProxyAPI checkout is clean at fc430f1, but is not established as the source of the installed 8.0.35 binary. Its logger and plugin APIs are research leads, not proof of deployed compatibility.
- Inspected stock logging code requests 0644 files and 0755 directories. Do not enable it as the training-data solution as-is.
- The readable vault documents native Jev sidecar traffic bypassing the proxy. A proxy-only capture cannot claim coverage of that path or of clients using direct providers.

No claim is made yet that Neo can authenticate to Freyr: both machines were reached separately from the operator's workstation.

## Six practitioner sources and resulting requirements

These are named practitioners' own posts, not six product marketing pages. The implementation choices below are our synthesis, not claims that these authors prescribe this particular spool or shipper.

| Practitioner and post | Relevant guidance | Requirement derived here |
| --- | --- | --- |
| Hamel Husain, Your AI Product Needs Evals | Linked traces support evaluation; human-editable outputs can become curated fine-tuning examples.[1] | Keep full interaction context and stable IDs. Store corrections/labels separately from the captured original. |
| Simon Willison, Language models on the command-line | His LLM tool logs prompt/response history and links follow-ups into conversations.[2] | Retain request/response pairs, model metadata and conversation linkage; support later search/export. |
| Eugene Yan, How to Generate and Use Synthetic Data for Finetuning | His survey describes filtering invalid and similar examples before training.[3] | Separate collection from training selection. Preserve provenance and hashes for later quality filtering and deduplication. |
| Jason Liu, Data Flywheel Go Brrr | Useful feedback and objective-driven data collection are central to the improvement loop.[4] | Make feedback, correction and measured task-outcome annotations joinable to captures. An HTTP 200 is not a success label. |
| Chip Huyen, Common pitfalls when building generative AI applications | AI judges require evaluation and should be supplemented by human evaluation.[5] | Preserve human/model/test label provenance and evaluator versions; do not automatically accept teacher outputs as correct. |
| Sebastian Ruder, The Evolving Landscape of LLM Evaluation | Memorization, benchmark contamination and overfitting can undermine apparent improvements.[6] | Keep evaluation holdouts separate; split by related task/session and deduplicate across splits, not by random API rows. |

## Architecture

### 1. Narrow capture hook in Neo's proxy

Observe authenticated client-facing inference traffic without inserting another reverse-proxy hop. Separate capture from diagnostic logging and from Usage Keeper. Do not instrument management, login, credential-refresh or dashboard endpoints as training examples.

The request/response path may copy bounded bytes and attempt a non-blocking enqueue. It must not perform capture filesystem writes, compression, SSH, retries, waits for queue capacity or collector acknowledgement. A background capture worker owns persistence. Use a byte budget as well as an event-count budget; a bounded channel alone does not bound memory. Requests, responses and errors returned to clients must never be changed by capture logic.

Before choosing an SDK logger, middleware hook or plugin, inspect the exact installed-release source and prove coverage of the deployed inference protocols. Do not transplant APIs from the newer local checkout. Prefer supported extension points; if a minimal source patch is required, build an isolated candidate pinned to the serving release and retain the known-good binary. Installing an unrelated plugin or upgrading the whole proxy is not implicitly authorized.

An in-process hook cannot offer absolute crash isolation from the proxy. Keep the hook small, isolate worker errors/panics, bound allocations, and prove fail-open behavior with fault tests. A hard guarantee against arbitrary in-process bugs would require a different isolation boundary; do not advertise such a guarantee.

### 2. Private local spool on Neo

Under the proxy user's private state directory, use a dedicated capture subtree with:

- open segments for the writer;
- immutable sealed segments eligible for transfer;
- compact delivery receipts and operational counters.

The proxy service user owns this subtree. Directories are 0700; every data, manifest, temporary and receipt file is 0600. Set a restrictive umask, enforce modes on existing paths and reject symlink escapes. Do not put capture bodies in stdout/stderr, Git, Muninn or general application logs.

Use versioned JSONL event records in gzip-compressed segments. Raw payload byte fields use a reversible representation rather than assuming UTF-8. Seal at least every five minutes or 64 MiB of uncompressed payload, whichever comes first; idle segments need not produce empty archives. Only the single writer modifies an open segment. The shipper never uploads an actively written segment.

Proposed initial budgets, subject to preflight readback:

- Local spool cap: 100 GiB total on-disk capture state, including temporary files.
- Minimum filesystem available space: 50 GiB. Pause capture at either limit; resume after backlog removal and at least 55 GiB available.
- Capture memory budget: 256 MiB total, including in-flight assembly and queueing; maximum 64 MiB captured payload per interaction. Oversized or capacity-limited captures are explicitly incomplete/dropped, never silently presented as full records. Do not reject or truncate the actual inference request or response.

Enforce admission reservations across concurrent captures. Recheck free space as writing progresses; compression and shipping must also stay inside the budget. Other processes can consume disk concurrently, so the floor is a guard, not a filesystem reservation. Handle ENOSPC and short writes regardless of prechecks. Retain already captured unshipped segments rather than deleting them to admit new traffic.

A crash can lose memory-buffered events or the unfinished tail of an open segment. On restart, recover valid records where possible and quarantine/mark damaged tails. Never count attempted enqueue as durable capture. Record restart boundaries and distinguish enqueued, persisted, archived and dropped data.

### 3. Fifteen-minute transfer job

Run a separate shipper job on Neo every 900 seconds; user-login scope/sleep may delay actual execution. Use a single-run lock, bounded transfer duration, one transfer stream and low priority. Skip overlapping runs. Capture does not depend on this job running or on Freyr being reachable.

Use authenticated SSH with pinned host verification and a dedicated restricted receiver key where practical. Do not copy an existing broad SSH identity to make the connection work. Verify Neo-to-Freyr connectivity separately before enabling transfers. No new public listener or remote-mounted inference directory is required.

For each sealed segment:

1. Create a manifest with immutable segment ID, schema version, SHA-256, byte length and record count.
2. Upload to a private temporary filename on Freyr. Partial uploads are not archived records.
3. On Freyr, verify SHA-256, byte length, gzip integrity and record framing/count. Treat a conflicting existing ID/hash as an error, not permission to overwrite.
4. Finalize with atomic rename on the destination filesystem, flush the file and directory, then persist a matching receipt. A receipt is evidence only after these operations succeed.
5. Neo verifies the receipt matches its exact sealed file. Only then remove that local segment and persist delivery state.

Retries are idempotent. A lost acknowledgement after successful upload must not create duplicate archive segments or destroy the local copy prematurely. Never use rsync's source deletion option alone as proof of durable receipt. A Freyr outage, full disk, quota, permission error, interrupted transfer or checksum mismatch leaves Neo's original intact.

### 4. Freyr archive

Use a dedicated private archive directory on Freyr's verified local data filesystem, organized by capture date and source instance. The receiving account owns it with 0700 directories and 0600 files. Retain sealed captures without automatic age deletion until Lucas approves a retention policy. Monitor capacity; full archive storage is a transfer failure, not permission to prune training data.

Freyr is the archive destination, not a second backup after Neo deletes its acknowledged copy. A separate approved backup policy is needed if protection against Freyr disk loss is required. Encryption-at-rest status remains to be verified rather than assumed from Tailscale/SSH transport encryption.

## Capture schema and completeness

Store an append-only, versioned event envelope with:

- Source-instance ID, proxy version/build, capture version, unique interaction ID, timestamps, monotonic duration and event sequence.
- Endpoint/protocol and direction; request ID, response ID and upstream-attempt linkage where exposed.
- Client label from authenticated configuration, never the raw key. Shared credentials cannot uniquely identify agents; record unknown rather than inventing a client identity.
- Explicit client conversation/session/parent IDs when supplied. Mark inferred linkage separately; never merge sessions merely because they share a client key or similar prompts.
- Original client request payload: roles, system/developer messages, all supplied context, tool definitions, tool arguments/results, sampling/output settings and multimodal blocks as observed.
- Ordered response payload/events: content blocks, streamed tool-call deltas, usage, finish reasons, errors and terminal markers. Store what was actually exposed to the client; do not claim hidden model reasoning or teacher logits exist.
- Requested model alias, reported response model, and resolved upstream/provider/model only when independently observable. An alias or provider response field is not proof of an exact teacher checkpoint. Preserve retry/fallback attempts without relabeling them as the requested model.
- Capture completeness, missing-event/byte counts where measurable, cancellation, parse errors, restart/truncation/drop reasons and credential-scrub metadata.
- Payload hashes with their stage identified: captured post-scrub payload hash versus shipped compressed-segment hash. Never conflate those identities.

Retain wire-level payload/events plus a derived normalized conversation view on Freyr. Protocol parsers and dataset exports can change without overwriting the archive. Record parser versions and derivation lineage. Do normalization, indexing, semantic deduplication and training conversion off the inference path.

Do not fetch external attachment URLs automatically. A referenced image/audio/document is not archived content unless its bytes crossed the proxy and were successfully captured. Mark unresolved references and unsupported transports explicitly. WebSocket, native Anthropic/OpenAI/Gemini routes and sidecar bypasses require a coverage inventory; unsupported paths must be reported, not quietly included in an all-traffic claim.

## Credentials are separate from anonymization

No personal/internal content anonymization is planned. Exclude original authentication headers, cookies, full query strings and upstream auth/config blobs entirely; preserve only an explicit safe transport metadata allowlist.

Proposed narrow exception for review: replace recognized bearer tokens, proxy key patterns and provider API-key patterns appearing in bodies with a typed credential marker before any capture persistence. Record scrubber version and replacement counts, never secret values or reversible originals. Preserve all other content. Apply this only to the capture copy, never the live request/response.

Scrubbing must handle secrets split across stream chunks and inside JSON-escaped strings. Buffer within the stated byte budget or abandon/mark that capture if safe scrubbing cannot be completed; never spill an unsanitized body to disk as a workaround. Pattern matching is not a guarantee of finding every credential, so the archive remains highly sensitive.

## Later training use

Capture is not automatic dataset admission. On Freyr, derived datasets may:

- reconstruct valid tool trajectories and distinguish repeated prompt prefixes from new assistant targets;
- select completed, useful examples using human review, tests and calibrated model judgments;
- keep failures for evaluation or explicit negative/preference examples, not as unlabeled gold responses;
- attach corrections, chosen/rejected pairs, task outcomes and evaluator provenance without modifying originals;
- mask loss on user/system/tool context where appropriate for the chosen training recipe;
- deduplicate and group related tasks/sessions before train/validation/test assignment;
- track capture IDs, transformation versions, model provenance and usage eligibility in each dataset manifest.

A proxy cannot reliably observe terminal task success, local tests, human acceptance or tool outputs never sent back to the model. Outcome annotations require client-side instrumentation or later review. They remain unknown until evidence is supplied. Internal capture approval is not evidence about teacher-provider training rights; preserve provenance and check eligibility at dataset promotion.

## Acceptance tests before activation

- Mock-upstream streamed/non-streamed conversations, parallel tools, split tool arguments, long context, malformed SSE, cancellation and upstream errors. Compare exact client-visible response semantics/bytes with capture disabled and enabled.
- Inventory and exercise each deployed protocol/transport, including any WebSocket path; explicitly list unsupported/bypass paths.
- Collector worker crash, blocked writer, full memory queue, oversized payload, permission failure, ENOSPC, short writes and corrupted segment. Inference must keep working and drops/incompleteness must be observable.
- Freyr unreachable/full/unwritable, bad SSH host key, timeout, interrupted upload, incorrect checksum, lost acknowledgement and duplicate delivery. No local deletion without a matching durable receipt.
- Restarts with open segments and concurrent capture/transfer; no upload of mutable files, no duplicate archive IDs and no accidental deletion of unacknowledged backlog.
- Planted synthetic credentials in request bodies, JSON escapes and across stream chunks. Verify absence from spool, archive, temp files and diagnostic logs; verify scrub counts and unchanged live payloads.
- stat checks on both hosts for ownership, 0700 directories and 0600 files, including partial/manifest/receipt files.
- Measure chat/tool streaming latency and resource usage against the same pre-change baseline. Report actual measurements; do not promise zero overhead.
- After separate deployment approval, verify authenticated public model discovery, streamed chat and streamed tools; verify model/provider inventory and existing sidecars are unchanged. Confirm actual timer execution and one real Neo-to-Freyr archived segment, not merely a loaded service definition.

## Review and implementation boundary

Lucas accepted local capture plus 15-minute transfers and safe buffering through Freyr outages. This document proposes the concrete budgets, credential-only scrub, transfer durability protocol and training-ready schema for review. No implementation, commit, publication, activation or restart is implied by this document. After review, prepare a scoped implementation plan and resolve the exact installed-release capture extension point through source inspection and isolated tests.

## Sources

[1] https://hamel.dev/blog/posts/evals
[2] https://simonwillison.net/2024/Jun/17/cli-language-models
[3] https://eugeneyan.com/writing/synthetic
[4] https://jxnl.co/writing/2024/03/28/data-flywheel
[5] https://huyenchip.com/2025/01/16/ai-engineering-pitfalls.html
[6] https://www.ruder.io/the-evolving-landscape-of-llm-evaluation
