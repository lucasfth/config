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
    "gum" # Optional styled Repolicense menus and detail pager
    "mas" # Mac App Store CLI
    "mole"
    "postgresql@14"
    "redis"
    "remindctl"
    "spicy-lemonade/tap/salt" # Not SaltStack
    "herdr"
    "ykman"
  ];
}
