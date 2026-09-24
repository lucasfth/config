# Freyr GPU Inference Services

## Overview

Freyr runs 6 GPU inference services managed by a **tmux session** named `klaus-inference`. The session provides auto-restart (via `while true` loops) and easy monitoring via `tmux attach`.

**Startup script:** `/home/lucas/klaus-services/start-services.sh`
**Configuration was never managed by systemd** — a systemd Nix definition existed as a draft (`nix/common/services/gpu-services.nix`) but was never deployed. The tmux approach is simpler, more observable, and the canonical method.

## Services

| Window | Name | Port | Device | Binary/Model |
|--------|------|------|--------|--------------|
| 0 | embedding | :8081 | GPU 0 (5070 Ti) | `embedding_server.py` (sentence-transformers) |
| 1 | reranker | :8082 | CPU | `reranker_server.py` (cross-encoder) |
| 2 | whisperx | :9090 | Dual-GPU | `server2.py` (WhisperX STT + diarization) |
| 3 | vision | :8083 | GPU 1 (3070) | Qwen2-VL via `vision_server.sh` |
| 4 | piper | :5000 | CPU | `piper_server.py` (Piper TTS) |
| 5 | ollama-qwen | :11434 | GPU 1 (3070) | `ollama serve` (Qwen via Ollama) |

## GPU Mapping

**CRITICAL: CUDA_VISIBLE_DEVICES numbering:**

| CUDA index | Physical GPU |
|------------|-------------|
| `0` | NVIDIA RTX 5070 Ti (16 GB) |
| `1` | NVIDIA RTX 3070 (8 GB) |

This was previously inverted in the draft Nix systemd config — the tmux scripts have the correct mapping.

## Architecture

Each service runs in its own tmux window, wrapped in a `while true` loop:

```bash
while true; do
  # service command here
  echo "[$(date)] <service> crashed — restarting in 3s..."
  sleep 3
done
```

If any service crashes, it restarts automatically after 3 seconds. The tmux session persists across SSH disconnects.

## Managing Services

```bash
# Start all services (kills old instances first)
bash /home/lucas/klaus-services/start-services.sh

# Attach to the tmux session (monitor all windows)
tmux attach -t klaus-inference

# Switch between windows: Ctrl-B then window number (0-5)
# Scroll in a window: Ctrl-B [ then arrow keys / page up/down

# Kill everything (including the session)
tmux kill-session -t klaus-inference

# Check individual service health
curl -s http://localhost:8081/   # Embedding (expects 404 = alive)
curl -s http://localhost:8082/   # Reranker
curl -s http://localhost:9090/   # WhisperX
curl -s http://localhost:5000/   # Piper TTS
curl -s http://localhost:8083/   # Vision Qwen
curl -s http://localhost:11434/  # Ollama (expects 200)
```

## Logs

- Each service logs to its tmux window (visible via `tmux attach`)
- Ollama additionally logs to `$HOME/ollama.log` (piped via `tee`)
- GPU pipeline worker logs to `/tmp/gpu-pipeline-worker.log` (if running separately)

## Why Not systemd?

The original plan used a Nix systemd user service (`nix/common/services/gpu-services.nix`, never deployed). This was abandoned because:

1. **Observability:** `tmux attach` gives live multi-window view of all services
2. **Simplicity:** No need to maintain Nix service definitions
3. **Flexibility:** Easy to restart individual windows, add/remove services
4. **Auto-restart:** `while true` loops provide the same crash recovery as systemd `Restart=always`
5. **No Nix rebuild:** Changes to service commands don't require `nixos-rebuild`

## Network

All services listen on `0.0.0.0` and are reachable through Freyr's private Tailscale address:
- Ports 22 (SSH), 8081, 8082, 9090, 5000, 8083, 11434 open via firewall
- Tailscale provides secure connectivity for remote clients (Klaus VPS)

## Dependencies

- Python venv: `/home/lucas/inference-env/`
- NVIDIA drivers: NixOS-managed (proprietary, CUDA toolkit)
- Ollama: installed via nixpkgs (in `nix/common/packages/apps.nix`)
- Models cached in HuggingFace cache and Ollama model store

## Related Files

- Start script: `/home/lucas/klaus-services/start-services.sh`
- Draft systemd config (deprecated): `nix/common/services/gpu-services.nix`
- GPU system config: `nix/nixos/gpu/default.nix`
- Freyr host config: `nix/hosts/freyr/default.nix`
