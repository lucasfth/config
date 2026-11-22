# Gimle Qwen

Optional single-user Qwen3.5 9B provider for Hugi/Pi and Loki. Neither default is changed. This is a private personal endpoint, **not a public or multi-tenant inference service**; upstream MLX explicitly warns its server has only basic security checks.

## Serving contract

> The fixed values below are the **baked defaults**. On a llama-swap deployment the active model, context, memory limit and guard come from `swap-state.json` (written only by llama-swap; see [llama-swap](#llama-swap)).

- M4 Pro, 6-bit target weights; 8-bit KV cache; text only; thinking disabled.
- One quant is held at a time. Huginn’s source catalog offers `qwen3.5-9b-4bit` (preferred local quant) and `qwen3.5-9b-8bit`, each with a configured 139264-token context and a 4096-token output limit. Removing 6-bit from the Pi catalog did not remove its registry entry or weights.
- Loopback `127.0.0.1:18789`, bearer auth. Only chat, model list and health paths. No model, adapter, draft or template overrides. Only one active completion; overlapping requests get 429.
- MLX 14 GB allocator guideline, 256 MB free cache. Supervisor samples process-tree physical footprint about every 50ms and stops at **17,000,000,000 bytes**. This is not a hard cap; Lucas explicitly accepted transient overshoot risk. Target remains 15 GB.
- Exact-prefix snapshot under encrypted `~/loki-data/gimle-qwen/checkpoint/`, includes recurrent state. Cache identity binds model revision, runtime, template/tokenizer/config and KV precision. Atomic metadata publication; one snapshot retained. Cached prefixes contain private prompt data; never publish them.
- Fixed public model revision `76fe4065e622cf34990d3c13ef80ec8531c9a0f7`. Requirements pinned in `requirements.txt`. No model/network downloads during serving.

## Ownership and setup

Canonical code is this directory. `nix/common/gimle-qwen.nix`, imported by `nix/home.nix`, owns the Home Manager agent, gated to Gimle; its generated plist points to Nix-store code. System-wide Loki Nix module/gateway are separate owners.

The agent was initially installed with `scripts/gimle-qwen-install --activate`. A later Home Manager generation pointed it at Nix-store code. On 2026-11-09 the agent alone was switched back to the staged copy under `~/loki-data/gimle-qwen/source` for the cache-selection fix; no broad activation was run. A later Home Manager activation can replace this plist with its store-backed version, so verify that generation includes the fix before activating it. The previous plist and service source are backed up on Gimle under `~/loki-data/gimle-qwen/rollback-qwen-20261109-151854/`.

Installation reuses the already-qualified model snapshot by hardlink; model files must not be edited in place. Subsequent source updates require an explicit service update/restart. Installer refuses an existing plist. No automatic restart after footprint stop; inspect `last-exit.json` before starting again. This LaunchAgent requires a logged-in user domain and an already mounted encrypted volume; unattended boot recovery is not qualified.

Hugi client setup: `python3 scripts/gimle-qwen-client`. The private descriptor and key live under `~/.local/share/gimle-qwen`; MacBook access uses the existing authenticated loopback SSH tunnel. A new Pi launch generates the catalog; its only Gimle options are **`gimle/qwen3.5-9b-4bit`** and **`gimle/qwen3.5-9b-8bit`**. Catalog visibility does not prove endpoint readiness or successful switching. No roles/defaults changed.

Loki: `scripts/gimle-qwen-loki` adds custom provider **`gimle-qwen`** to private config, preserving all defaults/comments and prior exact bytes. Explicit `chat_completions` mode; provider-specific 1200s request/1100s stale timeout. In Hermes use **`/model gimle-qwen`**, then select the listed model if prompted. Root default remains Mimer. Full gateway hot-reload/model selection UI not exercised; fresh actual provider resolver and agent were exercised.

## Cache selection verification — 2026-11-09

A matching disk checkpoint is selected over an in-memory prefix only when it saves more than 8192 additional tokens; with no in-memory match any positive saving qualifies. The existing early return still skips restore when at most 8192 tokens remain. A synthetic real-cache comparison measured median first-token times of 54.24s versus 0.277s for the old and new selection paths (three runs each); this is not a cold-prefill or full-server A/B. A separate native Pi session and streaming/tool continuation passed against the live service after restart. Ratatosk GUI usage was not verified.

## Verification — 2026-10-30

- Unit policy checks + native Pi launch tests pass. Nix files parse; no full flake build/activation claimed.
- `node configs/pi/integration-gimle.mjs`: actual native registry/auth, streaming tool call, result continuation and Pi session reply; bad bearer and unsafe overrides rejected.
- `accept_hermes.py`: actual Hermes provider resolution, streamed agent loop and fake registered tool; 2 calls, 15 stream callbacks, correct result. Fresh corrected SOUL loaded. Isolated profile, no Telegram dispatch or real tool actions.
- `integration-gimle-cache.mjs`: deployed ~17K prefix first-token 44.3s; after actual model-service replacement first-token 0.46s, completion 0.80s, same answer; 16983 cache-read tokens and 64 newly processed tokens. Immediate post-start race initially produced connection error; rerun after listener readiness passed. Earlier direct model API 128K save/restore and actual Hermes 139K tests are in benchmark reports on Gimle, not proof of full production quality.
- Loki prompt A/B: old SOUL failed explicit Danish and harmless email-context request; revised prompt passed those, owner debugging and untrusted-webpage injection smoke test. Only the legitimate user's authorization is used; injected directives remain data. Exact prior SOUL preserved under encrypted `prompt-backups/<sha256>.md`. `configs/loki/prompt_repair.py` is the narrowly scoped, revision-checked transformation; canonical live user identity remains `~/.hermes/SOUL.md`. Gateway not restarted; existing sessions may retain old cached prompt.

## Operations and rollback

Inspect Gimle `launchctl print gui/501/dk.gimle.qwen`, encrypted runtime `last-exit.json`, and `~/Library/Logs/gimle-qwen-error.log`. `KeepAlive=false` intentionally leaves a footprint-triggered process stopped instead of repeatedly crashing/loading. Start/restart only with operator approval.

**Recovery hold (2026-11-22):** the endpoint is down. A scoped gateway activation failed with `launchctl bootstrap` status 5, and loading the restored original job failed the same way. The original store-backed `supervise.py` plist, registry and state match their backup bytes; the `model` symlink matches the backup and points to 4-bit. The restored 8-bit registry entry has no explicit `model_id`; its approved limits are a 19 GB sampled footprint stop and a 20 GB MLX allocator limit. Snapshot: `~/loki-data/gimle-qwen/rollback-gateway.61p9og1u/`. The job is absent from `gui/501` and neither port 18789 nor 18790 was listening at the last check.

Pending operator approval: bootstrap **the verified original plist once**, then check authenticated `/health` and a real 4-bit completion. If bootstrap returns status 5 again, stop and diagnose launchd; do not retry in a loop or modify the registry.

Rollback optional endpoint: boot out **only** `gui/501/dk.gimle.qwen`; on Hugi boot out `gui/$(id -u)/dk.huginn.gimle-qwen-tunnel`; remove only the optional private client descriptor/provider entry after backing it up. Restore SOUL/config only from the named hash-verified private backups and only on request. Mimer default and gateway require no restoration because they were never changed.

Remaining limitations: cold 128K prefill ~10 minutes; 128K decode ~14 tok/s; only one disk prefix retained, so switching Hugi/Loki sessions can evict it. No claim of broad agent-quality acceptance or hard memory enforcement. MTP tested slower; DFlash cache/server compatibility failed and 128K DFlash exceeded the sampled stop threshold, so neither is enabled.
## llama-swap

Model swapper for this endpoint, added 2026-11-17. One model is served at a time on :18789.

- `~/.local/bin/llama-swap` (stateless CLI; the nix module ships it). Registry and state live on the encrypted runtime: `~/loki-data/gimle-qwen/swap-registry.json`, `swap-state.json`, `models/<id>/`, and `model`, a symlink to the active weights.
- The supervised service reads `swap-state.json` at boot and falls back to the baked defaults (the 9B values above) when it is absent. Out-of-range fields - including any guard above the approved 31 GB ceiling - are rejected at boot; nothing serves with an unvalidated budget.
- `use <id>` = validate entry -> checkout pinned revision (in-volume move) -> atomic model-symlink and state swap -> `launchctl kickstart -k` -> health (two 200s) -> smoke completion. Any failure rolls back to the previous model automatically. `--dry-run` changes nothing.
- `init` lays the registry around the existing 9B deployment (moves `model/` to `models/<id>/`, recreates the symlink). One-time, first run.
- `status` reports active/previous/link/budget, the last-exit summary, and guard drift between the running threshold and the registry.
- `add <id> <repo> <revision> <ctx> <mem-gb> <target-gb> <stop-gb> [weights-gb] [max-output]` registers a model (validated, 31 G ceiling); `fetch`/`use` download it.
- Journal: `~/loki-data/gimle-qwen/llama-swap.log` (append-only, 0600).
- `qwen3-30b-a3b-4bit` was deployed, measured, and decommissioned 2026-11-19 (weights removed on Gimle; registry entry dropped); only the two Qwen3.5 9B quants remain switchable.

### On-demand switching (not live)

The gateway is stub-tested only: it keeps the public connection open while replacing the guarded worker, then forwards the same request. Its roster excludes 6-bit. The restored `supervise.py` service uses the older `429`/retry handoff if recovered. Before calling the gateway working, verify a live 4-bit → 8-bit → 4-bit round trip through Huginn, one prompt per direction, no manual resend, exactly one journaled swap each way, and the 19 GB supervisor threshold for 8-bit.
