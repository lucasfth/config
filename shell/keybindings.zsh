# Portable shortcuts shared by local Zsh, plain SSH and managed launchers.
[[ -o interactive ]] || return 0

autoload -Uz edit-command-line
zle -N edit-command-line
() {
  local editor=vim map
  command -v vim >/dev/null 2>&1 || editor=vi
  zstyle ':zle:edit-command-line' editor "$editor"
  for map in emacs viins; do
    bindkey -M "$map" '^Xc' edit-command-line
    bindkey -M "$map" '^X^E' edit-command-line
    bindkey -M "$map" '^P' history-search-backward
    bindkey -M "$map" '^N' history-search-forward
    bindkey -M "$map" ' ' magic-space
    bindkey -M "$map" '^L' clear-screen
    bindkey -M "$map" -s '^Xgc' 'git commit -m ""\C-b'
  done
}

clear-screen-and-scrollback() {
  printf '\033[H\033[2J\033[3J' > "${TTY:-/dev/tty}"
  if [[ -n ${TMUX-} ]] && command -v tmux >/dev/null 2>&1; then
    command tmux clear-history
  fi
  zle redisplay
}
zle -N clear-screen-and-scrollback
bindkey -M emacs '^X^L' clear-screen-and-scrollback
bindkey -M viins '^X^L' clear-screen-and-scrollback
