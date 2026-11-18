{
  config,
  pkgs,
  lib,
  stdenv,
  ...
}: {
  # fafnir is macOS-only (fafnir-go build fails on Linux without libtiff)
  home.packages = lib.optionals stdenv.hostPlatform.isDarwin (with pkgs; [
    (import ./fafnir-package.nix {inherit pkgs;})
  ]);
}
