{
  config,
  pkgs,
  lib,
  flakeDir,
  hostname,
  ...
}: let
  herdrPluginDir = "${flakeDir.outPath}/configs/herdr/host-summary";
  plugins = import ../../configs/herdr/plugins.nix {inherit pkgs;};
in {
  xdg.configFile."herdr/config.toml".source = "${flakeDir.outPath}/configs/herdr/config.toml";
  xdg.configFile."herdr/plugins/host-summary/herdr-plugin.toml".source = "${herdrPluginDir}/herdr-plugin.toml";
  xdg.configFile."herdr/plugins/host-summary/summary.sh".source = "${herdrPluginDir}/summary.sh";
  xdg.configFile."herdr/plugins/herdr-omni".source = plugins.omni;
  xdg.configFile."herdr/plugins/herdr-automatic-rename".source = plugins.automaticRename;
  xdg.configFile."herdr-automatic-rename/config.sh".source = ../../configs/herdr/automatic-rename.sh;

  # Linking registers hooks but does not start/restart a server or collector.
  home.activation.herdrHostSummaryPlugin = lib.hm.dag.entryAfter ["linkGeneration"] ''
    for herdr in "$HOME/.local/libexec/herdr-patched" /opt/homebrew/bin/herdr "$HOME/.nix-profile/bin/herdr" "$HOME/.local/bin/herdr"; do
      if [ -x "$herdr" ]; then
        for plugin in host-summary herdr-omni herdr-automatic-rename; do
          $DRY_RUN_CMD "$herdr" plugin link "$HOME/.config/herdr/plugins/$plugin"
        done
        break
      fi
    done
  '';
}
