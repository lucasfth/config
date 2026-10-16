#!/usr/bin/env bash
# Build the pinned, tested macOS client. Installation is explicit; servers stay untouched.
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd -P)
install=false
case ${1:-} in
  '') ;;
  --install) install=true ;;
  --help|-h)
    printf 'Usage: %s [--install]\nBuild/test the pinned sidebar client; --install replaces only ~/.local/libexec/herdr-patched.\n' "$0"
    exit 0 ;;
  *) printf 'Unknown argument: %s\n' "$1" >&2; exit 2 ;;
esac
[[ $# -le 1 ]] || { printf 'Only --install is accepted\n' >&2; exit 2; }
[[ $(uname -s) == Darwin && $(uname -m) == arm64 ]] || {
  printf 'The pinned client build currently targets Apple Silicon macOS only.\n' >&2
  exit 1
}
# shellcheck source=../configs/herdr/client-build.env
source "$root/configs/herdr/client-build.env"
for command in git curl shasum tar cargo xcrun; do
  command -v "$command" >/dev/null || { printf 'Missing build prerequisite: %s\n' "$command" >&2; exit 1; }
done
cache=${XDG_CACHE_HOME:-$HOME/.cache}/huginn/herdr-client
mkdir -p "$cache"
# Only this helper owns these disposable source directories; never reset a user's checkout.
checkout=$(mktemp -d "$cache/source.XXXXXX")
trap 'rm -rf "$checkout"' EXIT
git -C "$checkout" init --quiet
git -C "$checkout" remote add origin "$HERDR_REPOSITORY"
git -C "$checkout" fetch --quiet --depth 1 origin "$HERDR_REVISION"
git -C "$checkout" checkout --quiet --detach FETCH_HEAD
[[ $(git -C "$checkout" rev-parse HEAD) == "$HERDR_REVISION" ]]
git -C "$checkout" apply --check "$root/configs/herdr/client.patch"
git -C "$checkout" apply "$root/configs/herdr/client.patch"

archive="$cache/zig-$ZIG_VERSION.tar.xz"
zig_root="$cache/zig-aarch64-macos-$ZIG_VERSION"
if [[ ! -f "$archive" ]] || [[ $(shasum -a 256 "$archive" | cut -d ' ' -f 1) != "$ZIG_SHA256" ]]; then
  download=$(mktemp "$cache/zig-download.XXXXXX")
  if ! curl --fail --location --output "$download" "$ZIG_URL"; then rm -f "$download"; exit 1; fi
  if [[ $(shasum -a 256 "$download" | cut -d ' ' -f 1) != "$ZIG_SHA256" ]]; then
    rm -f "$download"
    printf 'Zig archive checksum mismatch\n' >&2
    exit 1
  fi
  mv "$download" "$archive"
fi
if [[ ! -x "$zig_root/zig" ]]; then tar -xf "$archive" -C "$cache"; fi
[[ $("$zig_root/zig" version) == "$ZIG_VERSION" ]]
export ZIG="$zig_root/zig"
export CC
CC=$(xcrun --find clang)
export CARGO_TARGET_AARCH64_APPLE_DARWIN_LINKER="$CC"
export CARGO_TARGET_DIR="$cache/target"
(cd "$checkout" && cargo test --locked -p herdr --bin herdr client::shell::tests && cargo build --locked --release -p herdr --bin herdr)
built="$CARGO_TARGET_DIR/release/herdr"
[[ $("$built" --version) == "herdr $HERDR_VERSION" ]]
if "$install"; then
  destination="$HOME/.local/libexec/herdr-patched"
  mkdir -p "$(dirname "$destination")"
  if [[ -f "$destination" ]]; then
    cp -p "$destination" "$destination.previous"
  fi
  staged=$(mktemp "$(dirname "$destination")/.herdr-patched.XXXXXX")
  cp "$built" "$staged"
  chmod 755 "$staged"
  mv "$staged" "$destination"
  printf 'Installed %s\nDetach/re-attach the viewing client to load it. No server or agent was restarted.\n' "$destination"
fi
printf 'Build artifact: %s\n' "$built"
shasum -a 256 "$built"
