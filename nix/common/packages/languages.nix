{
  config,
  pkgs,
  lib,
  ...
}: let
  pinnedZig = pkgs.stdenvNoCC.mkDerivation {
    pname = "zig";
    version = "0.17.0";
    src = pkgs.fetchurl {
      url =
        if pkgs.stdenv.hostPlatform.isDarwin
        then "https://ziglang.org/download/0.17.0/zig-aarch64-macos-0.17.0.tar.xz"
        else "https://ziglang.org/download/0.17.0/zig-x86_64-linux-0.17.0.tar.xz";
      hash =
        if pkgs.stdenv.hostPlatform.isDarwin
        then "sha256-tgfpuSNHkKAIEWrlvbccYkO4S5+0KlOp5w/eQcBsU2o="
        else "sha256-HL6d+fJ+a3jRTMvKQ7ZwOkBO957xxGPekB1/CI1OICY=";
    };
    nativeBuildInputs = lib.optionals pkgs.stdenv.isLinux [pkgs.autoPatchelfHook];
    sourceRoot = "zig-${
      if pkgs.stdenv.hostPlatform.isDarwin
      then "aarch64-macos"
      else "x86_64-linux"
    }-0.17.0";
    dontBuild = true;
    dontStrip = true;
    dontFixup = pkgs.stdenv.isDarwin;
    installPhase = ''
      runHook preInstall
      mkdir -p "$out/bin" "$out/lib"
      install -m755 zig "$out/bin/zig"
      cp -R lib/. "$out/lib/"
      runHook postInstall
    '';
    meta.platforms = ["aarch64-darwin" "x86_64-linux"];
  };
in {
  home.packages = with pkgs; [
    (python312.withPackages (ps:
      with ps; [
        pip
        virtualenv
        jupyterlab
        numpy
        pillow
      ]))
    nodejs_22
    go
    rustc
    cargo
    ruby
    pinnedZig
    gradle
    mono
    yarn
    bazel
    scala-cli
    typst
    uv
  ];
}
