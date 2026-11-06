# CLIProxyAPI training capture

Source for a private, fail-open HTTP inference capture overlay pinned to CLIProxyAPI **v8.0.35 / ae3ee3be303fb07fb8173279923413005bf32177**. Historical rollout evidence is recorded in [`VERIFICATION.md`](VERIFICATION.md); it is not a current live-state guarantee. This source publication does not install, enable or restart the proxy or shipper.

The 2026-11-05 canary used Freyr's existing `lucas` account at `/home/lucas/data/cli-proxy-training`, with Lucas's approval for unencrypted gzip and retention of Neo originals. Timed retained-copy shipping was observed, but broader load/fault/protocol acceptance remains incomplete.

- Design: [`docs/superpowers/specs/2026-11-05-cli-proxy-training-capture-design.md`](../../docs/superpowers/specs/2026-11-05-cli-proxy-training-capture-design.md)
- Plan: [`docs/superpowers/plans/2026-11-05-cli-proxy-training-capture.md`](../../docs/superpowers/plans/2026-11-05-cli-proxy-training-capture.md)

## Local checks and candidate build

```sh
cd configs/cli-proxy-capture
go test -race ./...
go vet ./...
cd ../..
bash configs/cli-proxy-capture/build-candidate.sh "$PWD/.worktrees/cli-proxy-capture"
```

The build script requires the isolated release SHA and exact approved patch, applies/copies only capture sources, tests the affected packages and performs the required server compile. It never installs, restarts or changes the active binary. Repeat builds refuse unrelated tracked edits. Candidate output goes under the ignored worktree's `.capture-build/`. The Config module has a distinct module path and no external dependencies; `.tmpl` integration files compile only after copying into the upstream release.

Use `CC=/usr/bin/clang` on this Mac: the default Nix compiler cannot link the proxy's `-lresolv`. There is a pre-existing gofmt difference in release `internal/pluginhost/host.go`; a full-tree format was inspected and its unrelated whitespace change restored. Repeat formatting targets only changed files.

Build archive tools to a private staging directory outside source control:

```sh
cd configs/cli-proxy-capture
mkdir -p /tmp/cli-proxy-capture-build
CGO_ENABLED=0 go build -trimpath -o /tmp/cli-proxy-capture-build/trainingarchive-darwin-arm64 ./cmd/trainingarchive
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -o /tmp/cli-proxy-capture-build/trainingarchive-linux-amd64 ./cmd/trainingarchive
```

## Enablement inputs (not activation instructions)

The candidate is disabled by default. `CPA_TRAINING_CAPTURE_ROOT` selects Neo's private spool, proposed as `/Users/klausjensen-neo/.cli-proxy-api/training-capture`; `CPA_TRAINING_CAPTURE_SOURCE=neo` labels the source. These belong in the proxy's approved LaunchAgent environment, not provider YAML. Changing the serving binary/environment requires a separately approved proxy restart and immutable known-good rollback.

The receiver and shipper are one standard-library Go binary:

```text
trainingarchive receive --root /absolute/private/archive
trainingarchive ship --root /absolute/private/spool --target freyr-capture \
  --receiver /absolute/path/trainingarchive --archive /absolute/private/archive \
  --identity /absolute/dedicated/key --known-hosts /absolute/pinned/known_hosts \
  --retain-source
```

`receive` is an SSH stdin command, not a public server. Use a dedicated receiver account/restricted key and exact forced receiver command, no forwarding, with a pinned Freyr host key. Verify Neo-to-Freyr connectivity before installing anything; reaching each host from the workstation does not prove this route. The example plist is intentionally **not installable as-is**: replace `RECEIVER_USER`, verify actual filesystem/ownership, precreate private log files and stage the binaries first. Its 900-second interval is user-launchd scheduling, not a guarantee while Neo sleeps. The deployed instantiated plist is approved; this generic example must still be configured and reviewed before loading elsewhere.

After separate deployment approval, precreate logs **as Neo's proxy user**, before loading the timer. Refuse pre-existing symlinks/non-regular log paths rather than truncating them:

```sh
umask 077
state="$HOME/.cli-proxy-api/training-capture"
test ! -L "$state" && mkdir -p "$state" && chmod 700 "$state" || exit 1
for name in ship.stdout.log ship.stderr.log; do
  path="$state/$name"
  test ! -L "$path" || exit 1
  if test -e "$path"; then test -f "$path" || exit 1; else (set -C; : > "$path") || exit 1; fi
  chmod 600 "$path" || exit 1
done
stat -f '%Su %Lp %N' "$state" "$state/ship.stdout.log" "$state/ship.stderr.log"
```

Repeat `stat` after the first actual shipper run; verify `klausjensen-neo`, 700/600 modes, and review bounded operational stderr without printing captured bodies. SSH subprocess stdout is parsed as a small receipt, stderr is suppressed in the public error, and capture bodies/keys are never intentionally logged by the shipper. Rotate operational log files under a separately reviewed size policy.

The shipper takes a non-blocking single-run lock, uses strict SSH verification and an overall ten-minute transfer-job timeout. This timeout never applies to inference. It uploads only immutable segments; Freyr validates SHA-256, compressed length, bounded decompression, record schema/framing/count, fsync and atomic finalization. Neo retains a matching durable local receipt before deleting a source. Failed/partial transfers retain the original. Conflicting segment IDs are rejected locally and remotely. Receipts are retained without automatic pruning; a later retention policy is needed. Remote archive manifests are also durable receipts.

## Capture behavior and limits

- After-auth middleware on `/v1`, `/openai/v1`, `/backend-api/codex`, `/v1beta`; an exact method/path eligibility check captures only supported JSON/SSE inference POSTs. It never captures management/OAuth/credential creation endpoints or unauthenticated requests.
- Supported now: chat/completions, completions, Anthropic messages, Responses/compact, Gemini interactions and generateContent/streamGenerateContent. Control/model-discovery GETs, binary/media routes, realtime, WebSockets, plugins and direct sidecar/provider traffic are **not full-content captured**. Do not describe this candidate as all-protocol coverage.
- The actual Gin writer retains status, headers, flushing and hijacking. Reads and successfully written bytes are teed into bounded memory; no capture filesystem or SSH work happens in inference callbacks. Allocation/copying has overhead; no zero-overhead or performance claim is made.
- Default queue: 128 interactions; accounted memory budget 256 MiB, per-interaction wire payload ceiling 64 MiB. Conservative expansion reservations mean a large interaction can be dropped before the wire ceiling. Runtime/object overhead is not an exact RSS cap. Oversized/full-queue captures are counted as dropped, not silently treated as complete.
- Local payload spool: 100 GiB cap, 50 GiB free-space floor, resume at 55 GiB. Never delete unshipped payloads to make room. Check filesystem free space per append; update payload-byte counts on writes and via the shipper's fixed-size reclaimed counter. Background reconciliation corrects crash overcounts/external deletions without scanning backlog per request. Receipt/control metadata is outside the payload cap; the filesystem floor still protects it.
- Gzip JSONL segments rotate at 64 MiB uncompressed or on a maintenance tick after five minutes. Freyr retains these compressed `.jsonl.gz` segments without uncompressed duplicates; decompression is for later inspection/curation. Compression is not encryption or backup. Capture counters expose enqueued/persisted/dropped/errors/unsupported, but `persisted` means appended to an open segment, not fsynced/archived. Private `status.json` snapshots run every ten seconds on a single-flight reporting goroutine; blocked reports skip future snapshots without blocking persistence. Worker shutdown seals; sudden process loss can lose memory/open tails. Restart verifies and reseals completed open gzip segments; only unverifiable tails are quarantined. Failed manifest publication retains a retryable completed segment, and directory-sync failures are counted and retried without double-accounting. Quarantine consumes payload budget and requires review, not automatic removal.
- Directories 0700 and data/manifest/receipt/temp files 0600. Existing owned paths are checked with Lstat; system ancestor symlinks such as macOS `/var` are allowed. Root parents must be operator-controlled. No archive content in general diagnostic logs.
- No content anonymization. Known credential strings and common bearer/provider key patterns are scrubbed in parsed JSON values/keys and joined SSE string paths. Capture keys include initial/current configured client keys, the authenticated current request key, management secret config/local/env strings. Pattern scrubbing is not comprehensive secret discovery; provider OAuth secrets not supplied to the capture subsystem remain outside exact-match detection. Unsupported/invalid bodies are omitted and marked incomplete, not spilled raw to disk. Only the capture copy changes.
- JSON/SSE capture is credential-scrubbed and reserialized, **not byte-exact wire storage**. Payload hashes identify this post-scrub representation. Preserve original live response bytes, which are tested independently. Transport chunk boundaries are not offsets in the reserialized payload.
- Requests and response bodies retain supplied context, tool definitions/results and model-reported content. `requested_model`, distinct `reported_models`, capture time/version and `model_provenance` support later teacher-quality weighting. `response_reported` is not proof of a resolved upstream checkpoint. Resolved provider/model remain empty until an independently verified runtime hook supplies them; no fallback/alias inference.
- No model weights are assigned at capture time. Keep a versioned dataset policy later: combine model/revision quality, task correctness/tests, human review, deduplication and grouped evaluation holdouts. A flagship error is not a better target than a verified smaller-model answer.

### Verification scope

Implemented behaviors above are candidate code, not production guarantees. Executed local checks include core/CLI race suites, `go vet`, full serving-release API/middleware suites, server compile, and five named Gin overlay tests (including panic/bodyless-status subtests). The authenticated teacher test constructs separate disabled/enabled servers using a deterministic executor, not a live paid provider. The overlay tests must be re-run after each overlay edit. **Known limitation:** `Reconcile()` takes a nonblocking shared `ship.lock`; when busy it returns nil **without refreshing usage**. `TestShippingDoesNotRejectConcurrentCapture` proves only that capture was not rejected in that fixture, not fresh accounting. Receipt metadata is retained indefinitely, excluded from payload accounting, and still needs a bounded metadata-capacity policy before production. No absolute memory/latency claim or all-protocol acceptance is established.

## Remaining acceptance before production

Local tests are not host or scheduling proof. Deployment needs explicit current approval and:

1. Read-only baseline of public model/provider inventory and chat/tools, verify serving build and rollback target.
2. Resolve private archive location/account, encryption-at-rest and backup policy; confirm Neo-to-Freyr key/host pinning. Keep both copies; acknowledged Neo deletion requires separate approval.
3. Validate all actual client protocols, model/identity/session metadata requirements, and remaining binary/WebSocket coverage. Native Jev bypass traffic is out of scope without separate instrumentation.
4. Strengthen remaining fault-injection coverage (actual short-write/ENOSPC, killed process/open-tail lifecycle, receipts/control-state capacity), and quantify latency/memory under representative load. Existing synthetic admission tests do not prove absolute production RSS or crash isolation.
5. Complete source review; stage separately; approve restart/drain; then authenticated public discovery, streamed chat and streamed tools, provider inventory unchanged, planted-secret checks and `stat` on both hosts.
6. Observe an actual scheduled transfer after 15 minutes and matching file hash/receipt, not just loaded timer state. Live drop/last-delivery monitoring still needs an operator surface beyond shutdown counters.

Never enable the stock body logger as a substitute. Existing stock error-log capture is a separate legacy surface; this candidate does not claim to sanitize or disable it.

## Synthetic preflight custody (not training data)

Fixture `aa11aa11aa11aa11aa11aa11aa11aa11` was verified against its exact synthetic record and compressed hash `fc67e152bac00ebd338e87d882bde6e04142fabb7342b6c0a29073478670fe58`. Its Freyr segment, manifest and lock were moved to `/home/lucas/.local/share/cli-proxy-capture-preflight/20261105/`, with a private `movement.log`; the training archive contained no files after that move. This quarantine is not the only fixture copy: synthetic transport files also remain in Neo's `.local/lib/cli-proxy-capture/20261105-v1/preflight.upload` and the workstation's `/tmp/cli-proxy-deploy-build/preflight.upload`/`preflight.manifest`. No automatic cleanup is authorized. The sole-copy warning above describes future acknowledged deletion of real captured segments, not these retained synthetic preflight copies.

## Canary storage boundary — 2026-11-05

Real-data transfer to Freyr is enabled with Neo source retention. Lucas selected: “Yes—enable shipping now; keep both copies, no deletion” after explicit disclosure of unencrypted gzip storage. Freyr's archive is on plain ext4 root (`/dev/nvme0n1p2`), with no visible disk-encryption layer. Neither gzip nor two same-account/tailnet copies establishes encryption or an independent disaster-recovery backup policy. Automatic acknowledged deletion on Neo is not enabled or authorized. Retained payload still counts toward Neo's 100 GiB spool ceiling and 50 GiB free-space floor; at the limit capture must stop rather than delete data or stop inference. Broader load/fault/protocol gates remain open.

## Retained-copy shipping and observation

- CLI `ship` defaults to `--retain-source=true`; the installed plist explicitly selects it. `--retain-source=false` is destructive after durable receipt and must not be used without new approval. The older Go `Ship` API preserves its original cleanup semantics; current operations use `ShipWithOptions` with retention.
- Each run verifies local gzip/hash/count before trusting a matching local receipt. Already acknowledged retained segments are skipped, not retransmitted every 15 minutes. This does not continuously verify that Freyr has retained its copy; receipts prove prior acknowledged delivery.
- After a transfer, an exact durable local receipt is retained; the source segment/manifest stay in place and `reclaimed.json` is unchanged. `ship-status.json` is a private atomic latest-run heartbeat with timestamps, success, retention mode and segments sent this run. It is not a receipt or cumulative delivery count.
- At the 2026-11-05 observation, the shipper binary was `/Users/klausjensen-neo/.local/lib/cli-proxy-capture/20261105-v2/trainingarchive` and receiver `/home/lucas/.local/lib/cli-proxy-capture/current/trainingarchive`. Discover the current executables and forced-command/root before operating them.
- `launchctl print gui/$(id -u)/com.lucas.cliproxy-capture-ship` shows interval, run count and last exit. Compare fresh `ship-status.json` and local/Freyr receipts; RunAtLoad success alone does not prove a natural 900-second execution. Neo must be awake and reachable; failed transfers retain source and are retried on later invocations. Disabling this shipper does not disable capture or inference.
