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

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/home/.local/libexec" "$tmp/bin"
cat > "$tmp/bin/herdr" <<'SH'
#!/bin/sh
printf 'managed:%s\n' "$*"
SH
chmod +x "$tmp/bin/herdr"
HOME=$tmp/home
OSTYPE=darwin24
PATH="$tmp/bin:/usr/bin:/bin"
[[ $(herdr status) == managed:status ]] || {
  print -u2 -- 'Herdr wrapper did not fall back to the managed executable.'
  exit 1
}
cat > "$HOME/.local/libexec/herdr-patched" <<'SH'
#!/bin/sh
printf 'patched:%s\n' "$*"
SH
chmod +x "$HOME/.local/libexec/herdr-patched"
[[ $(herdr status) == patched:status ]] || {
  print -u2 -- 'Herdr wrapper did not prefer the local patch.'
  exit 1
}
print 'Herdr wrapper fallback and patch selection passed.'
