#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)
script="$repo_root/scripts/nix-health"
tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT

missing_home="$tmpdir/missing-home"
mkdir -p "$missing_home"

set +e
missing_output=$(HOME="$missing_home" "$script" --check 2>&1)
missing_status=$?
set -e

[[ $missing_status -eq 1 ]] || {
  echo "expected missing Nix profile to return 1, got $missing_status" >&2
  exit 1
}
[[ $missing_output == *"Nix health check failed:"* ]] || {
  echo "expected missing Nix profile diagnosis, got: $missing_output" >&2
  exit 1
}
[[ $missing_output == *"$missing_home/.nix-profile/bin/zsh"* ]] || {
  echo "expected missing profile path in diagnosis, got: $missing_output" >&2
  exit 1
}
[[ $missing_output == *"docs/nix-recovery.md"* ]] || {
  echo "expected recovery runbook path, got: $missing_output" >&2
  exit 1
}

healthy_home="$tmpdir/healthy-home"
mkdir -p "$healthy_home"
ln -s "$HOME/.nix-profile" "$healthy_home/.nix-profile"

healthy_output=$(HOME="$healthy_home" "$script" --check)
[[ $healthy_output == "Nix health check passed." ]] || {
  echo "expected healthy Nix profile confirmation, got: $healthy_output" >&2
  exit 1
}
