{
  config,
  pkgs,
  lib,
  ...
}: {
  homebrew.casks = [
    # ── Development ─────────────────────────────────────────
    "temurin"
    "android-platform-tools"
    "claude-code@latest"
    "cmux"
    "copilot-cli"
    "dotnet-sdk"
    "visual-studio-code"
    "zed"

    # ── Terminals & shells ──────────────────────────────────
    "ghostty"

    # ── Fonts ───────────────────────────────────────────────
    "font-jetbrains-mono-nerd-font"

    # ── Communication ───────────────────────────────────────
    "discord"
    "signal"
    "slack"
    "telegram"
    "zoom"

    # ── Productivity ────────────────────────────────────────
    "bitwarden"
    "notion"
    "obsidian"
    "raycast"
    "zotero"

    # ── Browsers ────────────────────────────────────────────
    "google-chrome"
    "zen"

    # ── Media & graphics ────────────────────────────────────
    "betterdisplay"
    "gyroflow"
    "handbrake-app"
    "prince"
    "spotify"
    "sioyek"
    "syntax-highlight"

    # ── Utilities ───────────────────────────────────────────
    "the-unarchiver"
    "typewhisper"
    "wave"
    "wkhtmltopdf"
    "yaak"
  ];
}
