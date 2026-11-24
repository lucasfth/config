{
  config,
  pkgs,
  lib,
  hostname,
  ...
}: let
  conduitDesktop = pkgs.callPackage ./darwin/hermes-conduit-desktop.nix {};
in {
  imports = [
    ./darwin/system.nix
    ./darwin/hostname.nix
    ./darwin/launchd.nix
    ./darwin/services.nix
    ./darwin/davinci-resolve.nix
    ./darwin/gimle.nix
    ./darwin/hermes-cache-cleanup.nix
    ./darwin/homebrew
  ];

  programs.resolveStudio = lib.mkIf (config.networking.hostName == "lucas-macbook-pro") {
    enable = true;
    installer = {
      name = "DaVinci-Resolve-Studio-21.1.1.pkg";
      hash = "sha256-WK7esoMidMzUCb8ceFHwkoUbhLDjFrDHGPymJnpSkt4=";
    };
  };

  home-manager.users.${config.system.primaryUser} = {
    # macOS-only GUI tools are kept out of shared packages.
    home.packages =
      lib.optionals (builtins.elem hostname ["lucas-macbook-pro" "gimle"]) (with pkgs; [aerospace jankyborders])
      ++ lib.optionals (hostname == "lucas-macbook-pro") [conduitDesktop];

    # Home Manager installs its agents after linking the AeroSpace config.
    launchd.agents.hermes-conduit-desktop = lib.mkIf (hostname == "lucas-macbook-pro") {
      enable = true;
      config = {
        Label = "org.nixos.hermes-conduit-desktop";
        ProgramArguments = [
          "${pkgs.writeShellScript "open-hermes-conduit-desktop" ''
            for attempt in {1..60}; do
              if ${pkgs.aerospace}/bin/aerospace reload-config --no-gui; then
                exec /usr/bin/open -g "${conduitDesktop}/Applications/Conduit Desktop.app"
              fi
              sleep 1
            done
            echo 'Conduit Desktop: AeroSpace config not ready after 60 attempts' >&2
            exit 1
          ''}"
        ];
        RunAtLoad = true;
        KeepAlive = false;
      };
    };
  };
}
