{
  pkgs,
  lib ? pkgs.lib,
}: let
  platform = pkgs.stdenv.hostPlatform;
  goArchives = {
    aarch64-darwin = {
      target = "darwin-arm64";
      hash = "76812b213b1b2302c978d28fa52fa92d541704b9e7d9d5db8002c50e4018c4c5";
    };
    x86_64-darwin = {
      target = "darwin-amd64";
      hash = "587b59182488b23aa6e5fc25110405a3e0e5b38ed2f5b2f46ed13c32aee356fe";
    };
    x86_64-linux = {
      target = "linux-amd64";
      hash = "ecbadb99091a3f46e31f5f934b068b1864eafa7995211b39eaddf76996045fe5";
    };
    aarch64-linux = {
      target = "linux-arm64";
      hash = "94f3e30b8e374bc285e7dadc11e0865726b9bc6e85b841ccceaabc0214c6b7c8";
    };
  };
  archive = goArchives.${platform.system};
  goToolchain = pkgs.stdenvNoCC.mkDerivation {
    pname = "fafnir-go";
    version = "1.27.2";
    src = pkgs.fetchurl {
      url = "https://go.dev/dl/go1.27.2.${archive.target}.tar.gz";
      sha256 = archive.hash;
    };
    nativeBuildInputs = lib.optionals platform.isLinux [pkgs.autoPatchelfHook];
    buildInputs = lib.optionals platform.isLinux [pkgs.stdenv.cc.cc.lib];
    dontBuild = true;
    installPhase = ''
      mkdir -p "$out"
      cp -R . "$out/"
    '';
    dontStrip = true;
    passthru = {
      GOOS =
        if platform.isDarwin
        then "darwin"
        else "linux";
      GOARCH =
        if platform.isAarch64
        then "arm64"
        else "amd64";
      CGO_ENABLED = "1";
    };
    meta.platforms = builtins.attrNames goArchives;
  };
  buildGo = pkgs.buildGoModule.override {go = goToolchain;};
in
  buildGo {
    pname = "fafnir";
    version = "0.1.0-dev-d206c4c";
    src = pkgs.fetchzip {
      url = "https://github.com/lucasfth/fafnir/archive/d206c4c4ea12b3d2d7b5ea4eb00e7733d15c31ba.tar.gz";
      hash = "sha256-70QmIbzmHC7jvybncFa5LoPuJet3k4fkeuyKX1/baPA=";
    };
    vendorHash = "sha256-2BtB2fwjI4DKMg7/YG97cQQrXEOWCLu8JwPhEqubcK4=";
    subPackages = ["cmd/fafnir"];
    env.CGO_ENABLED = "1";
    nativeBuildInputs = [pkgs.git];
    nativeCheckInputs = [pkgs.git];
    checkPhase = ''
      runHook preCheck
      go test -count=1 ./...
      runHook postCheck
    '';
    meta = {
      description = "Experimental repository secrets CLI using SOPS and age";
      homepage = "https://github.com/lucasfth/fafnir";
      license = lib.licenses.asl20;
      platforms = builtins.attrNames goArchives;
      mainProgram = "fafnir";
    };
  }
