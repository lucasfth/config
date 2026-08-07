{
  config,
  pkgs,
  lib,
  ...
}: {
  imports = [
    ./darwin/system.nix
    ./darwin/hostname.nix
    ./darwin/launchd.nix
    ./darwin/services.nix
    ./darwin/homebrew
  ];

  # macOS-only: aerospace is defined here, not in shared packages
  home-manager.users.${config.system.primaryUser}.home.packages = with pkgs; [pkgs.aerospace];
}
