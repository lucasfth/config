# Source after the host's existing interactive startup; never changes its left prompt.
[[ -o interactive ]] || return 0
[[ -z ${HUGINN_SHELL_MANAGED-} && -n ${SSH_CONNECTION-}${SSH_TTY-} ]] || return 0
if [[ -r ${HUGINN_SHELL_ROOT:-$HOME/.local/share/huginn-shell}/keybindings.zsh ]]; then
  source "${HUGINN_SHELL_ROOT:-$HOME/.local/share/huginn-shell}/keybindings.zsh"
fi
[[ ! -r ${HUGINN_SHELL_ROOT:-$HOME/.local/share/huginn-shell}/current.sh ]] || source "${HUGINN_SHELL_ROOT:-$HOME/.local/share/huginn-shell}/current.sh"
_huginn_ssh_identity() {
  local previous_status=$?
  local label="%F{#94e2d5}${HUGINN_HOST_LABEL:-${HOST%%.*}}%f"
  if [[ -n ${_HUGINN_IDENTITY_PREVIOUS-} && $RPROMPT == "$_HUGINN_IDENTITY_PREVIOUS" ]]; then
    RPROMPT=$_HUGINN_IDENTITY_BASE
  fi
  # Starship owns its hostname; retain host labels embedded in other prompts.
  if [[ $RPROMPT == *starship* || $RPROMPT == *"${HUGINN_HOST_LABEL:-${HOST%%.*}}"* ]]; then
    return $previous_status
  fi
  typeset -g _HUGINN_IDENTITY_BASE=$RPROMPT
  RPROMPT="${RPROMPT:+$RPROMPT }$label"
  typeset -g _HUGINN_IDENTITY_PREVIOUS=$RPROMPT
  return $previous_status
}
autoload -Uz add-zsh-hook
add-zsh-hook -d precmd _huginn_ssh_identity 2>/dev/null
add-zsh-hook precmd _huginn_ssh_identity
