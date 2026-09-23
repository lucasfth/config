{
  config,
  pkgs,
  lib,
  flakeDir,
  ...
}: let
  generateOmpMcpConfig = pkgs.writeShellScript "generate-omp-mcp-config" ''
    set -euo pipefail
    SECRETS="$HOME/config/nix_secrets"
    SOURCE="$HOME/config/.omp/agent/mcp.json"
    OUT="$HOME/.omp/agent/mcp.json"

    if [ ! -f "$SECRETS" ]; then
      echo "generate-omp-mcp-config: nix_secrets not found" >&2
      exit 1
    fi
    if [ ! -f "$SOURCE" ]; then
      echo "generate-omp-mcp-config: tracked mcp.json not found" >&2
      exit 1
    fi

    set -a
    # shellcheck disable=SC1090
    source "$SECRETS"
    set +a
    if [ -z "''${MUNINN_MCP_URL:-}" ]; then
      echo "generate-omp-mcp-config: MUNINN_MCP_URL is not set" >&2
      exit 1
    fi

    mkdir -p "$(dirname "$OUT")"
    ${pkgs.jq}/bin/jq --arg url "$MUNINN_MCP_URL" \
      '.mcpServers.muninn = { type: "http", url: $url }' "$SOURCE" > "$OUT.tmp"
    mv "$OUT.tmp" "$OUT"
  '';

  generateRaycastAiProviders = pkgs.writeShellScript "generate-raycast-ai-providers" ''
    set -euo pipefail
    SECRETS="$HOME/config/nix_secrets"
    SOURCE="$HOME/config/raycast/ai/providers.yaml.template"
    OUT="$HOME/.local/state/raycast-ai/providers.yaml"

    if [ ! -f "$SECRETS" ]; then
      echo "generate-raycast-ai-providers: nix_secrets not found" >&2
      exit 1
    fi
    if [ ! -f "$SOURCE" ]; then
      echo "generate-raycast-ai-providers: tracked template not found" >&2
      exit 1
    fi

    set -a
    # shellcheck disable=SC1090
    source "$SECRETS"
    set +a
    if [ -z "''${ECORAY_MIMER_IP:-}" ]; then
      echo "generate-raycast-ai-providers: ECORAY_MIMER_IP is not set" >&2
      exit 1
    fi

    umask 077
    mkdir -p "$(dirname "$OUT")"
    export MIMER_BASE_URL="http://''${ECORAY_MIMER_IP}:8080"
    ${pkgs.gettext}/bin/envsubst '$MIMER_BASE_URL' < "$SOURCE" > "$OUT.tmp"
    mv "$OUT.tmp" "$OUT"
  '';
in {
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

      # ── Raycast AI custom providers ────────────────────────────────
      ".config/raycast/ai/providers.yaml" = {
        force = true;
        source = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.local/state/raycast-ai/providers.yaml";
      };

      # ── Raycast Script Commands ───────────────────────────────────
      ".local/share/raycast-scripts/ask-huginn.sh".source = "${flakeDir.outPath}/raycast-scripts/ask-huginn.sh";
      ".local/share/raycast-scripts/invert-scroll.applescript".source = "${flakeDir.outPath}/raycast-scripts/invert-scroll.applescript";

      ".config/btop/btop.conf".source = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/config/btop/btop.conf";
      ".config/btop/themes/catppuccin_mocha.theme".source = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/config/btop/themes/catppuccin_mocha.theme";
    };

  home.activation.generateOmpMcpConfig = lib.hm.dag.entryAfter ["writeBoundary"] ''
    $DRY_RUN_CMD ${generateOmpMcpConfig}
  '';

  home.activation.generateRaycastAiProviders = lib.mkIf pkgs.stdenv.isDarwin (lib.hm.dag.entryAfter ["writeBoundary"] ''
    $DRY_RUN_CMD ${generateRaycastAiProviders}
  '');

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

  # ── Sioyek: install into /Applications (macOS only) ──────────
  # Copy (not symlink) so Spotlight indexes it — the nix store is
  # excluded from Spotlight, and Raycast searches Spotlight.
  home.activation.installSioyek = lib.mkIf pkgs.stdenv.isDarwin (lib.hm.dag.entryAfter ["writeBoundary"] ''
    $DRY_RUN_CMD ${pkgs.writeShellScript "install-sioyek" ''
      set -euo pipefail
      SRC="${pkgs.sioyek}/Applications/sioyek.app"
      DST="/Applications/sioyek.app"
      if [ ! -f "$DST/Contents/MacOS/sioyek" ] || ! cmp -s "$SRC/Contents/MacOS/sioyek" "$DST/Contents/MacOS/sioyek"; then
        rm -rf "$DST"
        cp -R "$SRC" "$DST"
        echo "sioyek: installed $DST"
      fi
    ''}
  '');
}
