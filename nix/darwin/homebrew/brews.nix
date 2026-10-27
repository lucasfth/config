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
      "apache-spark"
      "apfel"
      "bun"
      "container"
      "fileicon"
      "findutils"
      "firebase-cli"
      "gradle@7"
      "gum" # Optional styled Repolicense menus and detail pager
      "mas" # Mac App Store CLI
      "minio-warp"
      "mole"
      "multica-ai/tap/multica"
      "openvino"
      "parquet-cli"
      "postgresql@14"
      "postgrest"
      "python@3.12"
      "redis"
      "remindctl"
      "sdkman/tap/sdkman-cli"
      "smudge/smudge/nightlight"
      "tmux" # Running sessions use this binary; Nix tmux is a separate copy
      "spicy-lemonade/tap/salt" # Not SaltStack
      "herdr"
      "ykman"
    ];
}
