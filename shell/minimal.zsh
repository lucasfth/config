# Dependency-free interactive Zsh profile for constrained devices.
[[ -o interactive ]] || return
[[ -n ${_HUGINN_MINIMAL_ZSH_LOADED:-} ]] && return
typeset -g _HUGINN_MINIMAL_ZSH_LOADED=1

typeset _huginn_label=${HUGINN_HOST_LABEL:-${HOST:-${HOSTNAME:-host}}}
_huginn_label=${_huginn_label//[^a-zA-Z0-9._-]/}
[[ -n $_huginn_label ]] || _huginn_label=host

autoload -Uz compinit edit-command-line add-zsh-hook
if (( ! $+functions[compdef] )); then
  compinit
fi

HISTFILE=${HISTFILE:-$HOME/.zsh_history}
HISTSIZE=10000
SAVEHIST=20000
setopt APPEND_HISTORY SHARE_HISTORY HIST_IGNORE_SPACE HIST_IGNORE_ALL_DUPS HIST_SAVE_NO_DUPS HIST_FIND_NO_DUPS

bindkey -e
source "${HUGINN_SHELL_ROOT:-$HOME/.local/share/huginn-shell}/keybindings.zsh"
bindkey -M emacs '^P' history-beginning-search-backward
bindkey -M emacs '^N' history-beginning-search-forward

# Show Git branches using Zsh's built-in vcs_info when Git is available.
if command -v git >/dev/null 2>&1; then
  autoload -Uz vcs_info
  zstyle ':vcs_info:git:*' formats '%b'
  zstyle ':vcs_info:git:*' actionformats '%b|%a'
fi

# Catppuccin Mocha accents with a built-in, status-aware prompt and right label.
typeset -g _HUGINN_MINIMAL_LABEL=$_huginn_label
_huginn_minimal_prompt() {
  local _huginn_status=$?
  PROMPT='%(?..%F{#f38ba8}!%f )%F{#a6e3a1}➜%f %F{#89b4fa}%~%f'
  if (( $+functions[vcs_info] )); then
    vcs_info
    [[ -z $vcs_info_msg_0_ ]] || PROMPT+=" %F{#cba6f7}git:${vcs_info_msg_0_}%f"
  fi
  PROMPT+='%# '
  RPROMPT="%F{#94e2d5}${_HUGINN_MINIMAL_LABEL}%f"
  return $_huginn_status
}
add-zsh-hook -d precmd _huginn_minimal_prompt 2>/dev/null
add-zsh-hook precmd _huginn_minimal_prompt
