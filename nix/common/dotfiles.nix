{
  config,
  pkgs,
  lib,
  flakeDir,
  ...
}: {
  home.file =
    {
      # ── Vault (Obsidian memory — separate git repo) ─────────────
      "vault".source = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/Desktop/code/loki-obsidian-memory";

      # ── Cross-platform dotfiles ─────────────────────────────────
      ".config/starship.toml".source = "${flakeDir.outPath}/starship.toml";
      ".config/ghostty/config".source = "${flakeDir.outPath}/config.ghostty";
      ".config/lazygit/config.yml".source = "${flakeDir.outPath}/lazygit/config.yml";
      ".tmux.conf".source = "${flakeDir.outPath}/.tmux.conf";
      ".config/zed/settings.json".source = "${flakeDir.outPath}/zed/settings.json";

      # ── config-add helper (cross-platform) ────────────────────
      ".local/bin/config-add".source = "${flakeDir.outPath}/scripts/config-add";
    }
    // lib.optionalAttrs pkgs.stdenv.isDarwin {
      # ── macOS-only dotfiles ─────────────────────────────────────
      ".aerospace.toml".source = "${flakeDir.outPath}/.aerospace.toml";
      "Library/Application Support/sioyek/prefs_user.config".source = "${flakeDir.outPath}/sioyek/prefs_user.config";
      "Library/Application Support/com.raycast.macos/Extensions/invert-scroll.applescript".source = "${flakeDir.outPath}/raycast-scripts/invert-scroll.applescript";

      # ── Raycast Script Commands ───────────────────────────────────
      ".local/share/raycast-scripts/ask-huginn.sh".source = "${flakeDir.outPath}/raycast-scripts/ask-huginn.sh";
      ".local/share/raycast-scripts/invert-scroll.applescript".source = "${flakeDir.outPath}/raycast-scripts/invert-scroll.applescript";

      # ── btop ────────────────────────────────────────────────────
      ".config/btop/btop.conf".source = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/config/btop/btop.conf";
      ".config/btop/themes/catppuccin_mocha.theme".source = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/config/btop/themes/catppuccin_mocha.theme";

      # ── Sketchybar ──────────────────────────────────────────────
      ".config/sketchybar".source = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/config/sketchybar";
    };

  # ── Mokka dynamic wallpaper generation (macOS only) ─────────
  home.activation.generateMokka = lib.mkIf pkgs.stdenv.isDarwin (lib.hm.dag.entryAfter ["writeBoundary"] ''
    $DRY_RUN_CMD ${pkgs.writeShellScript "generate-mokka" ''
      set -euo pipefail
      SCRIPT="$HOME/config/scripts/mokka/generate.py"
      OUTDIR="$HOME/config/scripts/mokka/output"
      if [ -f "$SCRIPT" ]; then
        echo "Mokka: generating dynamic wallpaper..."
        ${pkgs.python312.withPackages (ps: [ps.pillow])}/bin/python3 "$SCRIPT"
        # Copy to timestamped file, write flag for .zshrc to reload
        TARGET="$HOME/Pictures/wallpapers/mokka-$(date +%Y%m%d-%H%M%S).heic"
        cp "$OUTDIR/mokka.heic" "$TARGET"
        touch "$HOME/.mokka-reload"
        echo "Mokka: done → $TARGET"
      fi
    ''}
  '');
}
