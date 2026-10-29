# Native Pi fleet reporting

Source only until the portfolio receiver, migration and dedicated credentials are provisioned with separate approval. Pulling config is **not** end-to-end activation. No Herdr, terminal sockets, OSC, SSH, finance service, Claude Code or Codex integration is involved.

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

Create the private file at `${PI_CODING_AGENT_DIR:-$HOME/.local/share/huginn-pi/agent}/fleet.json`, outside Git. This interactive command prompts for the already-provisioned secret without echoing it and refuses to overwrite an existing file. It does **not** provision a token or contact a server:

```sh
python3 - <<'PY'
import getpass, json, os, pathlib, re, urllib.parse
root = pathlib.Path(os.environ.get('PI_CODING_AGENT_DIR', str(pathlib.Path.home() / '.local/share/huginn-pi/agent')))
endpoint = input('Approved HTTPS portfolio origin (e.g. https://portfolio.example): ').strip()
u = urllib.parse.urlsplit(endpoint)
if u.scheme != 'https' or not u.netloc or u.username or u.password or u.path not in ('', '/') or u.query or u.fragment:
    raise SystemExit('Require an HTTPS origin only')
host = input('Host ID (gimle or macbook): ').strip()
if host not in ('gimle', 'macbook'):
    raise SystemExit('Unknown host')
token = getpass.getpass('Dedicated token for this host: ')
if not re.fullmatch(r'[A-Za-z0-9_-]{32,256}', token):
    raise SystemExit('Require 32–256 base64url/hex characters')
root.mkdir(parents=True, exist_ok=True, mode=0o700)
filename = root / 'fleet.json'
fd = os.open(filename, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, 'w') as f:
    json.dump(dict(endpoint=endpoint.rstrip('/') + '/api/admin/fleet/report', hostId=host, token=token), f)
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

- `session_start`: register idle (or working if already busy); `agent_start`: working; `agent_settled`: unknown for abort (including cancellation during retry backoff), otherwise error for a terminal failed assistant response, otherwise idle. Successful automatic retries settle idle. Idle does **not** mean successful. No reliable native user-waiting signal is inferred as blocked; no automatic done/success claim.
- `tool_execution_end`: timestamp of the completed envelope, including failed tools, not tool success. Tool name, arguments, outputs, exceptions and prompts are never sent.
- Default heartbeat: 30 seconds while alive. Events coalesce to the latest snapshot, at most one ordinary request per second and one in flight; 5-second timeout, no retry queue. A failed request is retried only by a later independent event/heartbeat. Short intermediate states may be coalesced away.
- Source `observedAt`, process-instance `startedAt`, sequence and completed-tool timestamp travel in wire v1. Within an instance sequence increases; server enforces clock bounds and ordering. Reload/resume resets sequence under a fresh start time. Avoid simultaneous writers resuming the same native session; latest reporter instance wins server ordering. A clock moved behind a previously observed time is locally clamped; a receiver may reject it until clocks reconcile. Clocks must be synchronized.
- Shutdown cancels in-flight work and makes one best-effort ended request with a 250 ms bound. Abrupt kills/network failures can omit ended; backend freshness must mark stale honestly. Heartbeats do not certify progress, and quiet/stale is not stalled.
- Response/error bodies are discarded, redirects are rejected without credential forwarding, and diagnostics contain no endpoint/token/error body. Reporting events never await network work; only orderly teardown awaits its bounded final attempt.
- Storage, retention, rate limiting, server receipt times, admin read authentication and stale/ended/unavailable/never-seen presentation belong to the portfolio receiver. There is no local-file production transport or fallback.
- Receiver v1 policy: `observedAt` within 5 minutes old / 30 seconds future, `startedAt` no older than 366 days; 202 accepted, 409 stale/duplicate, 429 rate/capacity, 503 unavailable. No producer retry queues. Backend transaction owns the 240 attempts/minute per-host budget, 64 sessions/host, 24-hour ended and 7-day other retention, and separate latest host receipt. Per-session coalescing is not cross-instance or host-wide enforcement.

## Verification

```sh
cd ~/config/configs/pi
npm run typecheck
npm test
node --import tsx --test fleet.test.mjs extensions/fleet.test.ts
```

`fleet.test.mjs` uses actual native SDK session binding, prompts, read-tool execution, settlement, retry recovery/exhaustion/backoff cancellation, tree navigation, reload and shutdown, scripted in-memory model responses and an isolated loopback HTTP receiver. It checks exact wire keys, privacy canaries, heartbeat retention, sequence, explicit/default branch labels without reporter resets, error/abort/failed-tool envelopes, offline behavior, coalescing, timeout and redirect rejection. Timing is accelerated only through explicit test options. No external provider, production token, DB or browser is used. `extensions/fleet.test.ts` checks private configuration and the shared ASCII label predicate.

Remaining end-to-end gate: this producer → the real portfolio POST implementation with isolated storage → authenticated UI reader. The config tests' receipt-only loopback server is not a database or UI and must not be described as that gate. Production migration, server environment, per-host provisioning, deployment and actual signed-in browser acceptance remain separate approvals/evidence.
