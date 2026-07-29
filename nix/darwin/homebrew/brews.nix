{
  config,
  pkgs,
  lib,
  ...
}: {
  homebrew.brews = [
    "apfel"
    "bun"
    "container"
    "firebase-cli"
    "mas" # Mac App Store CLI
    "mole"
    "opencode"
    "postgresql@14"
    "redis"
    "remindctl"
    "herdr"
  ];
}
