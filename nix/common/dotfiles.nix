{
  config,
  pkgs,
  lib,
  flakeDir,
  hostname,
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

    umask 077
    mkdir -p "$(dirname "$OUT")"
    if [ -n "''${COMPANY_LIBRARY_MCP_URL:-}" ] && [ -n "''${COMPANY_LIBRARY_MCP_TOKEN:-}" ]; then
      ${pkgs.jq}/bin/jq --arg url "$MUNINN_MCP_URL" \
        --arg library_url "$COMPANY_LIBRARY_MCP_URL" \
        --arg library_token "$COMPANY_LIBRARY_MCP_TOKEN" \
        '.mcpServers.muninn = { type: "http", url: $url }
        | .mcpServers.company_library = { type: "http", url: $library_url, headers: { Authorization: ("Bearer " + $library_token) } }' \
        "$SOURCE" > "$OUT.tmp"
    else
      ${pkgs.jq}/bin/jq --arg url "$MUNINN_MCP_URL" \
        '.mcpServers.muninn = { type: "http", url: $url }' "$SOURCE" > "$OUT.tmp"
    fi
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
    export NEO_PROXY_URL NEO_PROXY_API_KEY
    ${pkgs.gettext}/bin/envsubst '$MIMER_BASE_URL $NEO_PROXY_URL $NEO_PROXY_API_KEY' < "$SOURCE" > "$OUT.tmp"
    mv "$OUT.tmp" "$OUT"
  '';
in {
  home.file =
    {
      # ── Cross-platform dotfiles ─────────────────────────────────
      ".config/starship.toml".source = "${flakeDir.outPath}/configs/starship/starship.toml";
      ".config/ghostty/config".source = "${flakeDir.outPath}/configs/ghostty/config";
      # LazyGit uses the native macOS config directory when XDG_CONFIG_HOME is unset.
      ${
        if pkgs.stdenv.isDarwin
        then "Library/Application Support/lazygit/config.yml"
        else ".config/lazygit/config.yml"
      }.source = "${flakeDir.outPath}/configs/lazygit/config.yml";
      ".tmux.conf".source = "${flakeDir.outPath}/configs/tmux/tmux.conf";
      ".config/zed/settings.json".source = "${flakeDir.outPath}/configs/zed/settings.json";

      # ── config-add helper (cross-platform) ────────────────────
      ".local/bin/config-add".source = "${flakeDir.outPath}/scripts/config-add";
      ".local/bin/sigyn-vnc".source = "${flakeDir.outPath}/scripts/sigyn-vnc";
    }
    // lib.optionalAttrs (hostname != "gimle") {
      "muninn".source = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/Desktop/code/muninn";
      ".omp/agent/AGENTS.md" = {
        force = true;
        source = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/config/.omp/agent/AGENTS.md";
      };
      ".omp/agent/RULES.md" = {
        force = true;
        source = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/config/.omp/agent/RULES.md";
      };
      ".omp/agent/config.yml" = {
        force = true;
        source = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/config/.omp/agent/config.yml";
      };
    }
    // lib.optionalAttrs (pkgs.stdenv.isDarwin && hostname == "lucas-macbook-pro") {
      # The readable backup mount is specific to the laptop.
      "muninn-readable".source = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.local/share/muninn-volume/vault";
    }
    // lib.optionalAttrs (pkgs.stdenv.isDarwin && builtins.elem hostname ["lucas-macbook-pro" "gimle"]) {
      ".aerospace.toml".source = "${flakeDir.outPath}/configs/aerospace/aerospace.toml";
      "Library/Application Support/sioyek/prefs_user.config".source = "${flakeDir.outPath}/configs/sioyek/prefs_user.config";
      "Library/Application Support/com.raycast.macos/Extensions/invert-scroll.applescript".source = "${flakeDir.outPath}/raycast/scripts/invert-scroll.applescript";
      ".local/bin/sigyn-screen".source = "${flakeDir.outPath}/scripts/sigyn-screen";
      ".local/bin/muninn-refresh".source = pkgs.writeShellScript "muninn-refresh" ''
        exec ${pkgs.python3}/bin/python3 "${config.home.homeDirectory}/config/scripts/muninn-refresh.py" "$@"
      '';
      ".local/bin/apply-syntax-highlight-config".source = pkgs.writeShellScript "apply-syntax-highlight-config" ''
        exec ${pkgs.python3}/bin/python3 "${flakeDir.outPath}/scripts/apply-syntax-highlight-config.py" "${flakeDir.outPath}/configs/syntax-highlight"
      '';
      ".local/bin/apply-spotifast-config".source = pkgs.writeShellScript "apply-spotifast-config" ''
        exec ${pkgs.python3}/bin/python3 "${flakeDir.outPath}/scripts/apply-spotifast-config.py" "${flakeDir.outPath}/configs/spotifast"
      '';

      # ── Raycast AI custom providers ────────────────────────────────
      ".config/raycast/ai/providers.yaml" = {
        force = true;
        source = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/.local/state/raycast-ai/providers.yaml";
      };

      # ── Raycast Script Commands ───────────────────────────────────
      ".local/share/raycast-scripts/ask-huginn.sh".source = "${flakeDir.outPath}/raycast/scripts/ask-huginn.sh";
      ".local/share/raycast-scripts/invert-scroll.applescript".source = "${flakeDir.outPath}/raycast/scripts/invert-scroll.applescript";

      ".config/btop/btop.conf".source = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/config/configs/btop/btop.conf";
      ".config/btop/themes/catppuccin_mocha.theme".source = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/config/configs/btop/themes/catppuccin_mocha.theme";
    };

  home.activation.generateOmpMcpConfig = lib.mkIf (hostname != "gimle") (lib.hm.dag.entryAfter ["writeBoundary"] ''
    $DRY_RUN_CMD ${generateOmpMcpConfig}
  '');

  home.activation.generateRaycastAiProviders = lib.mkIf (pkgs.stdenv.isDarwin && builtins.elem hostname ["lucas-macbook-pro" "gimle"]) (lib.hm.dag.entryAfter ["writeBoundary"] ''
    $DRY_RUN_CMD ${generateRaycastAiProviders}
  '');

  home.activation.configureSyntaxHighlight = lib.mkIf (pkgs.stdenv.isDarwin && builtins.elem hostname ["lucas-macbook-pro" "gimle"]) (lib.hm.dag.entryAfter ["writeBoundary"] ''
    if /usr/bin/pgrep -x "Syntax Highlight" >/dev/null; then
      echo "Syntax Highlight: quit the app and run apply-syntax-highlight-config to apply preferences."
    else
      $DRY_RUN_CMD ${pkgs.python3}/bin/python3 "${flakeDir.outPath}/scripts/apply-syntax-highlight-config.py" "${flakeDir.outPath}/configs/syntax-highlight"
    fi
  '');

  home.activation.configureSpotifast = lib.mkIf (pkgs.stdenv.isDarwin && builtins.elem hostname ["lucas-macbook-pro" "gimle"]) (lib.hm.dag.entryAfter ["writeBoundary"] ''
    if /usr/bin/pgrep -x "Spotifast" >/dev/null; then
      echo "Spotifast: quit the app and run apply-spotifast-config to apply preferences."
    else
      $DRY_RUN_CMD ${pkgs.python3}/bin/python3 "${flakeDir.outPath}/scripts/apply-spotifast-config.py" "${flakeDir.outPath}/configs/spotifast"
    fi
  '');

  # ── Mokka dynamic wallpaper generation (macOS only) ─────────
  home.activation.generateMokka = lib.mkIf (pkgs.stdenv.isDarwin && builtins.elem hostname ["lucas-macbook-pro" "gimle"]) (lib.hm.dag.entryAfter ["writeBoundary"] ''
    $DRY_RUN_CMD ${pkgs.writeShellScript "generate-mokka" ''
      set -euo pipefail
      SCRIPT="$HOME/config/scripts/mokka/generate.py"
      OUTDIR="$HOME/config/scripts/mokka/output"
      if [ -f "$SCRIPT" ]; then
        echo "Mokka: generating dynamic wallpaper..."
        ${pkgs.python312.withPackages (ps: [ps.pillow])}/bin/python3 "$SCRIPT"
        # Copy to timestamped file, write flag for .zshrc to reload
        mkdir -p "$HOME/Pictures/wallpapers"
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
  home.activation.installSioyek = lib.mkIf (pkgs.stdenv.isDarwin && builtins.elem hostname ["lucas-macbook-pro" "gimle"]) (lib.hm.dag.entryAfter ["writeBoundary"] ''
    $DRY_RUN_CMD ${pkgs.writeShellScript "install-sioyek" ''
      set -euo pipefail
      SRC="${pkgs.sioyek}/Applications/sioyek.app"
      DST="/Applications/sioyek.app"
      if [ ! -f "$DST/Contents/MacOS/sioyek" ] || ! cmp -s "$SRC/Contents/MacOS/sioyek" "$DST/Contents/MacOS/sioyek"; then
        STAGE=$(mktemp -d /Applications/.sioyek-stage.XXXXXX)
        BACKUP=""
        cleanup() {
          status=$?
          if [ "$status" -ne 0 ] && [ -n "$BACKUP" ] && [ -d "$BACKUP/sioyek.app" ] && [ ! -e "$DST" ]; then
            mv "$BACKUP/sioyek.app" "$DST"
          fi
          rm -rf "$STAGE"
          return "$status"
        }
        trap cleanup EXIT
        cp -R "$SRC" "$STAGE/sioyek.app"
        # Store copies are read-only; keep the installed copy replaceable.
        chmod -R u+w "$STAGE/sioyek.app"
        if [ -e "$DST" ]; then
          chmod -R u+w "$DST"
          BACKUP=$(mktemp -d "$DST.backup.$(date +%Y%m%d-%H%M%S).XXXXXX")
          mv "$DST" "$BACKUP/sioyek.app"
        fi
        mv "$STAGE/sioyek.app" "$DST"
        echo "sioyek: installed $DST; previous copy retained in $BACKUP"
      fi
    ''}
  '');
}
