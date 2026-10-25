{
  config,
  pkgs,
  lib,
  hostname,
  ...
}: {
  homebrew.casks = builtins.filter (name: hostname != "gimle" || !(builtins.elem name ["betterdisplay" "displaylink"])) [
    # ── Development ─────────────────────────────────────────
    "temurin"
    "android-platform-tools"
    "claude-code@latest"
    "cmux"
    "codex"
    "codexbar"
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
    "onlyoffice"
    "electrum"

    # ── Browsers ────────────────────────────────────────────
    "google-chrome"
    "nook"
    "zen"

    # ── Media & graphics ────────────────────────────────────
    "betterdisplay"
    "displaylink"
    "gyroflow"
    "handbrake-app"
    "prince"
    "crmne/tap/spotifast"
    "syntax-highlight"

    # ── Utilities ───────────────────────────────────────────
    "macpacker"
    "the-unarchiver"
    "tigervnc"
    "typewhisper"
    "wave"
    "wkhtmltopdf"
    "yaak"
  ];
}
