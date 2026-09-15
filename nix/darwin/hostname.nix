{
  config,
  pkgs,
  lib,
  ...
}: {
  nixpkgs.config.allowUnfree = true;

  # hostname + primaryUser are set in flake.nix per-host

  # Match the GID from the official Nix installer (350, not 30000)
  ids.gids.nixbld = 350;

  nix = {
    # Determinate Nix manages the Nix installation itself; nix-darwin must not.
    enable = false;
    settings = {
      trusted-users = ["${config.system.primaryUser}" "@admin"];
      auto-optimise-store = true;
    };
    # GC is managed by Determinate Nix; nix-darwin's gc requires nix.enable.
  };

  environment.systemPackages = with pkgs; [
    vim
    wget
  ];

  system.stateVersion = 4;
}
