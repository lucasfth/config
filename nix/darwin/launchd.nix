{
  config,
  pkgs,
  lib,
  ...
}: {
  launchd.user.agents.borders = {
    serviceConfig = {
      ProgramArguments = [
        "${pkgs.jankyborders}/bin/borders"
        "style=round"
        "width=8.0"
        "active_color=0xff74c7ec"
        "inactive_color=0xffcba6f7"
        "hidpi=on"
      ];
      KeepAlive = true;
      RunAtLoad = true;
    };
  };

  # Clean up leaked Tailwind CSS v4 oxide-helper processes
  launchd.user.agents.tailwind-cleanup = {
    serviceConfig = {
      ProgramArguments = [
        "${pkgs.bash}/bin/bash"
        "-c"
        ''
          count=$(pgrep -c -f oxide-helper.js 2>/dev/null || echo 0)
          if [ "$count" -gt 20 ]; then
            parent=$(pgrep -f tailwindcss-language-server 2>/dev/null | head -1)
            if [ -n "$parent" ]; then
              kill "$parent" 2>/dev/null
              logger -t tailwind-cleanup "Killed tailwindcss-language-server (PID $parent) — $count oxide-helper workers leaked"
            fi
          fi
        ''
      ];
      StartInterval = 1800;
      RunAtLoad = true;
      StandardOutPath = "/tmp/tailwind-cleanup.out";
      StandardErrorPath = "/tmp/tailwind-cleanup.err";
    };
  };

  # Sketchybar — macOS status bar replacement
  launchd.user.agents.sketchybar = {
    serviceConfig = {
      ProgramArguments = [
        "${pkgs.sketchybar}/bin/sketchybar"
      ];
      KeepAlive = true;
      RunAtLoad = true;
      EnvironmentVariables = {
        PATH = "${pkgs.sketchybar}/bin:/Users/lucasfreytorreshanson/.nix-profile/bin:/opt/homebrew/bin:/usr/bin:/bin";
      };
    };
  };
}
