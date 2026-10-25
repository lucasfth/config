{
  config,
  lib,
  pkgs,
  hostname,
  ...
}: let
  cfg = config.services.gimle;
  home = "/Users/gimle";
  privateRoot = "/Library/Application Support/Loki";
  services = ["gateway" "vault" "ask" "browser" "hue"];
in {
  options.services.gimle = {
    tailscaleAtBoot = lib.mkEnableOption "Gimle's CLI Tailscale daemon (coordinated GUI handoff only)";
    production = lib.mkEnableOption "Loki production services (enable only after phone writers stop and final snapshot verification)";
  };

  config = lib.mkIf (hostname == "gimle") {
    # No GUI login should be needed after power restoration. macOS switches
    # from autorestartatconnect to autorestart when applying this setting.
    power.restartAfterPowerFailure = true;
    power.sleep.computer = "never";

    environment.etc."loki/volume-mount.py".source = ../../scripts/loki-volume-mount;
    environment.etc."loki/service-run.py".source = ../../scripts/loki-service-run;
    environment.etc."loki/backup-obsidian.py".source = ../../configs/loki/backup_obsidian.py;
    environment.etc."loki/production-enabled" = lib.mkIf cfg.production {text = "enabled\n";};

    launchd.daemons = lib.mkMerge [
      (lib.optionalAttrs cfg.production (lib.genAttrs (map (service: "loki-${service}") services) (name: let
        service = lib.removePrefix "loki-" name;
      in {
        serviceConfig = {
          Label = "dk.loki.${service}";
          ProgramArguments = ["${pkgs.python3}/bin/python3" "/etc/loki/service-run.py" service];
          UserName = "gimle";
          GroupName = "staff";
          EnvironmentVariables = {HOME = home;};
          WorkingDirectory = home;
          RunAtLoad = true;
          KeepAlive = {SuccessfulExit = false;};
          ThrottleInterval = 30;
          ExitTimeOut = 90;
          StandardOutPath = "${home}/Library/Logs/loki-${service}.log";
          StandardErrorPath = "${home}/Library/Logs/loki-${service}-error.log";
        };
      })))
      (lib.optionalAttrs cfg.production {
        loki-muninn-backup.serviceConfig = {
          Label = "dk.loki.muninn-backup";
          ProgramArguments = ["${pkgs.python3}/bin/python3" "/etc/loki/backup-obsidian.py"];
          UserName = "gimle";
          GroupName = "staff";
          WorkingDirectory = home;
          EnvironmentVariables = {
            HOME = home;
            TZ = "Europe/Copenhagen";
          };
          StartCalendarInterval = [
            {
              Hour = 1;
              Minute = 7;
            }
          ];
          RunAtLoad = false;
          KeepAlive = false;
          ProcessType = "Background";
          LowPriorityIO = true;
          StandardOutPath = "${home}/Library/Logs/loki-muninn-backup.log";
          StandardErrorPath = "${home}/Library/Logs/loki-muninn-backup-error.log";
        };
      })
      {
        loki-volume = {
          serviceConfig = {
            Label = "dk.loki.volume";
            ProgramArguments = ["${pkgs.python3}/bin/python3" "/etc/loki/volume-mount.py"];
            RunAtLoad = true;
            KeepAlive = {SuccessfulExit = false;};
            ThrottleInterval = 30;
            ProcessType = "Background";
            StandardOutPath = "/var/log/loki-volume.log";
            StandardErrorPath = "/var/log/loki-volume-error.log";
          };
        };

        # nix-darwin loads generated jobs with -w, overriding Disabled. Omit this
        # job completely until the coordinated GUI handoff enables it.
        gimle-tailscaled = lib.mkIf cfg.tailscaleAtBoot {
          serviceConfig = {
            Label = "dk.loki.tailscaled";
            Disabled = !cfg.tailscaleAtBoot;
            ProgramArguments = [
              "${pkgs.tailscale}/bin/tailscaled"
              "--state=${privateRoot}/tailscale/tailscaled.state"
              "--socket=/var/run/gimle-tailscaled.socket"
            ];
            RunAtLoad = cfg.tailscaleAtBoot;
            KeepAlive = cfg.tailscaleAtBoot;
            ThrottleInterval = 10;
            StandardOutPath = "/var/log/gimle-tailscaled.log";
            StandardErrorPath = "/var/log/gimle-tailscaled-error.log";
          };
        };
      }
    ];

    # Gate emission, not merely Disabled: activation uses launchctl load -w.
    # Service runners verify encrypted-volume readiness before opening state.
    assertions = [
      {
        assertion = config.system.primaryUser == "gimle" && config.home-manager.users.gimle.home.homeDirectory == home;
        message = "Gimle boot services require the gimle account and /Users/gimle home.";
      }
    ];
  };
}
