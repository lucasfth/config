{
  pkgs,
  lib,
  ...
}: let
  obelMono = pkgs.stdenvNoCC.mkDerivation {
    pname = "obel-mono";
    version = "1.001";
    src = pkgs.fetchurl {
      url = "https://typographic.systems/download/ObelMono-1.001.zip";
      hash = "sha256-XjJJ41/3thCJ6q9BwC5WH72m69gTaV8fX7lAqBiRRHI=";
    };
    nativeBuildInputs = [pkgs.unzip];
    sourceRoot = "ObelMono-1.001";
    dontBuild = true;
    installPhase = ''
      runHook preInstall
      install -Dm644 ObelMono/ttf/variable/*.ttf -t "$out/share/fonts/truetype/obel-mono"
      install -Dm644 OFL.txt AUTHORS.txt -t "$out/share/licenses/obel-mono"
      runHook postInstall
    '';
    meta = {
      description = "Unmasked Obel Mono variable font, Roman and Italic";
      homepage = "https://typographic.systems/obel-mono";
      license = lib.licenses.ofl;
      platforms = lib.platforms.all;
    };
  };
in {
  home.packages = [obelMono pkgs.nerd-fonts.jetbrains-mono];
  # Home Manager copies packaged fonts on Darwin; do not also declare font symlinks.
  fonts.fontconfig.enable = lib.mkIf pkgs.stdenv.hostPlatform.isLinux true;
}
