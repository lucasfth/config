{pkgs, ...}: let
  dmg = pkgs.fetchurl {
    name = "Conduit-mac-v1.0.2.dmg";
    url = "https://github.com/kaishi00/hermes-conduit-desktop/releases/download/v1.0.2/Conduit-mac.dmg";
    hash = "sha256-F7dNwYvmLBVlVe0F9eC3LVGlz5BMbc5fWT3fHNp0q40=";
  };
in
  pkgs.stdenvNoCC.mkDerivation {
    pname = "hermes-conduit-desktop";
    version = "1.0.2";
    dontUnpack = true;
    dontFixup = true;
    installPhase = ''
      runHook preInstall
      mkdir -p "$out/Applications"
      mountpoint=$(mktemp -d)
      trap '/usr/bin/hdiutil detach "$mountpoint" >/dev/null 2>&1 || true; rmdir "$mountpoint"' EXIT
      /usr/bin/hdiutil attach "$dmg" -nobrowse -readonly -mountpoint "$mountpoint"
      /usr/bin/ditto "$mountpoint/Conduit.app" "$out/Applications/Conduit Desktop.app"
      /usr/bin/hdiutil detach "$mountpoint"
      runHook postInstall
    '';
    inherit dmg;
    meta = {
      description = "Official signed Hermes Conduit Desktop application";
      platforms = ["aarch64-darwin"];
      license = pkgs.lib.licenses.mit;
    };
  }
