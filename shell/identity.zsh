# Source after the host's existing interactive startup; never changes its left prompt.
[[ -o interactive ]] || return 0
[[ -z ${HUGINN_SHELL_MANAGED-} && -n ${SSH_CONNECTION-}${SSH_TTY-} ]] || return 0
_huginn_ssh_identity() {
  local previous_status=$?
  local label="%F{#94e2d5}${HUGINN_HOST_LABEL:-${HOST%%.*}}%f"
  if [[ -n ${_HUGINN_IDENTITY_PREVIOUS-} && $RPROMPT == "$_HUGINN_IDENTITY_PREVIOUS" ]]; then
    RPROMPT=$_HUGINN_IDENTITY_BASE
  fi
  # Neo's legacy prompt already supplies exactly this label.
  if [[ $RPROMPT == "$label" ]]; then RPROMPT=''; fi
  typeset -g _HUGINN_IDENTITY_BASE=$RPROMPT
  RPROMPT="${RPROMPT:+$RPROMPT }$label"
  typeset -g _HUGINN_IDENTITY_PREVIOUS=$RPROMPT
  return $previous_status
}
autoload -Uz add-zsh-hook
add-zsh-hook -d precmd _huginn_ssh_identity 2>/dev/null
add-zsh-hook precmd _huginn_ssh_identity
