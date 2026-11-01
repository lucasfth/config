# Gimle Qwen

Optional single-user Qwen3.5 9B provider for Hugi/Pi and Loki. Neither default is changed. This is a private personal endpoint, **not a public or multi-tenant inference service**; upstream MLX explicitly warns its server has only basic security checks.

## Serving contract

- M4 Pro, 6-bit target weights; 8-bit KV cache; text only; thinking disabled.
- Model ID `qwen3.5-9b-6bit`; rendered total context **139264 tokens**, output **1–4096 tokens** (defaults to 1024).
- Loopback `127.0.0.1:18789`, bearer auth. Only chat, model list and health paths. No model, adapter, draft or template overrides. Only one active completion; overlapping requests get 429.
- MLX 14 GB allocator guideline, 256 MB free cache. Supervisor samples process-tree physical footprint about every 50ms and stops at **17,000,000,000 bytes**. This is not a hard cap; Lucas explicitly accepted transient overshoot risk. Target remains 15 GB.
- Exact-prefix snapshot under encrypted `~/loki-data/gimle-qwen/checkpoint/`, includes recurrent state. Cache identity binds model revision, runtime, template/tokenizer/config and KV precision. Atomic metadata publication; one snapshot retained. Cached prefixes contain private prompt data; never publish them.
- Fixed public model revision `76fe4065e622cf34990d3c13ef80ec8531c9a0f7`. Requirements pinned in `requirements.txt`. No model/network downloads during serving.

## Ownership and setup

Canonical code is this directory. `nix/common/gimle-qwen.nix`, imported by `nix/home.nix`, owns the future Home Manager agent, gated to Gimle. It points to the Nix-store code, not an indefinitely stale copied script. System-wide Loki Nix module/gateway are separate owners.

Lucas approved a narrowly scoped initial activation: `scripts/gimle-qwen-install --activate` on Gimle, staged outside its dirty checkout. The helper prepared private dependencies and immutable weights on the encrypted volume, generated `~/Library/LaunchAgents/dk.gimle.qwen.plist`, and bootstrapped only that new agent. No broad Nix activation was run. The current agent uses the staged copy under `~/loki-data/gimle-qwen/source`; the future Nix-store path takes effect only with separately approved Home Manager activation.

Installation reuses the already-qualified model snapshot by hardlink; model files must not be edited in place. Subsequent source updates require an explicit service update/restart. Installer refuses an existing plist. No automatic restart after footprint stop; inspect `last-exit.json` before starting again. This LaunchAgent requires a logged-in user domain and an already mounted encrypted volume; unattended boot recovery is not qualified.

Hugi client setup: `python3 scripts/gimle-qwen-client`. Private key/config under `~/.local/share/gimle-qwen`, existing-key strict SSH forwarding via `dk.huginn.gimle-qwen-tunnel`. Pi runtime loads this optional descriptor on next launch. Select **`gimle/qwen3.5-9b-6bit`** in `/model`. The current in-memory model catalogue may require a new Pi launch. No roles/defaults changed.

Loki: `scripts/gimle-qwen-loki` adds custom provider **`gimle-qwen`** to private config, preserving all defaults/comments and prior exact bytes. Explicit `chat_completions` mode; provider-specific 1200s request/1100s stale timeout. In Hermes use **`/model gimle-qwen`**, then select the listed model if prompted. Root default remains Mimer. Full gateway hot-reload/model selection UI not exercised; fresh actual provider resolver and agent were exercised.

## Verification — 2026-10-30

- Unit policy checks + native Pi launch tests pass. Nix files parse; no full flake build/activation claimed.
- `node configs/pi/integration-gimle.mjs`: actual native registry/auth, streaming tool call, result continuation and Pi session reply; bad bearer and unsafe overrides rejected.
- `accept_hermes.py`: actual Hermes provider resolution, streamed agent loop and fake registered tool; 2 calls, 15 stream callbacks, correct result. Fresh corrected SOUL loaded. Isolated profile, no Telegram dispatch or real tool actions.
- `integration-gimle-cache.mjs`: deployed ~17K prefix first-token 44.3s; after actual model-service replacement first-token 0.46s, completion 0.80s, same answer; 16983 cache-read tokens and 64 newly processed tokens. Immediate post-start race initially produced connection error; rerun after listener readiness passed. Earlier direct model API 128K save/restore and actual Hermes 139K tests are in benchmark reports on Gimle, not proof of full production quality.
- Loki prompt A/B: old SOUL failed explicit Danish and harmless email-context request; revised prompt passed those, owner debugging and untrusted-webpage injection smoke test. Only the legitimate user's authorization is used; injected directives remain data. Exact prior SOUL preserved under encrypted `prompt-backups/<sha256>.md`. `configs/loki/prompt_repair.py` is the narrowly scoped, revision-checked transformation; canonical live user identity remains `~/.hermes/SOUL.md`. Gateway not restarted; existing sessions may retain old cached prompt.

## Operations and rollback

Inspect Gimle `launchctl print gui/501/dk.gimle.qwen`, encrypted runtime `last-exit.json`, and `~/Library/Logs/gimle-qwen-error.log`. `KeepAlive=false` intentionally leaves a footprint-triggered process stopped instead of repeatedly crashing/loading. Start/restart only with operator approval.

Rollback optional endpoint: boot out **only** `gui/501/dk.gimle.qwen`; on Hugi boot out `gui/$(id -u)/dk.huginn.gimle-qwen-tunnel`; remove only the optional private client descriptor/provider entry after backing it up. Restore SOUL/config only from the named hash-verified private backups and only on request. Mimer default and gateway require no restoration because they were never changed.

Remaining limitations: cold 128K prefill ~10 minutes; 128K decode ~14 tok/s; only one disk prefix retained, so switching Hugi/Loki sessions can evict it. No claim of broad agent-quality acceptance or hard memory enforcement. MTP tested slower; DFlash cache/server compatibility failed and 128K DFlash exceeded the sampled stop threshold, so neither is enabled.
