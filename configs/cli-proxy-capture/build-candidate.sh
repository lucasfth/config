#!/usr/bin/env bash
set -euo pipefail
source_dir=$(cd "$(dirname "$0")" && pwd)
target=${1:?usage: build-candidate.sh /absolute/v8.0.35-worktree [--test-only]}
expected=ae3ee3be303fb07fb8173279923413005bf32177
[[ $(git -C "$target" rev-parse HEAD) == "$expected" ]] || { echo 'Refusing non-v8.0.35 target' >&2; exit 1; }
[[ -s "$source_dir/integration.patch" ]] || { echo 'Missing integration.patch' >&2; exit 1; }
temp_patch=$(mktemp)
trap 'rm -f "$temp_patch"' EXIT
# A repeat application may contain exactly our patch, never unrelated tracked edits.
if ! git -C "$target" diff --quiet; then
  git -C "$target" diff --binary -- internal/api/server.go internal/api/server_routes.go > "$temp_patch"
  cmp "$source_dir/integration.patch" "$temp_patch" || { echo 'Target tracked edits do not match capture patch' >&2; exit 1; }
  [[ $(git -C "$target" diff --name-only | wc -l | tr -d ' ') == 2 ]] || { echo 'Unrelated tracked changes' >&2; exit 1; }
else
  git -C "$target" apply --check "$source_dir/integration.patch"
  git -C "$target" apply "$source_dir/integration.patch"
fi
mkdir -p "$target/internal/trainingcapture"
for file in "$source_dir"/internal/trainingcapture/*.go; do
  dest="$target/internal/trainingcapture/$(basename "$file")"
  # All core imports are stdlib; the package has no upstream module-path coupling.
  cp "$file" "$dest"
done
for file in "$source_dir"/overlay/internal/api/*.tmpl; do
  cp "$file" "$target/internal/api/$(basename "${file%.tmpl}")"
done
cd "$target"
# The release has an unrelated pre-existing gofmt delta in pluginhost/host.go.
# Full-tree formatting was checked once; keep repeat builds scoped to our files.
gofmt -w internal/trainingcapture internal/api/training_capture*.go internal/api/server.go internal/api/server_routes.go
export CC=${CC:-/usr/bin/clang}
go test ./internal/trainingcapture ./internal/api ./internal/api/middleware -count=1
go build -o test-output ./cmd/server
rm test-output
if [[ ${2:-} != --test-only ]]; then
  output="$target/.capture-build"
  mkdir -p "$output"
  go build -trimpath -o "$output/cli-proxy-api-candidate" ./cmd/server
  printf 'Candidate only (not activated): %s\n' "$output/cli-proxy-api-candidate"
fi
