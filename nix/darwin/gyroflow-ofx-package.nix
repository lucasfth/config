{pkgs}:
# Keep the DMG intact: undmg/Nix store normalization cannot preserve the signed
# extended attributes on Contents/LICENSE. Mount and ditto at activation instead.
pkgs.fetchurl {
  name = "gyroflow-ofx-2.1.1.dmg";
  url = "https://github.com/gyroflow/gyroflow-plugins/releases/download/v2.1.1/Gyroflow-OpenFX-macos.dmg";
  hash = "sha256-yq1inkS3rQtZSI+3AUhpX1Fr1N8I5f7xQQDRxsJlFx4=";
}
