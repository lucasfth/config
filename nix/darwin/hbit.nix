{
  config,
  lib,
  pkgs,
  ...
}: let
  cfg = config.services.hbit;
  user = config.system.primaryUser;
  home = config.users.users.${user}.home;
in {
  options.services.hbit.enable = lib.mkEnableOption "the verified private Hbit container startup agent";

  config = lib.mkIf cfg.enable {
    environment.etc."hbit/ensure-running".source = ../../scripts/hbit-ensure-running;

    launchd.user.agents.hbit = {
      serviceConfig = {
        ProgramArguments = [
          "${pkgs.python3}/bin/python3"
          "/etc/hbit/ensure-running"
          "--container"
          "/opt/homebrew/bin/container"
        ];
        EnvironmentVariables.HOME = home;
        WorkingDirectory = home;
        RunAtLoad = true;
        KeepAlive = false;
        StandardOutPath = "${home}/Library/Logs/hbit.log";
        StandardErrorPath = "${home}/Library/Logs/hbit-error.log";
      };
    };
  };
}
