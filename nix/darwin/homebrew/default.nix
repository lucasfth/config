{
  config,
  pkgs,
  lib,
  ...
}: {
  imports = [
    ./brews.nix
    ./casks.nix
    ./mas.nix
    ./activation.nix
  ];

  homebrew = {
    enable = true;
    onActivation = {
      autoUpdate = false;
      upgrade = false;
    };

    taps = [
      "homebrew/services" # brew services (postgres, redis)
      "minio/stable" # minio-warp
      "multica-ai/tap" # multica
      "sdkman/tap" # sdkman-cli
      "smudge/smudge" # nightlight
      "steipete/tap" # remindctl
    ];
  };
}
