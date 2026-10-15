{
  config,
  pkgs,
  lib,
  flakeDir,
  ...
}: {
  xdg.configFile."herdr/config.toml".source = "${flakeDir.outPath}/configs/herdr/config.toml";

  # OMP integration: reports agent state and session refs to herdr (sidebar
  # status, session resume). Installed by herdr itself so it always matches the
  # installed herdr version; running omp sessions only load it at startup.
  home.activation.herdrOmpIntegration = lib.hm.dag.entryAfter ["writeBoundary"] ''
    for herdr in /opt/homebrew/bin/herdr "$HOME/.nix-profile/bin/herdr"; do
      if [ -x "$herdr" ]; then
        $DRY_RUN_CMD "$herdr" integration install omp
        break
      fi
    done
  '';
}
