{
  config,
  pkgs,
  lib,
  ...
}: {
  # fafnir is macOS-only (fafnir-go build fails on Linux without libtiff)
  home.file = lib.mkIf pkgs.stdenv.hostPlatform.isDarwin {
    ".local/bin/fafnir".source = "${(import ./fafnir-package.nix {inherit pkgs;})}/bin/fafnir";
  };
}
