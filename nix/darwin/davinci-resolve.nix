{
  config,
  lib,
  pkgs,
  ...
}: let
  cfg = config.programs.resolveStudio;
  gyroflowDmg = import ./gyroflow-ofx-package.nix {inherit pkgs;};
  corridorMenu = pkgs.replaceVars "${../../configs/davinci-resolve}/CorridorKey 2.0.py" {
    bridge = "${../../configs/davinci-resolve/corridorkey_bridge.py}";
    ffprobe = "${pkgs.ffmpeg}/bin/ffprobe";
  };
  helpers = pkgs.runCommand "resolve-install-helpers" {} ''
    mkdir -p "$out"
    cp ${../../scripts/install-gyroflow-ofx} "$out/install-gyroflow-ofx"
    cp ${../../scripts/install-gyroflow-dmg} "$out/install-gyroflow-dmg"
  '';
  studioPkg = pkgs.requireFile {
    name = cfg.installer.name;
    hash = cfg.installer.hash;
    message = ''
      Supply the Blackmagic macOS Studio PKG (${cfg.installer.name}).
      Verify its signature, then add it with:
        nix-store --add-fixed sha256 /path/to/${cfg.installer.name}
      Do not add your activation key to Nix or this repository.
    '';
  };
in {
  options.programs.resolveStudio.enable = lib.mkEnableOption "managed Resolve Studio and video plugins";
  options.programs.resolveStudio.installer = lib.mkOption {
    default = null;
    description = "Locally supplied Blackmagic Studio PKG pin; null leaves Resolve untouched.";
    type = lib.types.nullOr (lib.types.submodule {
      options = {
        name = lib.mkOption {
          type = lib.types.strMatching "[^/]+\\.pkg";
          description = "Filename of the Studio PKG, not a DMG or free-edition installer.";
        };
        hash = lib.mkOption {
          type = lib.types.strMatching "sha256-[A-Za-z0-9+/]{43}=";
          description = "Flat SHA-256 SRI hash of the supplied Studio PKG.";
        };
      };
    });
  };

  config = lib.mkIf cfg.enable {
    home-manager.users.${config.system.primaryUser}.home.file.
      "Library/Application Support/Blackmagic Design/DaVinci Resolve/Fusion/Scripts/Utility/CorridorKey 2.0.py".source = corridorMenu;

    # Store paths referenced by activation retain the original DMG in the closure.
    system.activationScripts.postActivation.text = lib.mkAfter ''
      if /usr/bin/pgrep -x Resolve >/dev/null; then
        echo "warning: Resolve is open; skipping managed video installs until the next rebuild." >&2
      elif ! /bin/sh ${helpers}/install-gyroflow-dmg ${gyroflowDmg}; then
        echo "Gyroflow OFX installation failed; fix the error and retry." >&2
        exit 1
      fi
      ${lib.optionalString (cfg.installer != null) ''
        if /usr/bin/pgrep -x Resolve >/dev/null; then
          echo "warning: Resolve is open; Studio installation deferred." >&2
        elif ! ${pkgs.python3}/bin/python3 ${../../scripts/install-resolve-studio} ${studioPkg} --install; then
          echo "Resolve Studio installation failed; fix the error and retry." >&2
          exit 1
        fi
      ''}
    '';
  };
}
