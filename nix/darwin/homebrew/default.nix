{
  config,
  pkgs,
  lib,
  hostname,
  ...
}: {
  imports =
    [./brews.nix ./casks.nix]
    ++ lib.optionals (hostname == "lucas-macbook-pro") [
      ./mas.nix
      ./activation.nix
    ];

  homebrew = {
    enable = true;
    onActivation = {
      autoUpdate = false;
      upgrade = false;
    };

    taps =
      lib.optionals (hostname == "gimle") ["crmne/tap"]
      ++ lib.optionals (hostname == "lucas-macbook-pro") [
        "crmne/tap" # Spotifast native Spotify client
        "homebrew/services" # brew services (postgres, redis)
        "minio/stable" # minio-warp
        "multica-ai/tap" # multica
        "sdkman/tap" # sdkman-cli
        "smudge/smudge" # nightlight
        "spicy-lemonade/tap" # Salt encrypted memory backups
        "steipete/tap" # remindctl
      ];
  };
}
