# Headless NixOS base — minimal config for servers and inference boxes.
#
# This is the headless counterpart to nix/nixos/default.nix.
# It provides the essential NixOS configuration without any
# desktop environment, display manager, or graphical stack.
{ config, pkgs, lib, ... }:

{
  # ── Bootloader ────────────────────────────────────────────────
  boot.loader.systemd-boot.enable = true;
  boot.loader.efi.canTouchEfiVariables = true;
  boot.initrd.systemd.enable = true;
  boot.initrd.systemd.emergencyAccess = true;

  # ── Networking ────────────────────────────────────────────────
  networking.networkmanager.enable = true;
  networking.firewall.allowedTCPPorts = [ 22 ];
  services.tailscale.enable = true;

  # ── Time & Locale ─────────────────────────────────────────────
  time.timeZone = "Europe/Copenhagen";
  i18n.defaultLocale = "en_DK.UTF-8";
  console = {
    font = "Lat2-Terminus16";
    keyMap = "dk";
  };

  # ── Nix settings ──────────────────────────────────────────────
  nix.settings = {
    experimental-features = [ "nix-command" "flakes" ];
    auto-optimise-store = true;
    substituters = [
      "https://cache.nvidia.com"
      "https://nix-community.cachix.org"
      "https://cache.nixos.org"
    ];
    trusted-substituters = [
      "https://cache.nvidia.com"
      "https://nix-community.cachix.org"
    ];
  };

  nix.gc = {
    automatic = true;
    dates = "weekly";
    options = "--delete-older-than 14d";
  };

  # ── SSH ───────────────────────────────────────────────────────
  services.openssh = {
    enable = true;
    settings = {
      PasswordAuthentication = false;
      PermitRootLogin = "no";
    };
  };

  # ── Firmware / State ──────────────────────────────────────────
  hardware.enableRedistributableFirmware = true;
  system.stateVersion = "25.05";
}
