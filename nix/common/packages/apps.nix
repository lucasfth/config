{
  config,
  pkgs,
  lib,
  ...
}: {
  home.packages = with pkgs;
    [
      docker
    ]
    ++ lib.optionals stdenv.isDarwin [
      swiftbar
      jankyborders
      lmstudio
      sioyek
    ]
    ++ lib.optionals (stdenv.isDarwin && stdenv.hostPlatform.isAarch64) [
      (stdenvNoCC.mkDerivation {
        pname = "superbacked";
        version = "2.0.0-rc.3";
        src = fetchurl {
          url = "https://github.com/superbacked/superbacked/releases/download/v2.0.0-rc.3/superbacked-arm64-2.0.0-rc.3.dmg";
          hash = "sha256-zgVioSBxEw5enJlGkzroPgXjVM+jC7SvpiDD3pOSqvw=";
        };
        nativeBuildInputs = [undmg makeWrapper];
        sourceRoot = ".";
        dontBuild = true;
        # Preserve upstream's signed bundle; fixup would strip signed binaries.
        dontFixup = true;
        installPhase = ''
          runHook preInstall
          mkdir -p "$out/Applications" "$out/bin"
          cp -R Superbacked.app "$out/Applications/"
          # Electron discovers helpers relative to its launch path, not a CLI symlink.
          makeWrapper "$out/Applications/Superbacked.app/Contents/MacOS/Superbacked" "$out/bin/superbacked"
          runHook postInstall
        '';
        meta = {
          description = "Encrypted backups (Superbacked 2 release candidate; testing only)";
          homepage = "https://superbacked.com/v2";
          platforms = ["aarch64-darwin"];
        };
      })
      (stdenvNoCC.mkDerivation {
        pname = "mactap";
        version = "2.1.2";
        src = fetchurl {
          url = "https://github.com/jaskirat1616/mactap-app/releases/download/v2.1.2/MacTap-2.1.2.zip";
          hash = "sha256-ar2iL6uvD9eVGPkAYnHx6lcMDUQYpGZmt/PgYt5dpjY=";
        };
        nativeBuildInputs = [unzip];
        sourceRoot = ".";
        dontBuild = true;
        dontFixup = true;
        installPhase = ''
          # ZIP includes AppleDouble resource-fork entries; they invalidate the
          # notarized app signature when unpacked as regular files by Nix.
          find MacTap.app -name '._*' -delete
          runHook preInstall
          mkdir -p "$out/Applications"
          cp -R MacTap.app "$out/Applications/"
          runHook postInstall
        '';
        meta = {
          description = "Trigger shortcuts by knocking on a MacBook";
          homepage = "https://github.com/jaskirat1616/mactap-app";
          platforms = ["aarch64-darwin"];
        };
      })
    ]
    ++ lib.optionals stdenv.isLinux [
      nvidia-docker
      ollama
    ];
}
