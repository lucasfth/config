# Home-manager config for Mimer — inference server.
# Minimal standalone config — no shared module imports.
# Shared modules (packages, shell, git, tmux, vim) don't work
# in standalone home-manager context because they set options
# (home-manager.backupFileExtension, home-manager.extraSpecialArgs)
# that only exist inside NixOS/darwin integration modules.

{ config, pkgs, lib, ... }:

{
  home = {
    username = "ecoray-admin";
    homeDirectory = "/home/ecoray-admin";
  };

  programs.home-manager.enable = true;
  nixpkgs.config.allowUnfree = true;

  # Packages
  # NOTE: tmux NOT from Nix — Nix tmux 3.6a has ioctl incompatibility on Ubuntu.
  # Use Ubuntu system tmux (/usr/bin/tmux) instead.
  home.packages = with pkgs; [
    git gh curl wget
    htop btop nvitop
    # tmux removed — see note above
    ripgrep fd fzf bat eza jq tree
    cmake gcc gnumake python3
    zsh starship direnv delta zoxide
  ];

  # Zsh
  programs.zsh = {
    enable = true;
    oh-my-zsh = { enable = true; plugins = [ "git" ]; };
    initContent = ''
      export TMUX_TMPDIR=/tmp
      export PATH="$HOME/.local/bin:$PATH"
      alias ll="eza -la --icons"
      alias lg="lazygit"
      eval "$(direnv hook zsh)" 2>/dev/null
      eval "$(fzf --zsh)" 2>/dev/null
      eval "$(starship init zsh)" 2>/dev/null
    '';
  };

  programs.starship.enable = true;

  # Starship custom config — symlink from repo starship.toml
  home.file.".config/starship.toml".source = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/nixos-config/starship.toml";

  # Vim
  programs.vim = {
    enable = true;
    plugins = with pkgs.vimPlugins; [ catppuccin-vim lightline-vim ];
    settings = { number = true; tabstop = 2; shiftwidth = 2; expandtab = true; };
    extraConfig = "colorscheme catppuccin_mocha";
  };

  # Tmux — disabled: Nix tmux 3.6a has ioctl incompatibility on Ubuntu.
  # Use Ubuntu system tmux (/usr/bin/tmux) instead.
  programs.tmux.enable = false;

  # Git (no GPG)
  programs.git = {
    enable = true;
    settings = {
      user = {
        name = "ecoray-admin";
        email = "admin@ecoray.dk";
      };
      init.defaultBranch = "main";
      pull.rebase = true;
    };
  };

  # GPU pipeline worker
  systemd.user.services.gpu-pipeline-worker = {
    Unit = { Description = "GPU Pipeline Worker (:9880)"; After = [ "network.target" ]; };
    Service = {
      Type = "simple";
      ExecStart = "${pkgs.python3}/bin/python3 $HOME/klaus-services/gpu_pipeline_worker.py";
      Restart = "on-failure";
      RestartSec = 10;
      Environment = "PYTHONUNBUFFERED=1";
    };
    Install.WantedBy = [ "default.target" ];
  };
}
