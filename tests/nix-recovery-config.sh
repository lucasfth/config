#!/usr/bin/env bash
set -euo pipefail

config='.#darwinConfigurations."lucas-macbook-pro".config'

agent_args=$(nix eval --json "$config.launchd.user.agents.nix-health.serviceConfig.ProgramArguments")
[[ $agent_args == *'"/bin/bash"'* ]] || {
  echo "expected Nix health agent to use the system Bash" >&2
  exit 1
}
[[ $agent_args == *'"-c"'* ]] || {
  echo "expected Nix health agent to contain a self-contained health check" >&2
  exit 1
}

agent_home=$(nix eval --raw "$config.launchd.user.agents.nix-health.serviceConfig.EnvironmentVariables.HOME")
[[ $agent_home == /Users/lucasfreytorreshanson ]] || {
  echo "expected Nix health agent to receive its home directory, got $agent_home" >&2
  exit 1
}

interval=$(nix eval --json "$config.launchd.user.agents.nix-health.serviceConfig.StartInterval")
[[ $interval == 86400 ]] || {
  echo "expected daily Nix health check, got $interval" >&2
  exit 1
}

if nix eval "$config.launchd.daemons.darwin-store" >/dev/null 2>&1; then
  echo "expected obsolete Nix Store unlock daemon to be absent" >&2
  exit 1
fi
