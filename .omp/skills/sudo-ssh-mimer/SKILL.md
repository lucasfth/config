---
name: sudo-ssh-mimer
description: Use when administering Mimer over SSH, managing its Ubuntu GPU host, or troubleshooting Tailscale, llama.cpp, and OMP inference services
type: skill
tags: [mimer, ubuntu, ssh, tailscale, llama, llm, omp]
status: active
updated: 2026-07-23
---

# Mimer (Klaus)

Ecoray GPU server running llama.cpp inference.

## Prerequisites

Env vars must be exported (set in `nix/common/shell/aliases.nix`):

- `ECORAY_MIMER_USER` — SSH user (`ecoray-admin`)
- `ECORAY_MIMER_IP` — Tailscale IP

The `mimer` shell alias expands to `ssh "$ECORAY_MIMER_USER@$ECORAY_MIMER_IP"`.

## SSH

```bash
ssh "$ECORAY_MIMER_USER@$ECORAY_MIMER_IP"
# or: mimer
```

## LLM server

llama.cpp serving Qwen3.5-122B-A10B-Q4_K_M.gguf (MoE, 122B total / 10B active) on port 8080.

### Status

```bash
curl -s http://localhost:8080/health          # {"status":"ok"}
curl -s http://localhost:8080/v1/models       # list loaded models
```

But since it's remote, tunnel or SSH-port-forward first:

```bash
ssh -L 8080:localhost:8080 "$ECORAY_MIMER_USER@$ECORAY_MIMER_IP"
```

### Process management

Runs inside a tmux session named `qwen-server`. To inspect:

```bash
ssh "$ECORAY_MIMER_USER@$ECORAY_MIMER_IP" tmux capture-pane -t qwen-server -p
```

Server binary: `/home/ecoray-admin/llama.cpp/build/bin/llama-server`
Model path: `/home/ecoray-admin/llama.cpp/models/Qwen3.5-122B-A10B-Q4_K_M.gguf`
Log: `/tmp/llama-server.log`

## Mimer hardware

| Thing | Path |
|-------|------|
| SSH | `ssh "$ECORAY_MIMER_USER@$ECORAY_MIMER_IP"` |
| Hostname | Klaus |
| OS | Ubuntu 24.04.4 LTS |
| CPU | AMD Ryzen 7 9700X (8-core) |
| GPU | NVIDIA RTX PRO 6000 Blackwell, 96 GB VRAM, driver 580 |
| RAM | 123 GB |
| ESP | `/dev/nvme0n1p1` → `/boot/efi` (511M) |
| Root | `/dev/nvme0n1p2` (908 GB, 717G free) |

## OMP integration

Mimer serves as the **smol** model role in OMP (`~/.omp/agent/config.yml`):

```yaml
modelRoles:
  smol: mimer/Qwen3.5-122B-A10B-Q4_K_M.gguf:off
```

The `:off` suffix disables thinking. The provider is defined in `~/.omp/agent/models.yml`:

```yaml
providers:
  mimer:
    baseUrl: http://$ECORAY_MIMER_IP:8080
    auth: none
    api: openai-completions
    models:
      - id: Qwen3.5-122B-A10B-Q4_K_M.gguf
        name: Qwen3.5-122B-A10B (Mimer)
        reasoning: true
        input: [text]
        contextWindow: 65536
        maxTokens: 16384
        compat:
          thinkingFormat: qwen-chat-template
          reasoningContentField: reasoning_content
```

### Thinking control

This is a pure reasoning model. To disable thinking, send `chat_template_kwargs: {"enable_thinking": false}` in the request body — NOT a top-level `enable_thinking`. The `thinkingFormat: qwen-chat-template` compat tells OMP to use this wire format.

Without this, all tokens go to `reasoning_content` and `content` is empty.

### Direct access

Tailscale IPs are reachable directly from Lucas's Mac — no SSH tunnel needed for API calls. OMP's models.yml uses `$ECORAY_MIMER_IP:8080`.
