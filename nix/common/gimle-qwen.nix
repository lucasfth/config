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
      ProgramArguments = ["${root}/venv/bin/python" "${../../configs/gimle-qwen}/supervise.py"];
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
