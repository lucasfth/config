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

  # macOS-only GUI tools are kept out of shared packages.
  home-manager.users.${config.system.primaryUser}.home.packages = with pkgs; [aerospace jankyborders];
}
