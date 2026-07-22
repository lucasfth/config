# Mimer services — llama-server + GPU pipeline worker
#
# Mimer runs two long-lived services:
#   1. llama-server (port 8080): Qwen LLM inference via llama.cpp
#   2. gpu-pipeline-worker (port 9880): Python FastAPI for agent pipelines
#
# Both require the NVIDIA GPU and nvidia-persistenced.
{ config, pkgs, lib, ... }:

let
  # ── Model path — overridable via NixOS module option pattern ─
  modelDir = "/data/models";
  modelFile = "Qwen3.5-122B-A10B-Q4_K_M.gguf";

  # llama.cpp with CUDA support
  llama-cpp-cuda = pkgs.llama-cpp.override {
    cudaSupport = true;
  };
in
{
  # ── NVIDIA persistence daemon (required for long-running GPU workloads) ──
  hardware.nvidia = {
    modesetting.enable = true;
    open = false;
    nvidiaSettings = true;
    package = config.boot.kernelPackages.nvidiaPackages.stable;
    powerManagement.enable = true;  # Enables nvidia-persistenced
  };

  # CUDA toolkit for GPU pipeline worker
  environment.systemPackages = with pkgs; [
    cudaPackages.cuda_nvcc
    cudaPackages.cudnn
  ];

  # ── llama-server — LLM inference on port 8080 ──────────────────
  systemd.services.llama-server = {
    description = "llama.cpp inference server (Qwen 122B on RTX PRO 6000)";
    after = [ "network.target" "nvidia-persistenced.service" ];
    requires = [ "nvidia-persistenced.service" ];
    wantedBy = [ "multi-user.target" ];

    # Run as ecoray-admin user
    serviceConfig = {
      User = "ecoray-admin";
      Group = "ecoray-admin";
      Restart = "always";
      RestartSec = 10;
      ExecStart = "${llama-cpp-cuda}/bin/llama-server \
        --model ${modelDir}/${modelFile} \
        --host 0.0.0.0 \
        --port 8080 \
        --n-gpu-layers 999 \
        --ctx-size 65536 \
        --batch-size 4096 \
        --threads 12 \
        --flash-attn on \
        --cache-type-k q8_0 \
        --cache-type-v q8_0 \
        --parallel 2";
      # Security hardening
      NoNewPrivileges = true;
      PrivateTmp = true;
      ProtectSystem = "strict";
      ProtectHome = false;  # needs access to /data/models
      ReadWritePaths = [ modelDir "/home/ecoray-admin" ];
    };
  };

  # ── GPU Pipeline Worker — Python FastAPI on port 9880 ──────────
  systemd.services.gpu-pipeline-worker = {
    description = "GPU pipeline worker (FastAPI agent pipelines on port 9880)";
    after = [ "network.target" "nvidia-persistenced.service" ];
    requires = [ "nvidia-persistenced.service" ];
    wantedBy = [ "multi-user.target" ];

    environment = {
      PYTHONUNBUFFERED = "1";
    };

    serviceConfig = {
      User = "ecoray-admin";
      Group = "ecoray-admin";
      WorkingDirectory = "/home/ecoray-admin/workspace/scripts";
      EnvironmentFile = "/run/secrets/mimer-env";   # MEILI_MASTER_KEY, PIPEDRIVE_API_TOKEN
      ExecStart = "${pkgs.python3}/bin/python3 gpu_pipeline_worker.py";
      Restart = "always";
      RestartSec = 5;
      # Security hardening
      NoNewPrivileges = true;
      PrivateTmp = true;
      ProtectSystem = "strict";
      ProtectHome = false;  # needs access to workspace scripts
      ReadWritePaths = [ "/home/ecoray-admin/workspace" ];
    };
  };

  # ── Tailscale — mesh VPN ───────────────────────────────────────
  services.tailscale.enable = true;

  # ── Firewall — allow inference + pipeline + SSH + Tailscale ────
  networking.firewall = {
    enable = true;
    allowedTCPPorts = [
      22    # SSH
      8080  # llama-server (Qwen inference)
      9880  # GPU pipeline worker
    ];
    # Tailscale interface is trusted
    trustedInterfaces = [ "tailscale0" ];
  };

  # ── /run/secrets directory ─────────────────────────────────────
  # Created as tmpfs so secrets exist only at runtime.
  # Secrets are provisioned by sops-nix/agenix (future) or manually.
  systemd.tmpfiles.rules = [
    "d /run/secrets 0750 root ecoray-admin -"
  ];
}
