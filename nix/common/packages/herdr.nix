{ config, pkgs, lib, ... }:

let
  herdr = pkgs.stdenv.mkDerivation rec {
    pname = "herdr";
    version = "0.7.5";
    src = pkgs.fetchurl {
      url = "https://github.com/ogulcancelik/herdr/releases/download/v${version}/herdr-linux-x86_64";
      sha256 = "3dc83288073e4c2d3c679a30e7be97bcca9141c6fd17dbbb9219142e95c59253";
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
      platforms = [ "x86_64-linux" ];
      mainProgram = "herdr";
    };
  };
in {
  home.packages = lib.optionals pkgs.stdenv.isLinux [ herdr ];
}
