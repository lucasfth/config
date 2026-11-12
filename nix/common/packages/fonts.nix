{
  pkgs,
  lib,
  ...
}: let
  obelMono = pkgs.stdenvNoCC.mkDerivation {
    pname = "obel-mono";
    version = "1.003";
    src = pkgs.fetchurl {
      url = "https://typographic.systems/download/ObelMono-1.003-ttf.zip";
      # Published in https://typographic.systems/install.sh.
      hash = "sha256-QHkdzeyxeetCoKhTzlxNBcXiDrXvGLZydcmu9vDsqB4=";
    };
    nativeBuildInputs = [pkgs.unzip];
    sourceRoot = "ObelMono-1.003-ttf";
    dontBuild = true;
    installPhase = ''
      runHook preInstall
      install -Dm644 variable/*.ttf -t "$out/share/fonts/truetype/obel-mono"
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
