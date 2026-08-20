#!/usr/bin/env bash
set -euo pipefail

config='.#darwinConfigurations."lucas-macbook-pro".config'
init_content=$(nix eval --raw "$config.home-manager.users.lucasfreytorreshanson.programs.zsh.initContent")
post_activation=$(nix eval --raw "$config.system.activationScripts.postActivation.text")

[[ $init_content == *'source "$HOME/.cache/zsh/mole-completion.zsh"'* ]] || {
  echo 'expected zsh to source the cached Mole completion' >&2
  exit 1
}
[[ $init_content != *'mole completion zsh'* ]] || {
  echo 'zsh must not generate the Mole completion on startup' >&2
  exit 1
}
[[ $post_activation == *'/opt/homebrew/bin/mole completion zsh'* ]] || {
  echo 'expected activation to regenerate the Mole completion cache' >&2
  exit 1
}
[[ $post_activation == *'sudo pmset -b powernap 0'* ]] || {
  echo 'expected activation to disable Power Nap on battery' >&2
  exit 1
}

for plugin in swiftbar/memory.60s.sh swiftbar/battery.60s.sh swiftbar/workspace.15s.sh; do
  [[ -f $plugin ]] || {
    echo "expected optimized plugin $plugin" >&2
    exit 1
  }
done

for retired_plugin in swiftbar/memory.10s.sh swiftbar/battery.30s.sh swiftbar/workspace.5s.sh; do
  [[ ! -e $retired_plugin ]] || {
    echo "expected retired plugin $retired_plugin to be removed" >&2
    exit 1
  }
done
