{ config, pkgs, lib, ... }:

{
  imports = [
    ./cli.nix
    ./languages.nix
    ./data.nix
    ./cloud.nix
    ./media.nix
    ./apps.nix
    ./extras.nix
    ./herdr.nix
  ];
}
