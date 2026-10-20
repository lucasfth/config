# Shared additive interactive Bash profile for the managed remote-shell launcher.
[[ $- == *i* ]] || return
[[ -n ${_HUGINN_FLEET_BASH_LOADED:-} ]] && return
_HUGINN_FLEET_BASH_LOADED=1

_huginn_fleet_label=${HUGINN_HOST_LABEL:-${HOSTNAME:-${HOST:-host}}}
_huginn_fleet_label=${_huginn_fleet_label//[^a-zA-Z0-9._-]/}
[[ -n $_huginn_fleet_label ]] || _huginn_fleet_label=host

# Familiar portable aliases and Git shortcuts.
alias ll='ls -alFh' la='ls -A' l='ls -CF' ..='cd ..' ...='cd ../..'
alias g='git' gst='git status' gco='git checkout' gbr='git branch'
alias gcm='git commit -m' gd='git diff' gds='git diff --staged'
alias gaa='git add -A' gl='git pull' gup='git pull --rebase'
alias gp='git push' glog='git log --oneline --graph --decorate --all'

# Append history across sessions and retain the Mac's ignore/dedupe behavior.
shopt -s histappend checkwinsize
HISTSIZE=10000
HISTFILESIZE=20000
HISTCONTROL=ignoreboth:erasedups

export EDITOR=vim VISUAL=vim
command -v vim >/dev/null 2>&1 || { export EDITOR=vi VISUAL=vi; }
bind 'set completion-ignore-case on'
bind 'set show-all-if-ambiguous on'
bind '"\C-x\C-e": edit-and-execute-command'
source "${HUGINN_SHELL_ROOT:-$HOME/.local/share/huginn-shell}/keybindings.bash"

# fzf's bundled Bash widget supplies Ctrl+R when available. Older packaged
# fzf releases without `--bash` can use the standard key-bindings script.
if command -v fzf >/dev/null 2>&1 && [[ -z ${_HUGINN_FLEET_FZF_BASH_LOADED:-} ]]; then
  if _huginn_fzf_bash=$(command fzf --bash 2>/dev/null) && [[ -n $_huginn_fzf_bash ]]; then
    eval "$_huginn_fzf_bash"
    _HUGINN_FLEET_FZF_BASH_LOADED=1
  elif [[ -r ${HUGINN_SHELL_ROOT:-$HOME/.local/share/huginn-shell}/plugins/fzf/key-bindings.bash ]]; then
    source "${HUGINN_SHELL_ROOT:-$HOME/.local/share/huginn-shell}/plugins/fzf/key-bindings.bash"
    _HUGINN_FLEET_FZF_BASH_LOADED=1
  fi
fi

_huginn_fleet_prompt_label() {
  local status=$? label=${_huginn_fleet_label} width=${COLUMNS:-80} column
  column=$((width - ${#label} + 1))
  if (( column > 0 )); then
    # Print before PS1 without modifying it: existing prompt/error hooks remain intact.
    printf '\033[s\033[%dG\033[38;2;148;226;213m%s\033[0m\033[u' "$column" "$label"
  fi
  return "$status"
}

# Preserve either Bash 5's callback array or the legacy command string used by
# macOS Bash 3.2 and VPS1's existing __prompt hook.
if [[ $(declare -p PROMPT_COMMAND 2>/dev/null) == 'declare -a '* ]]; then
  _huginn_fleet_label_present=
  for _huginn_prompt_hook in "${PROMPT_COMMAND[@]}"; do
    [[ $_huginn_prompt_hook != _huginn_fleet_prompt_label ]] || _huginn_fleet_label_present=1
  done
  [[ -n $_huginn_fleet_label_present ]] || PROMPT_COMMAND+=( _huginn_fleet_prompt_label )
  unset _huginn_prompt_hook _huginn_fleet_label_present
else
  if [[ ";${PROMPT_COMMAND-};" != *';_huginn_fleet_prompt_label;'* ]]; then
    PROMPT_COMMAND="${PROMPT_COMMAND:+${PROMPT_COMMAND}; }_huginn_fleet_prompt_label"
  fi
fi
