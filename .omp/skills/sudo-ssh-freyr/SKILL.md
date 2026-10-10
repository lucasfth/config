---
type: skill
tags: [freyr, nixos, ssh, sudo, tailscale, gpu, whisperx, embeddings, reranker]
status: active
updated: 2026-10-10
---

# Sudo over SSH + Freyr

## Prerequisites

Env vars must be exported (set in `nix/common/shell/aliases.nix`):

- `ECORAY_FREYR_USER` — SSH user
- `ECORAY_FREYR_IP` — Tailscale IP

The `freyr` shell alias expands to `ssh "$ECORAY_FREYR_USER@$ECORAY_FREYR_IP"`.

## SSH

Regular SSH over Tailscale IP — Tailscale SSH is disabled on Freyr:

```bash
ssh "$ECORAY_FREYR_USER@$ECORAY_FREYR_IP"
# or: freyr
```

If `ControlMaster` socket errors: `ssh -o ControlMaster=no "$ECORAY_FREYR_USER@$ECORAY_FREYR_IP"`

## Sudo

Regular SSH handles sudo prompts fine (unlike Tailscale SSH which hung). Password is known.

## Long-running commands (nixos-rebuild)

Background builds and poll the log:

```bash
ssh "$ECORAY_FREYR_USER@$ECORAY_FREYR_IP" 'echo <psw> | sudo -S nixos-rebuild boot --flake ~/config#freyr --impure > /tmp/build.log 2>&1 &'
sleep 30 && ssh "$ECORAY_FREYR_USER@$ECORAY_FREYR_IP" 'tail -5 /tmp/build.log'
```

"Done. The new configuration is ..." → success.

## NixOS-specific gotchas

- `/etc` is **read-only** — `systemctl mask`, `cp` to `/etc/systemd/`, `tee /etc/...` all fail silently
- Display manager service: `display-manager`, **not** `sddm`
- Shebangs: `#!/usr/bin/env bash`, **not** `#!/bin/bash`
- SDDM + plasma6: don't set both — plasma6 brings its own SDDM

## Freyr hardware

| Thing | Path |
|-------|------|
| SSH | `ssh "$ECORAY_FREYR_USER@$ECORAY_FREYR_IP"` |
| ESP | `/dev/nvme0n1p1` → `/boot` (vfat) |
| Root | `/dev/nvme0n1p2` (ext4, UUID `84f85783-...`) |
| Swap | None |
| GPU 0 | RTX 3070 (NVIDIA 595, CUDA 13.2, display) |
| GPU 1 | RTX 5070 Ti (headless, needs 570+ driver) |
| CPU | AMD 5800X |

## Boot generations

- Gen 1: KDE Plasma, nixos-install, fallback (always boots)
- Gen 25+: flake builds, Openbox + NVIDIA 3070, working

## GPU services (live 2026-10-10)

Launched by `~/start-gpu-services.sh` (unit `klaus-inference.service`, tmux session `klaus-inference`, socket `/tmp/tmux-1000/default`):

| Port | Service | Model | GPU | Python env |
|------|---------|-------|-----|------------|
| 9090 | WhisperX (`server2.py`) | large-v3-turbo + pyannote | RTX 3070 (8 GB) | `~/inference-env` |
| 8081 | Embeddings (`embedding_server.py`) | intfloat/multilingual-e5-large-instruct | RTX 5070 Ti (16 GB) | `~/inference-env-cu128` |
| 8082 | Reranker (`reranker_server.py`) | BAAI/bge-reranker-v2-m3 | RTX 5070 Ti (16 GB) | `~/inference-env-cu128` |
| 5000 | Kokoro TTS (`~/klaus-services/kokoro_server.py`) | Kokoro | CPU | `~/inference-env` |
| 9880 | GPU pipeline worker (`gpu_pipeline_worker.py`) | | | `~/inference-env` |

- The 5070 Ti needs `~/inference-env-cu128` (torch 2.14.1, CUDA 13, sm_120). The old `~/inference-env` (torch cu126) fails on it with "no kernel image is available".
- Pin the card by UUID (`CUDA_VISIBLE_DEVICES=GPU-db9c3113-…` = 5070 Ti). nvidia-smi index order (bus) and CUDA index order (fastest first) differ.
- Consumers: Klaus's memory search uses :8081; the company library on VPS1 uses :8082 for reranking.
- Port 8083 (vision, Qwen2.5-VL) and 11434 (Ollama) are **not running**. This Mac's OMP config no longer uses them; `omp/models.yml` (Fylgje setup for remote machines) still lists `freyr-vision`/`freyr-ollama` and is stale.

```bash
curl -s http://$ECORAY_FREYR_IP:8081/health   # embeddings
curl -s http://$ECORAY_FREYR_IP:8082/health   # reranker
ssh $ECORAY_FREYR_USER@$ECORAY_FREYR_IP 'nvidia-smi --query-compute-apps=pid,gpu_bus_id,used_memory --format=csv,noheader'
```

Details and history: Muninn `tech/091-Freyr-GPU-and-Interview-Transcription.md`.
