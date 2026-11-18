# NixOS entry module — imports nixos/ submodules.
# This is the NixOS counterpart to darwin.nix.
# Activated by the nixosConfigurations."freyr" entry in flake.nix.
#
# Before first build, generate and copy hardware-configuration.nix:
#   nixos-generate-config --root /mnt
#   cp /mnt/etc/nixos/hardware-configuration.nix nix/nixos/hardware-configuration.nix
{
  config,
  pkgs,
  lib,
  ...
}: {
  imports = [
    ./nixos
  ];
  programs.zsh.enable = true;
  home-manager.useGlobalPkgs = true;
}
