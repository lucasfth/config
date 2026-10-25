{
  config,
  pkgs,
  lib,
  flakeDir,
  hostname,
  ...
}: let
  herdrPluginDir = "${flakeDir.outPath}/configs/herdr/host-summary";
in {
  xdg.configFile."herdr/config.toml".source = "${flakeDir.outPath}/configs/herdr/config.toml";
  xdg.configFile."herdr/plugins/host-summary/herdr-plugin.toml".source = "${herdrPluginDir}/herdr-plugin.toml";
  xdg.configFile."herdr/plugins/host-summary/summary.sh".source = "${herdrPluginDir}/summary.sh";

  # OMP integration: reports agent state and session refs to herdr (sidebar
  # status, session resume). Installed by herdr itself so it always matches the
  # installed herdr version; running omp sessions only load it at startup.
  home.activation.herdrOmpIntegration = lib.mkIf (hostname != "gimle") (lib.hm.dag.entryAfter ["writeBoundary"] ''
    for herdr in /opt/homebrew/bin/herdr "$HOME/.nix-profile/bin/herdr"; do
      if [ -x "$herdr" ]; then
        $DRY_RUN_CMD "$herdr" integration install omp
        break
      fi
    done
  '');
  # Linking registers hooks but does not start/restart a server or collector.
  home.activation.herdrHostSummaryPlugin = lib.hm.dag.entryAfter ["linkGeneration"] ''
    for herdr in "$HOME/.local/libexec/herdr-patched" /opt/homebrew/bin/herdr "$HOME/.nix-profile/bin/herdr" "$HOME/.local/bin/herdr"; do
      if [ -x "$herdr" ]; then
        $DRY_RUN_CMD "$herdr" plugin link "$HOME/.config/herdr/plugins/host-summary"
        break
      fi
    done
  '';
}
