{pkgs}: let
  sdk = pkgs.fetchurl {
    url = "https://github.com/AcademySoftwareFoundation/openfx/archive/c3f1c2dcf4f51762b794c4fc21181b4a501be1bf.tar.gz";
    hash = "sha256-698xyxi6nz7AgtdNEsa5T29ywFpNTIjil0sTKUpNKnE=";
  };
in
  pkgs.stdenv.mkDerivation {
    pname = "corridorkey-ofx";
    version = "0.1.0";
    src = ../../configs/davinci-resolve/native;
    sdkArchive = sdk;
    dontFixup = true;
    dontConfigure = true;
    buildPhase = ''
      runHook preBuild
      mkdir sdk
      tar -xzf "$sdkArchive" -C sdk --strip-components=1
      $CXX -std=c++17 -O2 -Wall -Wextra -Werror -fPIC -shared \
        -Isdk/include plugin.cpp -o CorridorKey2.ofx
      runHook postBuild
    '';
    installPhase = ''
      runHook preInstall
      bundle="$out/Library/OFX/Plugins/CorridorKey2.ofx.bundle"
      mkdir -p "$bundle/Contents/MacOS" "$bundle/Contents/Resources"
      cp CorridorKey2.ofx "$bundle/Contents/MacOS/CorridorKey2.ofx"
      cp worker.py "$bundle/Contents/Resources/worker.py"
      cp Info.plist "$bundle/Contents/Info.plist"
      cp sdk/LICENSE.md "$bundle/Contents/Resources/OpenFX-LICENSE.md"
      cp NOTICE LICENSE "$bundle/Contents/Resources/"
      /usr/bin/codesign --force --sign - "$bundle"
      /usr/bin/codesign --verify --deep --strict "$bundle"
      runHook postInstall
    '';
    meta = {
      description = "Independent native CorridorKey 2.0 OFX adapter using a private MLX worker";
      platforms = ["aarch64-darwin"];
      license = pkgs.lib.licenses.mit;
    };
  }
