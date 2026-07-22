# NixOS module for Mimer — the inference oracle
#
# Composes:
#   - hardware-configuration.nix  (generated on first boot, stub for now)
#   - services.nix                (llama-server, GPU pipeline, Tailscale)
#   - nix/nixos/headless-base.nix (imported by flake)
#
# Mimer is a headless inference server. No desktop, no display manager,
# no windowing — just GPU compute, networking, and dev tooling.
{ config, pkgs, lib, ... }:

{
  imports = [
    # ── Hardware (generated on first NixOS boot) ────────────────
    ./hardware-configuration.nix

    # ── Mimer-specific services ─────────────────────────────────
    ./services.nix
  ];

  # ── Blacklist nouveau (conflicts with NVIDIA proprietary) ─────
  boot.blacklistedKernelModules = [ "nouveau" ];

  # ── NVIDIA container toolkit (Docker GPU passthrough) ─────────
  hardware.nvidia-container-toolkit.enable = true;

  # ── ecoray-admin user ─────────────────────────────────────────
  users.users.ecoray-admin = {
    isNormalUser = true;
    extraGroups = [ "wheel" "networkmanager" ];
    shell = pkgs.bash;
    openssh.authorizedKeys.keys = [
      "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIG7TF8cQ2yPS31ts4a7YSWspMQ9Z3+hjXfcEpIFCXpBN lucasfth@bjelke-torres.com"
      "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIKukjLpmhqr3HDL6VCCXMuzQQtuZ/xXbMz6ZIyp5P/E4 klaus-vps-gateway"
    ];
  };
}
