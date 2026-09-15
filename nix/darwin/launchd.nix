{
  pkgs,
  homeDirectory,
  ...
}: let
  nixHealthCheck = ''
    profile_zsh="$HOME/.nix-profile/bin/zsh"
    if [[ ! -x "$profile_zsh" || ! -d /nix/store || ! -x /nix/var/nix/profiles/default/bin/nix ]]; then
      /usr/bin/logger -t nix-health "Nix is unavailable. Read $HOME/config/docs/nix-recovery.md."
      /usr/bin/osascript -e 'display notification "Nix is unavailable. Open ~/config/docs/nix-recovery.md." with title "Nix health check failed"' || true
      exit 1
    fi
  '';
in {
  # AeroSpace is Nix-installed, so macOS has no application login item for it.
  launchd.user.agents.aerospace = {
    serviceConfig = {
      ProgramArguments = [
        "${pkgs.aerospace}/Applications/AeroSpace.app/Contents/MacOS/AeroSpace"
      ];
      KeepAlive = true;
      RunAtLoad = true;
    };
  };

  # This script and its launchd plist survive a Nix store loss, so it detects
  # the broken profile/login-shell state immediately after a macOS update.
  launchd.user.agents.nix-health = {
    serviceConfig = {
      ProgramArguments = [
        "/bin/bash"
        "-c"
        nixHealthCheck
      ];
      EnvironmentVariables.HOME = homeDirectory;
      RunAtLoad = true;
      StartInterval = 86400;
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
}
