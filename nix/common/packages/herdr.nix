{
  config,
  pkgs,
  lib,
  ...
}: let
  herdr = pkgs.stdenv.mkDerivation rec {
    pname = "herdr";
    version = "0.9.5";
    src = pkgs.fetchurl {
      url = "https://github.com/herdrdev/herdr/releases/download/v${version}/herdr-linux-${
        if pkgs.stdenv.hostPlatform.isAarch64
        then "aarch64"
        else "x86_64"
      }";
      sha256 =
        if pkgs.stdenv.hostPlatform.isAarch64
        then "17d7536f2da50859523680ef279dffcac8e4a235f4e46fe8da6c2ec44141897c"
        else "14d9e8bc8b4a9e0118d77c32266f76d461f09b40342eb23752960bd89f59929d";
    };
    dontUnpack = true;
    installPhase = ''
      mkdir -p $out/bin
      cp $src $out/bin/herdr
      chmod +x $out/bin/herdr
    '';
    meta = with lib; {
      description = "Agent multiplexer that lives in your terminal";
      homepage = "https://herdr.dev";
      license = licenses.asl20;
      platforms = ["x86_64-linux" "aarch64-linux"];
      mainProgram = "herdr";
    };
  };
in {
  home.packages = lib.optionals pkgs.stdenv.isLinux [herdr];
}
