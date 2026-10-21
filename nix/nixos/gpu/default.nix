# NixOS System Module — GPU Compute Services for Freyr
# Dual NVIDIA GPU: RTX 3070 (8GB) + RTX 5070 Ti (16GB)
# Driver: NVIDIA legacy_580 (580.142), open kernel modules, CUDA 13.0
#
# User-level services are managed via tmux (not systemd — see nix/hosts/freyr/gpu-services.md)
# User-level service definitions are in nix/common/services/gpu-services.nix
#
# PCIe layout (from nvidia-smi topo -m):
#   GPU 0: 00000000:23:00.0 (RTX 3070, 8GB, monitor on DP-1)
#   GPU 1: 00000000:2D:00.0 (RTX 5070 Ti, 16GB, headless compute)
#   Topology: PHB between GPUs (separate PCIe Host Bridges)
#
# NOTE: In nvidia-smi, GPU 0 = 3070, GPU 1 = 5070 Ti.
# The CUDA_VISIBLE_DEVICES mapping in user services handles the
# service→GPU routing.
{
  config,
  pkgs,
  lib,
  ...
}: {
  # ── NVIDIA Driver ──────────────────────────────────────────────
  # legacy_580 (580.142) required for Blackwell (RTX 5070 Ti) support
  hardware.nvidia = {
    modesetting.enable = true;
    open = true;
    nvidiaSettings = true;
    package = config.boot.kernelPackages.nvidiaPackages.legacy_580;
    prime.offload.enable = false;
    prime.offload.enableOffloadCmd = false;
  };

  # Blacklist nouveau — mandatory for NVIDIA proprietary driver
  boot.blacklistedKernelModules = ["nouveau"];

  # ── OpenGL/Vulkan ─────────────────────────────────────────────
  hardware.graphics = {
    enable = true;
    enable32Bit = true;
  };

  # ── CUDA Toolkit (dev tools) ──────────────────────────────────
  environment.systemPackages = with pkgs; [
    cudaPackages.cuda_nvcc
    cudaPackages.cudnn
  ];

  # ── NVIDIA Container Toolkit (Docker GPU passthrough) ─────────
  hardware.nvidia-container-toolkit.enable = true;

  # ── Prevent Suspend/Sleep (server must stay awake) ───────────
  services.logind.settings = {
    Login = {
      HandleLidSwitch = "ignore";
      HandleSuspendKey = "ignore";
      HandleHibernateKey = "ignore";
    };
  };

  # ── Linger for user services ──────────────────────────────────
  # Allows GPU services (systemd user units) to survive logout
  users.users.lucas.linger = true;

  # ── Firewall — SSH + GPU service ports ────────────────────────
  networking.firewall.allowedTCPPorts = [
    22 # SSH
    8081 # Embedding API
    8082 # Reranker API
    8083 # Vision Qwen
    5000 # Piper TTS (future)
  ];
  # Speech recordings must reach WhisperX through the private mesh, not LAN.
  networking.firewall.interfaces.tailscale0.allowedTCPPorts = [9090];

  # ── Tailscale — internal mesh networking ─────────────────────
  services.tailscale.enable = true;

  # ── CUDA Library Symlinks (tmpfiles.d) ──────────────────────
  # Creates symlinks in /run/opengl-driver/lib from CUDA merged store.
  # Required because whisper-cli + some torch builds resolve libraries
  # via the opengl-driver path rather than the Nix store.
  #
  # CUDA merged path (CUDA 12.9, provides libcudart.so.12.9.79 etc.):
  #   /nix/store/z0npj5a5fahsqn6snjav5hq5dy34vcj7-cuda-merged-12.9
  #
  # WARNING: The Nix store hash is pinned. If nixpkgs is updated,
  # this path will change. Find the new path with:
  #   ls /nix/store/*-cuda-merged-*/lib/libcudart.so
  systemd.tmpfiles.rules = [
    "L+ /run/opengl-driver/lib/libcudart.so     - - - - /nix/store/z0npj5a5fahsqn6snjav5hq5dy34vcj7-cuda-merged-12.9/lib/libcudart.so"
    "L+ /run/opengl-driver/lib/libcudart.so.12  - - - - /nix/store/z0npj5a5fahsqn6snjav5hq5dy34vcj7-cuda-merged-12.9/lib/libcudart.so.12"
    "L+ /run/opengl-driver/lib/libcublas.so     - - - - /nix/store/z0npj5a5fahsqn6snjav5hq5dy34vcj7-cuda-merged-12.9/lib/libcublas.so"
    "L+ /run/opengl-driver/lib/libcublas.so.12  - - - - /nix/store/z0npj5a5fahsqn6snjav5hq5dy34vcj7-cuda-merged-12.9/lib/libcublas.so.12"
    "L+ /run/opengl-driver/lib/libcublasLt.so   - - - - /nix/store/z0npj5a5fahsqn6snjav5hq5dy34vcj7-cuda-merged-12.9/lib/libcublasLt.so"
    "L+ /run/opengl-driver/lib/libcublasLt.so.12 - - - - /nix/store/z0npj5a5fahsqn6snjav5hq5dy34vcj7-cuda-merged-12.9/lib/libcublasLt.so.12"
    "L+ /run/opengl-driver/lib/libcufft.so      - - - - /nix/store/z0npj5a5fahsqn6snjav5hq5dy34vcj7-cuda-merged-12.9/lib/libcufft.so"
    "L+ /run/opengl-driver/lib/libcufft.so.11   - - - - /nix/store/z0npj5a5fahsqn6snjav5hq5dy34vcj7-cuda-merged-12.9/lib/libcufft.so.11"
  ];
}
