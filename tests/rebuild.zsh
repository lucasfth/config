#!/usr/bin/env zsh
set -eu

repo_root=${0:A:h:h}
source "$repo_root/nix/common/shell/interactive.zsh"

# No real privilege escalation or activation. A failed rebuild must not exec Zsh.
sudo() {
  print -r -- "$*"
  return 37
}

for platform expected in \
  darwin27.0 /nix/var/nix/profiles/system/sw/bin/darwin-rebuild \
  linux-gnu nixos-rebuild; do
  OSTYPE=$platform
  set +e
  output=$(PATH=/usr/bin:/bin rebuild)
  result=$?
  set -e
  [[ $result == 37 ]] || {
    print -u2 -- "Expected rebuild failure to propagate on $platform, got $result"
    exit 1
  }
  [[ $output == "$expected switch --flake $HOME/config#$(hostname)" ]] || {
    print -u2 -- "Wrong rebuild command on $platform: $output"
    exit 1
  }
done

print 'Rebuild platform dispatch and failure propagation passed.'
