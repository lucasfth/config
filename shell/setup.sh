#!/bin/bash
set -eu
usage() { printf '%s\n' 'Usage: bash ~/.local/share/huginn-shell/setup.sh --host LABEL --profile zsh|bash|minimal-zsh [--dry-run]' >&2; exit 2; }
host= profile= dry_run=0
while [ "$#" -gt 0 ]; do
  case "$1" in
    --host) [ "$#" -ge 2 ] || usage; host=$2; shift 2 ;;
    --profile) [ "$#" -ge 2 ] || usage; profile=$2; shift 2 ;;
    --dry-run) dry_run=1; shift ;;
    *) usage ;;
  esac
done
case "$host" in ''|[!a-z]*|*[!a-z0-9-]*) printf 'Invalid host label: %s\n' "$host" >&2; exit 2 ;; esac
case "$profile" in zsh|bash|minimal-zsh) ;; *) usage ;; esac
script_dir=$(CDPATH= cd "$(dirname "$0")" && pwd -P)
root=${HUGINN_SHELL_ROOT:-$script_dir}
case "$root" in /*) ;; *) printf '%s\n' 'Payload root must be absolute' >&2; exit 2 ;; esac
root=$(CDPATH= cd "$root" && pwd -P)
home=${HOME:?HOME must be set}
home=$(CDPATH= cd "$home" && pwd -P)
launcher="$home/.local/bin/huginn-shell"
backups="$root/backups"
find_shell() {
  name=$1
  candidate="$home/.nix-profile/bin/$name"
  if [ -x "$candidate" ]; then printf '%s\n' "$candidate"; return 0; fi
  found=$(command -v "$name" 2>/dev/null || true)
  if [ -n "$found" ] && [ -x "$found" ]; then printf '%s\n' "$found"; return 0; fi
  for candidate in "/bin/$name" "/usr/bin/$name"; do
    if [ -x "$candidate" ]; then printf '%s\n' "$candidate"; return 0; fi
  done
  return 1
}
bash_path=$(find_shell bash) || { printf '%s\n' 'Bash executable not found' >&2; exit 1; }
zsh_path=
if [ "$profile" != bash ]; then zsh_path=$(find_shell zsh) || { printf '%s\n' 'Zsh executable not found' >&2; exit 1; }; fi
case "$profile" in
  bash) [ -r "$root/fleet.bash" ] || { printf '%s\n' 'Unreadable fleet.bash payload' >&2; exit 1; } ;;
  zsh) [ -r "$root/fleet.zsh" ] || { printf '%s\n' 'Unreadable fleet.zsh payload' >&2; exit 1; } ;;
  minimal-zsh) [ -r "$root/minimal.zsh" ] || { printf '%s\n' 'Unreadable minimal.zsh payload' >&2; exit 1; } ;;
esac
if [ "$profile" = bash ] && [ ! -r "$root/identity.bash" ]; then printf '%s\n' 'Unreadable identity.bash payload' >&2; exit 1; fi
if [ -n "$zsh_path" ] && [ ! -r "$root/identity.zsh" ]; then printf '%s\n' 'Unreadable identity.zsh payload' >&2; exit 1; fi
if [ -n "$zsh_path" ] && [ ! -r "$root/identity.bash" ]; then printf '%s\n' 'Unreadable identity.bash payload' >&2; exit 1; fi
herdr=
if [ -n "${HERDR_CONFIG_PATH:-}" ]; then herdr=$HERDR_CONFIG_PATH
elif [ -x "$home/.local/bin/herdr" ] || command -v herdr >/dev/null 2>&1; then herdr="$home/.config/herdr/config.toml"
fi
if [ -n "$herdr" ] && ! command -v awk >/dev/null 2>&1; then
  if [ "$profile" = minimal-zsh ]; then
    printf 'Skipping Herdr configuration: awk unavailable on minimal device\n'
    herdr=
  else printf 'awk is required to preserve Herdr settings\n' >&2; exit 1; fi
fi
if [ "$dry_run" -eq 1 ]; then
  printf 'Would install %s shell launcher for %s at %s\n' "$profile" "$host" "$launcher"
  printf 'Would install isolated startup files under %s\n' "$root"
  if [ -n "$herdr" ]; then printf 'Would set Herdr terminal.default_shell in %s\n' "$herdr"; fi
  printf '%s\n' 'Would install interactive SSH identity hooks without changing login shells'
  exit 0
fi
ensure_dir() {
  dir=$1
  case "$dir" in /*) ;; *) printf 'Output directory must be absolute: %s\n' "$dir" >&2; exit 1 ;; esac
  check=$dir
  while [ "$check" != / ]; do
    [ ! -L "$check" ] || { printf 'Refusing symlink directory: %s\n' "$check" >&2; exit 1; }
    check=$(dirname "$check")
  done
  mkdir -p "$dir"
}
atomic_from_stdin() {
  output=$1
  parent=$(dirname "$output")
  ensure_dir "$parent"
  temp=$(mktemp "$parent/.huginn-shell.XXXXXX")
  (umask 077; cat > "$temp")
  chmod 600 "$temp"
  mv -f "$temp" "$output"
}
backup_file() {
  source_path=$1; name=$2; destination="$backups/$name"
  [ ! -L "$destination" ] || { printf 'Refusing symlink backup: %s\n' "$destination" >&2; exit 1; }
  if [ ! -e "$destination" ]; then
    if [ -L "$source_path" ]; then
      target=$(readlink "$source_path")
      case "$target" in /*) : ;; *) target="$(dirname "$source_path")/$target" ;; esac
      [ -f "$target" ] || { printf 'Cannot back up symlink target: %s\n' "$source_path" >&2; exit 1; }
      cp -p "$target" "$destination"
    elif [ -f "$source_path" ]; then cp -p "$source_path" "$destination"
    else return 0; fi
    chmod 600 "$destination"
  fi
}
ensure_dir "$backups"
chmod 700 "$backups"
ensure_dir "$home/.local/bin"
ensure_dir "$root/zsh"

# Preserve host startup, adding only the approved interactive identity hook.
append_identity() {
  shell_name=$1
  startup=$2
  identity="$root/identity.$shell_name"
  marker="# BEGIN HUGINN SHELL IDENTITY $shell_name"
  end_marker="# END HUGINN SHELL IDENTITY $shell_name"
  [ -r "$identity" ] || return 0
  replacing_link=0
  if [ -L "$startup" ]; then
    case "$host:$startup" in
      freyr:"$home/.zshrc"|mimer:"$home/.zshrc") replacing_link=1 ;;
      *) printf 'Skipping unapproved startup symlink: %s\n' "$startup"; return 0 ;;
    esac
    source_path=$(readlink "$startup")
    case "$source_path" in /*) : ;; *) source_path="$(dirname "$startup")/$source_path" ;; esac
    [ -f "$source_path" ] || { printf 'Cannot replace broken startup symlink: %s\n' "$startup" >&2; exit 1; }
    backup_file "$startup" "$(basename "$startup")"
    cmp -s "$source_path" "$backups/$(basename "$startup")" || { printf 'Startup changed since backup: %s\n' "$startup" >&2; exit 1; }
  else
    backup_file "$startup" "$(basename "$startup")"
    source_path=$startup
  fi
  temp=$(mktemp "$(dirname "$startup")/.huginn-shell.XXXXXX")
  trap 'rm -f "$temp"' EXIT HUP INT TERM
  if [ -f "$source_path" ]; then
    skip=0
    while IFS= read -r line || [ -n "$line" ]; do
      if [ "$line" = "$marker" ]; then skip=1
      elif [ "$line" = "$end_marker" ]; then skip=0
      elif [ "$skip" -eq 0 ]; then printf '%s\n' "$line"; fi
    done < "$source_path" > "$temp"
  fi
  {
    printf '%s\n' "$marker"
    if [ "$shell_name" = bash ]; then
      printf 'if [ -n "${PS1-}" ] && [ -z "${HUGINN_SHELL_MANAGED-}" ]; then\n'
      printf '  export HUGINN_SHELL_ROOT="%s" HUGINN_HOST_LABEL="%s"\n' "$root" "$host"
      printf '  [ -r "$HUGINN_SHELL_ROOT/identity.bash" ] && . "$HUGINN_SHELL_ROOT/identity.bash"\n'
    else
      printf 'if [[ -o interactive ]] && [[ -z ${HUGINN_SHELL_MANAGED-} ]]; then\n'
      printf '  export HUGINN_SHELL_ROOT="%s" HUGINN_HOST_LABEL="%s"\n' "$root" "$host"
      printf '  [[ -r "$HUGINN_SHELL_ROOT/identity.zsh" ]] && source "$HUGINN_SHELL_ROOT/identity.zsh"\n'
    fi
    printf 'fi\n%s\n' "$end_marker"
  } >> "$temp"
  chmod 600 "$temp"
  mv -f "$temp" "$startup"
  trap - EXIT HUP INT TERM
  if [ "$replacing_link" -eq 1 ]; then printf 'Replaced approved managed startup symlink with backed-up copy: %s\n' "$startup"; fi
}

if [ "$profile" = bash ]; then
  {
    printf '# Generated by huginn-shell.\n'
    printf 'if [ -r "$HOME/.bashrc" ]; then . "$HOME/.bashrc"; fi\n'
    printf 'if [ -n "${PS1-}" ]; then . "%s/fleet.bash"; fi\n' "$root"
  } | atomic_from_stdin "$root/bashrc"
  if [ -e "$home/.bashrc" ] || [ -L "$home/.bashrc" ]; then backup_file "$home/.bashrc" .bashrc; fi
  if [ -e "$home/.bash_profile" ] || [ -L "$home/.bash_profile" ]; then backup_file "$home/.bash_profile" .bash_profile; fi
else
  for startup in .zshenv .zprofile .zshrc .zlogin .zlogout; do
    if [ -e "$home/$startup" ] || [ -L "$home/$startup" ]; then backup_file "$home/$startup" "$startup"; fi
  done
  {
    if [ -r "$home/.zshenv" ]; then printf 'if [ -r "$HOME/.zshenv" ]; then source "$HOME/.zshenv"; fi\n'; fi
    printf 'ZDOTDIR="%s/zsh"; export ZDOTDIR\n' "$root"
  } | atomic_from_stdin "$root/zsh/.zshenv"
  for startup in .zprofile .zshrc .zlogin .zlogout; do
    {
      if [ "$startup" = .zshrc ]; then printf 'if [[ -o interactive ]] && (( ! $+functions[compdef] )); then autoload -Uz compinit; compinit; fi\n'; fi
      if [ -r "$home/$startup" ]; then printf 'if [ -r "$HOME/%s" ]; then source "$HOME/%s"; fi\n' "$startup" "$startup"; fi
      if [ "$startup" = .zshrc ]; then
        if [ "$profile" = minimal-zsh ]; then entry=minimal.zsh; else entry=fleet.zsh; fi
        printf 'if [[ -o interactive ]]; then source "%s/%s"; fi\n' "$root" "$entry"
      fi
    } | atomic_from_stdin "$root/zsh/$startup"
  done
fi

if [ -f "$home/.bashrc" ] && [ ! -L "$home/.bashrc" ]; then append_identity bash "$home/.bashrc"; fi
if [ -f "$home/.bash_profile" ] && [ ! -L "$home/.bash_profile" ]; then append_identity bash "$home/.bash_profile"; fi
if [ -n "$zsh_path" ]; then
  if [ -f "$home/.zshrc" ] && [ ! -L "$home/.zshrc" ]; then append_identity zsh "$home/.zshrc"
  elif [ -L "$home/.zshrc" ]; then
    append_identity zsh "$home/.zshrc"
  elif [ "$profile" = minimal-zsh ]; then append_identity zsh "$home/.zshrc"; fi
fi

launcher_tmp=$(mktemp "$home/.local/bin/.huginn-shell.XXXXXX")
{
  if [ -x /usr/bin/env ]; then printf '#!/usr/bin/env bash\n'; else printf '#!%s\n' "$bash_path"; fi
  printf 'export HUGINN_SHELL_ROOT="%s" HUGINN_HOST_LABEL="%s" HUGINN_SHELL_MANAGED=1\n' "$root" "$host"
  printf 'PATH="%s/bin:$HOME/.local/bin:$HOME/.nix-profile/bin:$PATH"; export PATH\n' "$root"
  if [ "$profile" = bash ]; then
    printf 'shell=$(command -v bash || printf "%%s" "$HOME/.nix-profile/bin/bash")\n'
    printf 'exec "$shell" --rcfile "%s/bashrc" -i "$@"\n' "$root"
  else
    printf 'shell=$(command -v zsh || printf "%%s" "$HOME/.nix-profile/bin/zsh")\n'
    printf 'export ZDOTDIR="%s/zsh"\n' "$root"
    printf 'exec "$shell" -l "$@"\n'
  fi
} > "$launcher_tmp"
chmod 700 "$launcher_tmp"
mv -f "$launcher_tmp" "$launcher"

if [ -n "$herdr" ]; then
  parent=$(dirname "$herdr")
  ensure_dir "$parent"
  backup_file "$herdr" herdr-config.toml
  herdr_tmp=$(mktemp "$parent/.herdr-config.XXXXXX")
  if [ -L "$herdr" ]; then source_config="$backups/herdr-config.toml"; else source_config=$herdr; fi
  if [ -f "$source_config" ]; then
    awk -v shell="$launcher" '
      BEGIN { in_terminal=0; terminal_seen=0; shell_seen=0 }
      /^\[terminal\][[:space:]]*([#].*)?$/ { in_terminal=1; terminal_seen=1; print; next }
      /^\[[^]]+\]/ { if (in_terminal && !shell_seen) print "default_shell = \"" shell "\""; in_terminal=0 }
      in_terminal && /^[[:space:]]*default_shell[[:space:]]*=/ { print "default_shell = \"" shell "\""; shell_seen=1; next }
      { print }
      END {
        if (in_terminal && !shell_seen) print "default_shell = \"" shell "\""
        if (!terminal_seen) { print ""; print "[terminal]"; print "default_shell = \"" shell "\"" }
      }
    ' "$source_config" > "$herdr_tmp"
  else printf '[terminal]\ndefault_shell = "%s"\n' "$launcher" > "$herdr_tmp"; fi
  chmod 600 "$herdr_tmp"
  mv -f "$herdr_tmp" "$herdr"
fi
printf 'Installed %s shell launcher for %s: %s\n' "$profile" "$host" "$launcher"
