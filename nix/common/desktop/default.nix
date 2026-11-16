# Desktop dotfiles — Openbox + tint2 + picom + wallpaper
# Applies to: NixOS hosts with Openbox (Freyr)
# Theme: Catppuccin Mocha (#1e1e2e base, #cdd6f4 text, etc.)
{
  config,
  pkgs,
  lib,
  flakeDir,
  ...
}: let
  cfg = config.lib.file.mkOutOfStoreSymlink;
  configDir = "${config.home.homeDirectory}/config";
in
  lib.mkIf pkgs.stdenv.hostPlatform.isLinux {
    # ── Home-manager dotfile management ─────────────────────────
    home.file = {
      # Openbox
      ".config/openbox/rc.xml".source = cfg "${configDir}/nix/common/desktop/openbox-rc.xml";
      ".config/openbox/menu.xml".source = cfg "${configDir}/nix/common/desktop/openbox-menu.xml";
      ".config/openbox/autostart".source = cfg "${configDir}/nix/common/desktop/openbox-autostart";

      # Tint2
      ".config/tint2/tint2rc".source = cfg "${configDir}/nix/common/desktop/tint2rc";

      # Picom
      ".config/picom/picom.conf".source = cfg "${configDir}/nix/common/desktop/picom.conf";

      # Neovim
      ".config/nvim/init.lua".source = cfg "${configDir}/nix/common/desktop/nvim-init.lua";

      # Wallpaper setter
      ".local/bin/set-wallpaper".source = cfg "${configDir}/nix/common/desktop/set-wallpaper";
    };

    # ── Additional packages needed by desktop config ────────────
    home.packages = with pkgs; [
      picom # compositor (transparency, shadows)
      feh # wallpaper setter
      imagemagick # for set-wallpaper script (generate)
      brightnessctl # brightness control
    ];
  }
