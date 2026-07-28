# Home-manager entry module for lucas.
# Activated by nixosConfigurations."freyr" and darwinConfigurations."lucas-macbook-pro".
#
# Imports:
#   - packages    (CLI tooling)
#   - shell       (zsh + starship configuration)
#   - git.nix     (gitconfig)
#   - tmux.nix    (tmux config)
#   - vim.nix     (Neovim config)
#   - desktop     (Openbox, tint2, picom — Linux only)
#   - services    (GPU inference services — freyr only)
#   - dotfiles.nix (symlink management for btop, aerospace, etc.)

{ config, pkgs, lib, flakeDir, username, hostname, homeDirectory, stateVersion, ... }:

{
  imports = [
    ./common/packages
    ./common/shell
    ./common/git.nix
    ./common/tmux.nix
    ./common/herdr.nix
    ./common/vim.nix
    ./common/desktop
    ./common/ssh.nix
    ./common/dotfiles.nix
    # ./common/services/gpu-services.nix  # DEPRECATED — superseded by tmux (see nix/hosts/freyr/gpu-services.md)
  ];

  home = {
    username = lib.mkForce username;
    homeDirectory = lib.mkForce homeDirectory;
    stateVersion = lib.mkForce stateVersion;
  };

  # ── Fix ~/.nix-profile link (nix-darwin: new nix CLI vs home-manager mismatch) ──
  home.activation.linkNixProfile = lib.hm.dag.entryAfter ["linkGeneration"] (
    if pkgs.stdenv.isDarwin then ''
      rm -f "$HOME/.nix-profile"
      ln -sf ${config.home.path} "$HOME/.nix-profile"
    '' else ""
  );

  programs.home-manager.enable = true;

  # Allow unfree packages (slack, etc.)
  nixpkgs.config.allowUnfree = true;
}
