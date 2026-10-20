# Readline equivalent for hosts whose account shell remains Bash.
[[ $- == *i* ]] || return 0

huginn_clear_scrollback() {
  printf '\033[H\033[2J\033[3J' > /dev/tty
  if [[ -n ${TMUX-} ]] && command -v tmux >/dev/null 2>&1; then
    command tmux clear-history
  fi
  # Readline redraws the unchanged READLINE_LINE/READLINE_POINT after bind -x.
}
bind -m emacs-standard -x '"\C-x\C-l":huginn_clear_scrollback'
bind -m vi-insert -x '"\C-x\C-l":huginn_clear_scrollback'
