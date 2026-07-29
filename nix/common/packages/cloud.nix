{
  config,
  pkgs,
  ...
}: {
  home.packages = with pkgs; [
    yubikey-manager
    tailscale
  ];
}
