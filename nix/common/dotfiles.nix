{ config, pkgs, lib, flakeDir, ... }:

{
  home.file = {

    # ── Vault (Obsidian memory — separate git repo) ─────────────
    "vault".source = config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/Desktop/code/loki-obsidian-memory";

    # ── Starship ─────────────────────────────────────────────────
    ".config/starship.toml".source = "${flakeDir.outPath}/starship.toml";

    # ── Ghostty ──────────────────────────────────────────────────
    ".config/ghostty/config".source = "${flakeDir.outPath}/config.ghostty";

    # ── LazyGit ──────────────────────────────────────────────────
    ".config/lazygit/config.yml".source = "${flakeDir.outPath}/lazygit/config.yml";

    # ── Tmux ────────────────────────────────────────────────────
    ".tmux.conf".source = "${flakeDir.outPath}/.tmux.conf";
    # TPM and plugins live in ~/.tmux/plugins/ (gitignored, runtime-managed)

    # ── AeroSpace ───────────────────────────────────────────────
    ".aerospace.toml".source = "${flakeDir.outPath}/.aerospace.toml";

    # ── Zed ─────────────────────────────────────────────────────
    ".config/zed/settings.json".source = "${flakeDir.outPath}/zed/settings.json";

    # ── Sioyek ──────────────────────────────────────────────────
    "Library/Application Support/sioyek/prefs_user.config".source = "${flakeDir.outPath}/sioyek/prefs_user.config";

    # ── Raycast Script Commands ───────────────────────────────────
    ".local/share/raycast-scripts/ask-huginn.sh".source = "${flakeDir.outPath}/raycast-scripts/ask-huginn.sh";
    ".local/share/raycast-scripts/invert-scroll.applescript".source = "${flakeDir.outPath}/raycast-scripts/invert-scroll.applescript";

    # ── Raycast (v1 extensions dir) ───────────────────────────────
    "Library/Application Support/com.raycast.macos/Extensions/invert-scroll.applescript"
# ── Raycast Script Commands (v2) ────────────────────────────────
".local/share/raycast-scripts/nix-rebuild.sh".source = "${flakeDir.outPath}/raycast-scripts/nix-rebuild.sh";
".local/share/raycast-scripts/quick-note.sh".source = "${flakeDir.outPath}/raycast-scripts/quick-note.sh";
.source = "${flakeDir.outPath}/raycast-scripts/invert-scroll.applescript";

};
}
