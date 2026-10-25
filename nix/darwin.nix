{
  config,
  pkgs,
  lib,
  hostname,
  ...
}: {
  imports = [
    ./darwin/system.nix
    ./darwin/hostname.nix
    ./darwin/launchd.nix
    ./darwin/services.nix
    ./darwin/davinci-resolve.nix
    ./darwin/gimle.nix
    ./darwin/homebrew
  ];

  programs.resolveStudio = lib.mkIf (config.networking.hostName == "lucas-macbook-pro") {
    enable = true;
    installer = {
      name = "DaVinci-Resolve-Studio-21.1.1.pkg";
      hash = "sha256-WK7esoMidMzUCb8ceFHwkoUbhLDjFrDHGPymJnpSkt4=";
    };
  };

  # macOS-only GUI tools are kept out of shared packages.
  home-manager.users.${config.system.primaryUser}.home.packages =
    lib.optionals (builtins.elem hostname ["lucas-macbook-pro" "gimle"]) (with pkgs; [aerospace jankyborders]);
}
