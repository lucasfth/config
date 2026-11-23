# Gimle Qwen

Optional single-user local model provider for Hugi/Pi and Loki. Neither default is changed. This is a private personal endpoint, **not a public or multi-tenant inference service**; upstream MLX explicitly warns its server has only basic security checks.

## Serving contract

The gateway starts with Qwen 4-bit. Select Inkling explicitly for a request; a subsequent `default_model` request selects Qwen again. The worker remains on the selected model between requests.

Hermes desktop: Inkling serves 65,536 tokens, satisfying Hermes's 64,000-token initialization floor without a context override. Inkling streams native prefill progress so Hermes can distinguish ongoing computation from a stalled stream without increasing the stale timeout. On Gimle, the qualification run took 42m 35s to prefill 60,701 cold input tokens; this is a capacity increase, not a speedup. A warm tool continuation re-evaluated just 29 tokens. The gateway accepts standard reasoning-effort hints but keeps Inkling on its qualified low profile. It normalizes Hermes's assistant `reasoning` replay field to `reasoning_content` for tool continuation.

| Model | Worker | Served context (tokens) | Footprint stop (bytes) |
| --- | --- | ---: | ---: |
| `qwen3.5-9b-4bit` (startup and `default_model`) | MLX, 8-bit KV | 139264 | 16000000000 |
| `inkling-2-mini` (explicit opt-in) | llama.cpp + Metal, UD-Q4_K_M | 65536 | 26000000000 |

One worker at a time. Text only; output **1–4096 tokens** (defaults to 1024). Inkling uses low reasoning effort.
- Loopback `127.0.0.1:18789`, bearer auth. Only chat, model list and health paths. No model, adapter, draft or template overrides. Only one active completion; overlapping requests get 429.
- The existing supervisor samples process-tree physical footprint about every 50 ms. The thresholds above are sampled stops, not hard caps. The MLX allocator guideline remains 14 GB, with 256 MB free cache.
- Exact-prefix snapshot under encrypted `~/loki-data/gimle-qwen/checkpoint/`, includes recurrent state. Cache identity binds model revision, runtime, template/tokenizer/config and KV precision. Atomic metadata publication; one snapshot retained. Cached prefixes contain private prompt data; never publish them.
- Qwen public revision: `8b2b98c00a6b4d291155e4890773ca8f769aee53`. Requirements pinned in `requirements.txt`. No model/network downloads during serving.

## Ownership and setup

Canonical code is this directory. `nix/common/gimle-qwen.nix`, imported by `nix/home.nix`, owns the Home Manager agent, gated to Gimle; its generated plist points to Nix-store code. System-wide Loki Nix module/gateway are separate owners.

The agent was initially installed with `scripts/gimle-qwen-install --activate`. A later Home Manager generation pointed it at Nix-store code. On 2026-11-09 the agent alone was switched back to the staged copy under `~/loki-data/gimle-qwen/source` for the cache-selection fix; no broad activation was run. Home Manager now generates the plist from store-backed `gateway.py` and its sibling worker files, and supplies the matching `~/.local/bin/llama-swap`. The boot wrapper waits for the encrypted mount and a Python 3.12 virtual environment. The key, checkpoints, model files, and provisioned native binary stay on that volume; the generation does not download them. The November 22 rollout changed only `dk.gimle.qwen`, retaining the existing boot wrapper, encrypted volume, private listener, and `KeepAlive=false`. The deployed source, exact receipts, backup paths, and restore conditions are in `~/loki-data/gimle-qwen/inkling-handoff.md`. Do not replace it with a generation that still points to the pre-gateway supervisor.

Installation requires the pinned 4-bit snapshot at `models/qwen3.5-9b-4bit`. Do not edit model files in place. Subsequent source updates require an explicit service update/restart. Installer refuses an existing plist. No automatic restart after footprint stop; inspect `last-exit.json` before starting again. This LaunchAgent requires a logged-in user domain and an already mounted encrypted volume; unattended boot recovery is not qualified.

Hugi client setup: `python3 scripts/gimle-qwen-client`. Private key/config under `~/.local/share/gimle-qwen`, existing-key strict SSH forwarding via `dk.huginn.gimle-qwen-tunnel`. Pi runtime loads this optional descriptor on next launch. Select **`gimle/qwen3.5-9b-4bit`** or **`gimle/inkling-2-mini`** in `/model`. The current in-memory model catalogue may require a new Pi launch. No roles/defaults changed.

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

The earlier November 22 recovery hold (both candidate and restored bootstrap returned status 5; snapshot `rollback-gateway.61p9og1u/`) was superseded by the authenticated Qwen startup recovery in `inkling-rollout/recovery-two.log`. If bootstrap returns 5 again, check the job, registered path and listeners before retrying. On macOS 26 use `launchctl bootout --wait gui/501/dk.gimle.qwen` for a settled scoped replacement. Restore the immediately preceding working plist if activation or authenticated readiness fails; never restore the retired quant entries from historical backups.

Rollback optional endpoint: boot out **only** `gui/501/dk.gimle.qwen`; on Hugi boot out `gui/$(id -u)/dk.huginn.gimle-qwen-tunnel`; remove only the optional private client descriptor/provider entry after backing it up. Restore SOUL/config only from the named hash-verified private backups and only on request. Mimer default and gateway require no restoration because they were never changed.

Remaining limitations: cold 128K prefill ~10 minutes; 128K decode ~14 tok/s; only one disk prefix retained, so switching Hugi/Loki sessions can evict it. No claim of broad agent-quality acceptance or hard memory enforcement. MTP tested slower; DFlash cache/server compatibility failed and 128K DFlash exceeded the sampled stop threshold, so neither is enabled.
## llama-swap

Model swapper for this endpoint, added 2026-11-17. One model is served at a time on :18789.

- `~/.local/bin/llama-swap` is the stateless CLI. The encrypted runtime holds `swap-registry.json` (held and previous models), `swap-state.json` (MLX settings only), and `model` (MLX weights link only).
- `use <id>` checks the artifact and sends an authenticated smoke request, which asks the gateway to select the requested model. The gateway stops the old worker, starts and verifies the new worker, then publishes the registry. A failed switch starts the previous worker; if rollback also fails, the gateway reports unavailable. `--dry-run` changes nothing.
- `init` lays the registry around the existing 9B deployment (moves `model/` to `models/<id>/`, recreates the symlink). One-time, first run.
- `status` reports active/previous/link/budget, the last-exit summary, and guard drift between the running threshold and the registry.
- `add <id> <repo> <revision> <ctx> <mem-gb> <target-gb> <stop-gb> [weights-gb] [max-output]` records an MLX candidate only; it does not add it to the gateway allowlist. Use `fetch` to stage an MLX checkpoint explicitly.
- Journal: `~/loki-data/gimle-qwen/llama-swap.log` (append-only, 0600).

### Inkling provisioning and selection

With the gateway running, send `model: "inkling-2-mini"` to `/v1/chat/completions`; the authenticated gateway holds the request while switching. `/v1/models` lists the qualified local artifacts and which one is active. Request `default_model` or `qwen3.5-9b-4bit` to return to MLX. Busy requests get 429.

Pin llama.cpp to merge commit `690b87d88151dbd775bb6eff5581663688785928` ([#32704](https://github.com/ggml-org/llama.cpp/pull/32704)). Apply `llama-server-auth-health.patch`. Use Apple Clang and the macOS SDK, not the Nix GNU toolchain. Configure with `-DGGML_METAL=ON -DGGML_METAL_EMBED_LIBRARY=ON -DBUILD_SHARED_LIBS=OFF -DLLAMA_BUILD_UI=OFF -DLLAMA_CURL=OFF -DLLAMA_BUILD_TESTS=OFF -DLLAMA_BUILD_EXAMPLES=OFF -DLLAMA_BUILD_TOOLS=ON`, then build the `llama-server` target in Release mode. Verify `--version` reports `690b87d` and exercise authenticated and anonymous health on a scratch loopback listener before placing it at `runtime/llama-server-690b87d` under the encrypted runtime. The worker listens only on `127.0.0.1:18790` and reads the same private bearer key from its file. Never expose or tunnel the worker port.

Fetch `Mainline_Support/Inkling-2-Mini-UD-Q4_K_M.gguf_file` from `unsloth/Inkling-2-Mini-GGUF` at `45fd08764f2b0bf16b03a5483a80e5c7aaec8772`. Do not substitute the repo-root variant. Verify size `16610544608` and SHA-256 `78fcedcf93c5d1bfe83e225513b71392bb52259be0eaa5f8899c856a2e5834ae` before renaming to `models/inkling-2-mini/Inkling-2-Mini-UD-Q4_K_M.gguf`. Register using the pinned `INKLING` entry in `llama_swap.py`; no download occurs in the worker.