# Native Pi fleet reporting

Private fleet lifecycle reporting. Pulling config is **not** activation: a host needs its existing dedicated credential and a compatible deployed portfolio receiver. This enrichment is a new source candidate; apply the portfolio activity migration and receiver before activating it. Existing wire-v1 reporters remain supported without a MacBook setup change. No Herdr, terminal sockets, OSC, SSH, finance service, Claude Code or Codex integration is involved.

## Update and launch

After this change has been published, on each host with the managed Pi profile:

```sh
cd ~/config
git pull --ff-only
git submodule update --init -- volundr
cd configs/pi
npm ci --ignore-scripts --cache "$HOME/.cache/huginn-pi/npm"
npm run setup
# At your next normal session launch, from your project in an interactive zsh:
pi
```

If `~/config` is dirty, reconcile your edits before pulling; never reset them. The existing managed wrapper generates the extension list on each launch, including native default subagent extensions. No Nix activation is needed. Existing sessions remain unchanged: a normal relaunch is required to discover a newly registered extension; `/reload` alone does not regenerate settings that omit it. Once registered, `/reload` re-reads `fleet.json` and cleans up the old reporter. Nothing in this feature reloads or restarts user sessions automatically. `pi --continue` is an operator choice to resume a session, not a command the installer runs.

Native one-shot `pi -p` runs through the same wrapper and report independently. A child with explicitly overridden extensions can opt out; the managed defaults include reporting. Registration is not evidence that every custom SDK host loads the profile.

## Once per host — only after server setup is approved

The portfolio owner must first provision its migration and receiver environment separately. Dedicated high-entropy producer tokens map to `gimle` and `macbook`; use a **different** secret per host, never any existing application's token. Tokens grant report writes only, not reads or admin access. Prefer 64 random hexadecimal characters (32 random bytes); the local format accepts 32–256 base64url/hex characters. Share through your private secret-management route, never chat, Git, PR text, command arguments or shell history.

On known managed hosts, all non-secret defaults are tracked in `fleet-defaults.mjs`: portfolio origin from `portfolio/app/layout.tsx`, hostnames from `nix/hosts/{gimle,lucas-macbook-pro}/default.nix`. Exact hostname `gimle` maps to gimle; `lucas-macbook-pro` maps to macbook (case-insensitive, optional `.local` suffix). Unknown hosts are disabled in token-only mode; no automatic host registration occurs. Existing complete `{endpoint,hostId,token}` files remain valid unchanged. Partial overrides or extra fields are rejected.

Create token-only private `${PI_CODING_AGENT_DIR:-$HOME/.local/share/huginn-pi/agent}/fleet.json` outside Git using your already-provisioned host token. This interactive example refuses to overwrite a file and does not contact a server. Verify the hostname is one of the tracked mappings first:

```sh
python3 - <<'PY'
import getpass, json, os, pathlib, re
root = pathlib.Path(os.environ.get('PI_CODING_AGENT_DIR', str(pathlib.Path.home() / '.local/share/huginn-pi/agent')))
token = getpass.getpass('Dedicated token for this host: ')
if not re.fullmatch(r'[A-Za-z0-9_-]{32,256}', token):
    raise SystemExit('Require 32–256 base64url/hex characters')
root.mkdir(parents=True, exist_ok=True, mode=0o700)
filename = root / 'fleet.json'
fd = os.open(filename, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, 'w') as f:
    json.dump(dict(token=token), f)
    f.write('\n')
print('Private fleet.json created. Launch normally when ready; no live request was sent.')
PY
```

The file must be a current-user-owned, nonsymlink regular file with permissions `0600`, no extra keys, at most 4 KiB. Only HTTPS endpoints with exact `/api/admin/fleet/report` path, no embedded credentials/query/fragment, are accepted. HTTP loopback is only enabled by isolated test factory options, never by a shipping setting or environment flag. Missing/invalid configuration disables transmission without failing agent work. Runtime preparation preserves this file without copying its token into generated settings.

In the session:

```text
/fleet-status
/fleet-name Admin feature
```

`/fleet-name` explicitly approves that label for private fleet display export and saves a native custom entry; it does not use `/name`, automatic titles, working directories or prompts. Use a recognizable, non-sensitive operator-chosen ASCII name. Labels must be 1–80 characters, no leading/trailing spaces, using only A–Z, a–z, 0–9, ASCII space, period, underscore or hyphen (`/^[A-Za-z0-9 ._-]+$/` plus length/trim checks). Emoji and other Unicode are not accepted. Until assigned, the safe default is `Pi session <8hex>`. Tree navigation reconstructs the active branch's label immediately, restoring the default on branches predating labels without restarting reporter ordering. Forks inherit their branch's explicit label but have a different hashed reference; rename when needed. Native session ID is SHA-256 hashed and truncated to 32 lowercase hex characters; no raw ID/path leaves the producer.

`/fleet-status` is local and secret-free: disabled/configured/acknowledged/unavailable. Acknowledgement means only HTTP acceptance, never task success, DB/UI verification or deployment proof. Removing `fleet.json` and a normal reload/relaunch disables reporting; remove the server token separately to revoke it immediately. Rotation requires coordinated private server/local updates. There is no automatic credential discovery, refresh, fallback or reuse.

## Observations and limits

- `session_start`: idle, or unknown if reloaded while busy (original work start and pending IDs cannot be reconstructed). `agent_start`: working with source-event `workingSince`, retained through retry starts until settlement. `agent_settled`: unknown for abort (including backoff cancellation), otherwise terminal error or idle. Idle does **not** imply success. No reliable user-waiting signal is inferred as blocked.
- Native `tool_execution_start/end` tracks distinct in-flight IDs locally (including concurrent/nested tools) and exports only bounded `toolsInFlight` (0–256; counts above 256 saturate). IDs, names, arguments and results never leave. Completed envelopes, even failures, update `lastToolCompletedAt`. Settle/reload/shutdown clears in-flight evidence. Responding means working with zero observed pending tools, not proof of text generation at that instant.
- Default heartbeat: 30 seconds while alive. Events coalesce to the latest snapshot, at most one ordinary request per second and one in flight; 5-second timeout, no retry queue. A failed request is retried only by a later independent event/heartbeat. Short intermediate states may be coalesced away.
- Wire v1 keeps its nine base fields. New producers add a **paired optional** `workingSince`/`toolsInFlight`: when working, canonical timestamp between startedAt and observedAt and integer 0–256; otherwise null/0. Old Mac reporters omit both and remain valid. Unknown keys, one-sided pairs and inconsistent values are rejected. Source observedAt, process startedAt, increasing sequence and last-tool completion semantics remain unchanged. Reload/resume starts a new instance; do not simultaneously resume the same native session. Clocks are locally clamped and must remain synchronized.
- Shutdown cancels in-flight work and makes one best-effort ended request with a 250 ms bound. Abrupt kills/network failures can omit ended; backend freshness must mark stale honestly. Heartbeats do not certify progress, and quiet/stale is not stalled.
- Response/error bodies are discarded, redirects are rejected without credential forwarding, and diagnostics contain no endpoint/token/error body. Reporting events never await network work; only orderly teardown awaits its bounded final attempt.
- Storage, retention, rate limiting, server receipt times, admin read authentication and stale/ended/unavailable/never-seen presentation belong to the portfolio receiver. There is no local-file production transport or fallback.
- Receiver v1 policy: `observedAt` within 5 minutes old / 30 seconds future, `startedAt` no older than 366 days; 202 accepted, 409 stale/duplicate, 429 rate/capacity, 503 unavailable. No producer retry queues. Backend transaction owns the 240 attempts/minute per-host budget, 64 sessions/host, 24-hour ended and 7-day other retention, and separate latest host receipt. Per-session coalescing is not cross-instance or host-wide enforcement.
- Automatic session-title extension currently uses a first-prompt excerpt. No automatic title, `/name`, session_info_changed name, path or prompt is exported. Title enrichment is blocked until a distinct approved generated-title source exists; operator label/hash remains the heading.

## Verification

```sh
cd ~/config/configs/pi
npm run typecheck
npm test
node --import tsx --test fleet.test.mjs extensions/fleet.test.ts
```

`fleet.test.mjs` uses actual native SDK session binding, prompts, read-tool execution, settlement, retry recovery/exhaustion/backoff cancellation, tree navigation, reload and shutdown, scripted in-memory model responses and an isolated loopback HTTP receiver. It checks exact wire keys, privacy canaries, heartbeat retention, sequence, explicit/default branch labels without reporter resets, error/abort/failed-tool envelopes, offline behavior, coalescing, timeout and redirect rejection. Timing is accelerated only through explicit test options. No external provider, production token, DB or browser is used. `extensions/fleet.test.ts` checks private configuration and the shared ASCII label predicate.

The config tests' receipt-only loopback server is not a database or UI. Cross-repository local qualification must run this producer → actual portfolio POST implementation → isolated PostgreSQL → admin-reader handler → rendered component; synthetic admin identity and static markup do not establish live auth or browser proof. Base trust/provisioning is already established; this enrichment's migration, receiver deployment, producer adoption and new signed-in UI acceptance remain separate approval/evidence gates. Existing full private host configs and old wire remain valid; no reprovisioning is required.
