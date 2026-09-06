{
  config,
  pkgs,
  lib,
  ...
}: let
  nixStoreVolume = "80E0083A-0110-4200-B7ED-C88ED7B9A6D4";
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

  # Nix installer volume must unlock before nix-daemon starts at boot.
  launchd.daemons.darwin-store = {
    serviceConfig = {
      ProgramArguments = [
        "/bin/sh"
        "-c"
        "/usr/bin/security find-generic-password -s '${nixStoreVolume}' -w | /usr/sbin/diskutil apfs unlockVolume '${nixStoreVolume}' -mountpoint '/nix' -stdinpassphrase"
      ];
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
}
