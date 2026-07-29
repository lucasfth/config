# NixOS system modules — imports nixos/ submodules and hardware config.
{
  config,
  pkgs,
  lib,
  ...
}: {
  imports = [
    ./hardware-configuration.nix
    ./desktop.nix
    ./gpu
  ];

  # ── Bootloader ────────────────────────────────────────────────
  boot.loader.systemd-boot.enable = true;
  boot.loader.efi.canTouchEfiVariables = true;
  boot.initrd.systemd.enable = true;
  boot.initrd.systemd.emergencyAccess = true;

  # ── Networking ─────────────────────────────────────────────────
  networking.networkmanager.enable = true;
  services.tailscale.enable = true;

  # ── Time & Locale ──────────────────────────────────────────────
  time.timeZone = "Europe/Copenhagen";
  i18n.defaultLocale = "en_DK.UTF-8";
  console = {
    font = "Lat2-Terminus16";
    keyMap = "dk";
  };

  services.xserver.xkb = {
    layout = "dk";
    variant = "";
    options = "compose:rctrl";
  };

  # ── User ───────────────────────────────────────────────────────
  users.users.lucas.openssh.authorizedKeys.keys = [
    "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIG7TF8cQ2yPS31ts4a7YSWspMQ9Z3+hjXfcEpIFCXpBN lucasfth@bjelke-torres.com"
    "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIKukjLpmhqr3HDL6VCCXMuzQQtuZ/xXbMz6ZIyp5P/E4 klaus-vps-gateway"
  ];
  users.users.lucas = {
    isNormalUser = true;
    extraGroups = ["wheel" "docker" "networkmanager"];
    shell = pkgs.zsh;
  };

  # ── Nix settings ───────────────────────────────────────────────
  nix.settings = {
    experimental-features = ["nix-command" "flakes"];
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

  # ── Docker ─────────────────────────────────────────────────────
  virtualisation.docker = {
    enable = true;
    enableNvidia = false;
    rootless.enable = false;
    rootless.setSocketVariable = false;
    daemon.settings.features.buildkit = true;
  };

  # ── SSH ────────────────────────────────────────────────────────
  services.openssh = {
    enable = true;
    settings = {
      PasswordAuthentication = false;
      PermitRootLogin = "no";
    };
  };

  # Ghostty terminfo for SSH clients (headless — just the terminfo, not the GUI)
  environment.systemPackages = [pkgs.ghostty];

  # ── Firmware / State ───────────────────────────────────────────
  hardware.enableRedistributableFirmware = true;
  system.stateVersion = "25.05";
}
