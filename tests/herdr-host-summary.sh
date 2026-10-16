#!/usr/bin/env bash
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd -P)
scratch=$(mktemp -d)
state="$scratch/state"
script="$root/configs/herdr/host-summary/summary.sh"
export FIXTURE="$scratch" HERDR_BIN_PATH="$scratch/herdr" HERDR_PLUGIN_STATE_DIR="$state"
mkdir -p "$state"
cat > "$HERDR_BIN_PATH" <<'SH'
#!/usr/bin/env bash
set -eu
if [[ "$1 $2" == "workspace list" ]]; then
  cat "$FIXTURE/workspaces.json"
else
  printf '%s\t%s\t%s\n' "$HERDR_SOCKET_PATH" "$PPID" "$*" >> "$FIXTURE/calls"
  socket_key=$(printf '%s' "$HERDR_SOCKET_PATH" | od -An -tx1 | tr -d ' \n')
  if [[ "$*" == workspace\ report-metadata* && -e "$FIXTURE/block-$socket_key" ]]; then
    : > "$FIXTURE/blocked-$PPID"
    while [[ ! -e "$FIXTURE/release-$socket_key" ]]; do sleep 0.02; done
  fi
fi
SH
chmod +x "$HERDR_BIN_PATH"
printf '%s\n' '{"result":{"workspaces":[{"workspace_id":"w5"},{"workspace_id":"w9"}]}}' > "$scratch/workspaces.json"

socket_key() { printf '%s' "$1" | od -An -tx1 | tr -d ' \n'; }
lock_dir() { printf '%s/%s.lock' "$state" "$(socket_key "$1")"; }
owner_pid() { awk 'NR == 1 {print; exit}' "$(lock_dir "$1")/owner"; }
wait_for_file() {
  local file=$1 attempt
  for ((attempt=0; attempt < 200; attempt++)); do
    [[ -e "$file" ]] && return 0
    sleep 0.02
  done
  printf 'Timed out waiting for %s\n' "$file" >&2
  return 1
}
reporter_count() {
  awk -F '\t' -v socket="$1" '$1 == socket && $3 ~ /^workspace report-metadata/ {print $2}' "$scratch/calls" | sort -u | wc -l | tr -d ' '
}
cleanup() {
  local socket pid
  for socket in test.sock other.sock; do
    : > "$scratch/release-$(socket_key "$socket")"
    HERDR_SOCKET_PATH="$socket" bash "$script" --stop >/dev/null 2>&1 || true
  done
  [[ -z ${unrelated_pid:-} ]] || kill "$unrelated_pid" 2>/dev/null || true
  rm -rf "$scratch"
}
trap cleanup EXIT

# A machine summary belongs only to the first visible workspace.
export HERDR_SOCKET_PATH=test.sock
bash "$script" --once
[[ $(grep -c -- '--token host_load=' "$scratch/calls") == 1 ]]
grep -q -- 'report-metadata w5 .*--token host_load=' "$scratch/calls"
grep -q -- 'report-metadata w9 .*--clear-token host_load' "$scratch/calls"
grep -q -- '--ttl-ms 20000' "$scratch/calls"
# Moving the first workspace transfers the summary and clears the former owner.
printf '%s\n' '{"result":{"workspaces":[{"workspace_id":"w9"},{"workspace_id":"w5"}]}}' > "$scratch/workspaces.json"
: > "$scratch/calls"
bash "$script" --once
grep -q -- 'report-metadata w9 .*--token host_load=' "$scratch/calls"
grep -q -- 'report-metadata w5 .*--clear-token host_load' "$scratch/calls"
# Empty sessions have no owner and must not issue a malformed metadata update.
printf '%s\n' '{"result":{"workspaces":[]}}' > "$scratch/workspaces.json"
: > "$scratch/calls"
bash "$script" --once
[[ ! -s "$scratch/calls" ]]
printf '%s\n' '{"result":{"workspaces":[{"workspace_id":"w5"}]}}' > "$scratch/workspaces.json"

# Concurrent --spawn callers must all return only after one collector owns the socket.
socket=test.sock
key=$(socket_key "$socket")
: > "$scratch/block-$key"
: > "$scratch/calls"
starts=()
for _ in {1..8}; do HERDR_SOCKET_PATH="$socket" bash "$script" --spawn & starts+=("$!"); done
for pid in "${starts[@]}"; do wait "$pid"; done
owner=$(owner_pid "$socket")
wait_for_file "$scratch/blocked-$owner"
[[ $(reporter_count "$socket") == 1 ]]

# --stop keeps the old lock while its real child is blocked, then waits for exit.
HERDR_SOCKET_PATH="$socket" bash "$script" --stop & stop_pid=$!
sleep 0.2
[[ -d "$(lock_dir "$socket")" ]]
[[ $(owner_pid "$socket") == "$owner" ]]
kill -0 "$owner"
: > "$scratch/release-$key"
wait "$stop_pid"
[[ ! -d "$(lock_dir "$socket")" ]]
# Publication history from the stopped generation is not a concurrent reporter.
: > "$scratch/calls"

# Immediate restart survives the old collector's exit cleanup and remains stable.
HERDR_SOCKET_PATH="$socket" bash "$script" --spawn
new_owner=$(owner_pid "$socket")
[[ "$new_owner" != "$owner" ]]
sleep 0.2
[[ $(owner_pid "$socket") == "$new_owner" ]]

# A second resolved socket has an independent live collector and lock.
: > "$scratch/block-$(socket_key other.sock)"
HERDR_SOCKET_PATH=other.sock bash "$script" --spawn
other_owner=$(owner_pid other.sock)
wait_for_file "$scratch/blocked-$other_owner"
[[ "$other_owner" != "$new_owner" ]]
[[ $(reporter_count test.sock) == 1 ]]
[[ $(reporter_count other.sock) == 1 ]]
: > "$scratch/release-$(socket_key other.sock)"

# A recorded PID that belongs to another command must never be signalled by --stop.
HERDR_SOCKET_PATH=stale.sock sleep 30 & unrelated_pid=$!
stale_lock=$(lock_dir stale.sock)
mkdir -p "$stale_lock"
started=$(ps -p "$unrelated_pid" -o lstart=)
printf '%s\n%s\n%s\n%s\n' "$unrelated_pid" "$root/configs/herdr/host-summary" stale.sock "$started" > "$stale_lock/owner"
HERDR_SOCKET_PATH=stale.sock bash "$script" --stop
kill -0 "$unrelated_pid"
[[ -d "$stale_lock" ]]
kill "$unrelated_pid"
for _ in {1..100}; do
  kill -0 "$unrelated_pid" 2>/dev/null || break
  sleep 0.02
done
wait "$unrelated_pid" 2>/dev/null || true
HERDR_SOCKET_PATH=stale.sock bash "$script" --stop
[[ ! -d "$stale_lock" ]]

printf 'PASS: workspace ownership, concurrent singleton lifecycle, restart, socket isolation, and unrelated PID safety\n'
