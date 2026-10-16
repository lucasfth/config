#!/usr/bin/env bash
# A display-only host summary on the first workspace; no synthetic agents/panes.
set -euo pipefail
HERDR=${HERDR_BIN_PATH:-herdr}
SOURCE=huginn-host-summary
ROOT=$(cd "$(dirname "$0")" && pwd -P)
STATE=${HERDR_PLUGIN_STATE_DIR:-${XDG_STATE_HOME:-$HOME/.local/state}/herdr/plugins/huginn.host-summary}
# Encode the exact resolved socket path so sessions cannot share a hashed lock.
SOCKET=${HERDR_SOCKET_PATH:-$("$HERDR" status server | awk '/^socket: / {sub(/^socket: /, ""); print}')}
[[ -n "$SOCKET" ]] || { printf 'No running Herdr socket\n' >&2; exit 1; }
export HERDR_SOCKET_PATH="$SOCKET"
SESSION=$(printf '%s' "$SOCKET" | od -An -tx1 | tr -d ' \n')
LOCKDIR="$STATE/$SESSION.lock"

lock_owner() {
  local pid
  [[ -f "$LOCKDIR/owner" ]] || return 1
  IFS= read -r pid < "$LOCKDIR/owner"
  [[ "$pid" =~ ^[0-9]+$ ]] || return 1
  printf '%s\n' "$pid"
}

owner_matches() {
  local pid=$1 owner_pid owner_root owner_socket owner_started process_started
  [[ -f "$LOCKDIR/owner" ]] || return 1
  { IFS= read -r owner_pid; IFS= read -r owner_root; IFS= read -r owner_socket; IFS= read -r owner_started; } < "$LOCKDIR/owner"
  [[ "$owner_pid" == "$pid" && "$owner_root" == "$ROOT" && "$owner_socket" == "$SOCKET" ]] || return 1
  process_started=$(ps -p "$pid" -o lstart= 2>/dev/null) || return 1
  [[ "$owner_started" == "$process_started" ]]
}

lock_identity_matches() {
  local pid=$1 owner_pid owner_root owner_socket owner_started process_started
  [[ -f "$LOCKDIR/owner" ]] || return 1
  { IFS= read -r owner_pid; IFS= read -r owner_root; IFS= read -r owner_socket; IFS= read -r owner_started; } < "$LOCKDIR/owner"
  [[ "$owner_pid" == "$pid" && "$owner_root" == "$ROOT" && "$owner_socket" == "$SOCKET" ]] || return 1
  process_started=$(ps -p "$pid" -o lstart= 2>/dev/null) || return 0
  [[ "$owner_started" != "$process_started" ]]
}

is_collector() {
  local pid=$1 command
  owner_matches "$pid" || return 1
  command=$(ps -p "$pid" -o command= 2>/dev/null) || return 1
  case " $command " in *" $ROOT/summary.sh --run "*) return 0 ;; esac
  return 1
}

remove_stale_owner() {
  local pid=$1
  [[ -d "$LOCKDIR" ]] || return 0
  # Only one stale-owner reaper may enter; new collectors wait while this guard exists.
  mkdir "$LOCKDIR/reaping" 2>/dev/null || return 1
  if lock_identity_matches "$pid" && ! is_collector "$pid"; then
    rm -f "$LOCKDIR/owner"
    rmdir "$LOCKDIR/reaping"
    rmdir "$LOCKDIR" 2>/dev/null || true
    return 0
  fi
  rmdir "$LOCKDIR/reaping" 2>/dev/null || true
  return 1
}

release_lock() {
  local pid=$$
  owner_matches "$pid" || return 0
  rm -f "$LOCKDIR/owner"
  rmdir "$LOCKDIR" 2>/dev/null || true
}

acquire_lock() {
  local owner attempt started
  mkdir -p "$STATE"
  for ((attempt=0; attempt < 200; attempt++)); do
    if mkdir "$LOCKDIR" 2>/dev/null; then
      started=$(ps -p "$$" -o lstart=) || return 2
      if printf '%s\n%s\n%s\n%s\n' "$$" "$ROOT" "$SOCKET" "$started" > "$LOCKDIR/owner"; then
        return 0
      fi
      rm -f "$LOCKDIR/owner"
      rmdir "$LOCKDIR" 2>/dev/null || true
    elif owner=$(lock_owner); then
      if is_collector "$owner"; then return 1; fi
      remove_stale_owner "$owner" || true
    fi
    # Empty directories are the mkdir-to-owner-registration window; never steal them.
    sleep 0.05
  done
  printf 'Timed out acquiring Herdr collector lock for %s\n' "$SOCKET" >&2
  return 2
}

wait_for_collector() {
  local candidate=$1 owner attempt
  for ((attempt=0; attempt < 200; attempt++)); do
    if owner=$(lock_owner) && is_collector "$owner"; then return 0; fi
    if ! kill -0 "$candidate" 2>/dev/null; then
      if owner=$(lock_owner) && is_collector "$owner"; then return 0; fi
      printf 'Herdr collector exited before acquiring its lock\n' >&2
      return 1
    fi
    sleep 0.05
  done
  printf 'Timed out waiting for Herdr collector lock\n' >&2
  return 1
}


collect() {
  local cpu mem free battery="" value total idle total2 idle2 pages
  case $(uname -s) in
    Darwin)
      cpu=$(top -l2 -n0 -s1 | awk '/CPU usage/ {gsub(/%/, "", $7); value=100-$7} END {printf "%.0f", value}')
      pages=$(sysctl -n hw.pagesize)
      mem=$(vm_stat | awk -v pages="$pages" '/Pages active/ {a=$3} /Pages wired down/ {w=$4} END {gsub(/\./,"",a); gsub(/\./,"",w); printf "%.1f", (a+w)*pages/1073741824}')
      value=$(pmset -g batt 2>/dev/null || true)
      battery=$(printf '%s\n' "$value" | awk '/InternalBattery/ {if(match($0,/[0-9]+%/)) print substr($0,RSTART,RLENGTH)}')
      cpu="${cpu}%"
      ;;
    Linux)
      if [[ -r /proc/stat ]]; then
        read -r total idle < <(awk '/^cpu / {for(i=2;i<=9;i++) t+=$i; print t, $5+$6; exit}' /proc/stat)
        sleep 1
        read -r total2 idle2 < <(awk '/^cpu / {for(i=2;i<=9;i++) t+=$i; print t, $5+$6; exit}' /proc/stat)
        cpu=$(awk -v t="$((total2-total))" -v i="$((idle2-idle))" 'BEGIN {if(t>0) printf "%.0f",100*(t-i)/t; else print 0}')
        cpu="${cpu}%"
      else
        # Android restricts /proc/stat; do not claim top's zero-idle fallback is real.
        cpu="n/a"
      fi
      mem=$(awk '/MemTotal:/ {t=$2} /MemAvailable:/ {a=$2} END {printf "%.1f",(t-a)/1048576}' /proc/meminfo)
      for value in /sys/class/power_supply/*/capacity; do
        [[ -r "$value" ]] || continue
        read -r battery < "$value"
        battery="${battery}%"
        break
      done
      ;;
    *) printf 'Unsupported host platform\n' >&2; return 1 ;;
  esac
  free=$(df -Pk "$HOME" | awk 'END {printf "%.0f",$4/1048576}')
  LOAD=" ${cpu}  ${mem}G"
  STORAGE=" ${free}G"
  [[ -z "$battery" ]] || STORAGE="$STORAGE  $battery"
}

publish() {
  local ids wid first=1
  ids=$("$HERDR" workspace list | jq -er '.result.workspaces | map(.workspace_id) | join("\n")') || return 1
  [[ -n "$ids" ]] || return 0
  collect
  while IFS= read -r wid; do
    if [[ "$first" == 1 ]]; then
      "$HERDR" workspace report-metadata "$wid" --source "$SOURCE" \
        --token "host_load=$LOAD" --token "host_storage=$STORAGE" --ttl-ms 20000 >/dev/null
      first=0
    else
      "$HERDR" workspace report-metadata "$wid" --source "$SOURCE" \
        --clear-token host_load --clear-token host_storage >/dev/null
    fi
  done <<< "$ids"
}

stop() {
  local pid owner attempt
  owner=$(lock_owner) || return 0
  if ! is_collector "$owner"; then
    remove_stale_owner "$owner" || true
    return 0
  fi
  pid=$owner
  kill -TERM "$pid" 2>/dev/null || true
  for ((attempt=0; attempt < 100; attempt++)); do
    if ! kill -0 "$pid" 2>/dev/null; then
      if owner_matches "$pid"; then remove_stale_owner "$pid" || true; fi
      return 0
    fi
    sleep 0.05
  done
  printf 'Timed out waiting for Herdr collector %s to exit\n' "$pid" >&2
  return 1
}

case ${1:---once} in
  --once) publish ;;
  --run)
    acquire_lock || exit $?
    trap release_lock EXIT
    trap 'exit 0' TERM INT
    while :; do
      if publish; then :; fi
      sleep 5
    done
    ;;
  --spawn)
    mkdir -p "$STATE"
    nohup bash "$ROOT/summary.sh" --run </dev/null >>"$STATE/$SESSION.log" 2>&1 &
    wait_for_collector "$!"
    ;;
  --stop) stop ;;
  *) printf 'Usage: summary.sh --once|--spawn|--run|--stop\n' >&2; exit 2 ;;
esac
