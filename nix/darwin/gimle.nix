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
in {
  options.services.gimle.tailscaleAtBoot = lib.mkEnableOption "Gimle's CLI Tailscale daemon (enable only during the coordinated GUI handoff)";

  config = lib.mkIf (hostname == "gimle") {
    # No GUI login should be needed after power restoration. The newer
    # autorestartatconnect setting is kept enabled on the machine as well.
    power.restartAfterPowerFailure = true;
    power.sleep.computer = "never";

    environment.etc."loki/volume-mount.py".source = ../../scripts/loki-volume-mount;

    launchd.daemons.loki-volume = {
      serviceConfig = {
        Label = "dk.loki.volume";
        ProgramArguments = ["/usr/bin/python3" "/etc/loki/volume-mount.py"];
        RunAtLoad = true;
        KeepAlive = {SuccessfulExit = false;};
        ThrottleInterval = 30;
        ProcessType = "Background";
        StandardOutPath = "/var/log/loki-volume.log";
        StandardErrorPath = "/var/log/loki-volume-error.log";
      };
    };

    # Merely building/activating the host must not replace the existing GUI
    # connection. This job stays disabled until the alternate access path and
    # tailnet enrollment are verified during the networking handoff.
    launchd.daemons.gimle-tailscaled = {
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

    # Production gateway/MCP jobs are deliberately not installed yet. Their
    # native runtime, rewritten private config, final snapshot and single-writer
    # cutover must be qualified before a boot can start Telegram or cron.
    assertions = [
      {
        assertion = config.system.primaryUser == "gimle" && config.home-manager.users.gimle.home.homeDirectory == home;
        message = "Gimle boot services require the gimle account and /Users/gimle home.";
      }
    ];
  };
}
