{ config, pkgs, lib, flakeDir, ... }:

{
  xdg.configFile."herdr/config.toml".source =
    "${flakeDir.outPath}/herdr/config.toml";
}
