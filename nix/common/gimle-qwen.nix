{
  config,
  lib,
  pkgs,
  hostname,
  ...
}: let
  enabled = pkgs.stdenv.hostPlatform.isDarwin && hostname == "gimle";
  home = config.home.homeDirectory;
  root = "${home}/loki-data/gimle-qwen";
in {
  # Private runtime/model/key preparation is explicit; no dependency downloads at boot.
  launchd.agents.gimle-qwen = lib.mkIf enabled {
    enable = true;
    config = {
      Label = "dk.gimle.qwen";
      # The login agent can start before the private volume or its Nix interpreter is ready.
      ProgramArguments = [
        "/bin/sh"
        "-c"
        ''
          attempts=0
          until /bin/df -P "$1" | /usr/bin/awk -v volume="$1" 'NR == 2 && substr($0, length($0) - length(volume)) == " " volume {ready=1} END {exit !ready}' \
            && "$2" --version >/dev/null 2>&1
          do
            attempts=$((attempts + 1))
            if [ "$attempts" -ge 60 ]; then
              echo "Gimle Qwen: volume or Python not ready after 118 seconds: $1" >&2
              exit 75
            fi
            /bin/sleep 2
          done
          shift
          exec "$@"
        ''
        "gimle-qwen-boot"
        "${home}/loki-data"
        "${root}/venv/bin/python"
        "${../../configs/gimle-qwen}/supervise.py"
      ];
      EnvironmentVariables = {
        HOME = home;
        GIMLE_QWEN_ROOT = root;
      };
      WorkingDirectory = home;
      RunAtLoad = true;
      KeepAlive = false;
      ThrottleInterval = 60;
      StandardOutPath = "${home}/Library/Logs/gimle-qwen.log";
      StandardErrorPath = "${home}/Library/Logs/gimle-qwen-error.log";
    };
  };
  # llama-swap: model swapper for the private endpoint; registry/state live on the encrypted runtime.
  home.file.".local/bin/llama-swap" = lib.mkIf enabled {
    source = ../../configs/gimle-qwen/llama_swap.py;
    executable = true;
  };
}
