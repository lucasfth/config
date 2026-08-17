{
  config,
  pkgs,
  ...
}: {
  home.packages = with pkgs; [
    cacert
    ente-cli
    bitwarden-cli
  ];
}
