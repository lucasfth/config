# Loaded through ~/.zshrc_local. Edit this file, then run omz reload.

# Reloadable SSH shortcut; host details come from ~/.ssh/config.
alias post-sales='ssh post-sales'

# Open files by suffix without depending on EDITOR or VISUAL.
alias -s vue=code ts=code tsx=code js=code jsx=code nix=code json=code
alias -s py=code sh=code zsh=code go=code rs=code
alias -s yaml=vim yml=vim toml=vim
alias -s md=bat txt=bat log=bat

# Edit the command buffer in Vim; saving returns it without executing.
autoload -Uz edit-command-line
zle -N edit-command-line
zstyle ':zle:edit-command-line' editor vim
bindkey -M emacs '^Xc' edit-command-line
bindkey -M emacs '^X^E' edit-command-line
bindkey -M emacs ' ' magic-space
bindkey -M emacs '^P' history-search-backward
bindkey -M emacs '^N' history-search-forward

autoload -Uz zmv

clear-screen-and-scrollback() {
  printf '\033[H\033[2J\033[3J' > "$TTY"
  if [[ -n ${TMUX-} ]]; then
    command tmux clear-history
  fi
  zle redisplay
}
zle -N clear-screen-and-scrollback
bindkey -M emacs '^X^L' clear-screen-and-scrollback

if command -v pbcopy >/dev/null 2>&1; then
  copy-command-buffer() {
    print -rn -- "$BUFFER" | command pbcopy || return
    zle -M "Copied command to clipboard"
  }
  zle -N copy-command-buffer
  bindkey -M emacs '^X^Y' copy-command-buffer
fi

# Insert a template without executing it; Ctrl+B enters the quotes.
bindkey -M emacs -s '^Xgc' 'git commit -m ""\C-b'
