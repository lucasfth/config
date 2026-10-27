{
  config,
  pkgs,
  lib,
  hostname,
  hermesDesktop ? null,
  hermesDesktopIcon ? null,
  hermesElectron ? null,
  hermesAgent ? null,
  ...
}: {
  home.packages = with pkgs;
    [
      docker
    ]
    ++ lib.optionals (stdenv.isDarwin && builtins.elem hostname ["lucas-macbook-pro" "gimle"]) [
      swiftbar
      jankyborders
      lmstudio
      sioyek
    ]
    ++ lib.optionals (stdenv.isDarwin && stdenv.hostPlatform.isAarch64 && hostname == "lucas-macbook-pro") [
      # Desktop package only: do not import upstream's gateway/service module.
      # Upstream ships only bin/hermes-desktop on Darwin, which runs a bare Electron
      # with no app bundle; window managers such as AeroSpace then ignore it.
      # Package it the standard Electron way: a renamed Electron.app whose
      # Resources/app is the Hermes desktop bundle.
      (stdenvNoCC.mkDerivation {
        pname = "hermes-desktop-app";
        inherit (hermesDesktop) version;
        dontUnpack = true;
        dontFixup = true;
        installPhase = ''
          app="$out/Applications/Hermes.app/Contents"
          mkdir -p "$out/Applications" "$out/bin"
          # Full copy: Electron fails to load its V8 snapshot through a symlinked
          # Frameworks directory.
          cp -R "${hermesElectron}/Applications/Electron.app" "$out/Applications/Hermes.app"
          chmod -R u+w "$out/Applications/Hermes.app"
          rm -f "$app/Resources/default_app.asar" "$app/Resources/electron.icns" "$app/Info.plist"
          ln -s ${hermesDesktop}/share/hermes-desktop "$app/Resources/app"
          cp ${hermesDesktopIcon} "$app/Resources/Hermes.icns"
          ln -s "$app/MacOS/Electron" "$out/bin/hermes-desktop"
          cat > "$app/Info.plist" <<EOF
          <?xml version="1.0" encoding="UTF-8"?>
          <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
          <plist version="1.0"><dict>
            <key>CFBundleName</key><string>Hermes</string>
            <key>CFBundleDisplayName</key><string>Hermes</string>
            <key>CFBundleIdentifier</key><string>com.nousresearch.hermes</string>
            <key>CFBundleExecutable</key><string>Electron</string>
            <key>CFBundleIconFile</key><string>Hermes</string>
            <key>CFBundlePackageType</key><string>APPL</string>
            <key>CFBundleShortVersionString</key><string>${hermesDesktop.version}</string>
            <key>NSPrincipalClass</key><string>AtomApplication</string>
            <key>NSHighResolutionCapable</key><true/>
            <key>LSEnvironment</key><dict>
              <key>ELECTRON_IS_DEV</key><string>0</string>
              <key>HERMES_DESKTOP_HERMES</key><string>${hermesAgent}/bin/hermes</string>
            </dict>
          </dict></plist>
          EOF
        '';
      })
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
