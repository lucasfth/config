{
  config,
  pkgs,
  lib,
  hostname,
  ...
}: {
  homebrew.brews =
    if hostname == "gimle"
    then [
      "bun"
      "container"
      "herdr"
      "spicy-lemonade/tap/salt" # Native verified ciphertext backups
    ]
    else [
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
