{
  config,
  pkgs,
  lib,
  ...
}: {
  home.packages = with pkgs;
    [
      cacert
    ]
    ++ lib.optionals stdenv.isDarwin [
      android-tools
    ]
    ++ [
      ente-cli
      bitwarden-cli
    ];
}
