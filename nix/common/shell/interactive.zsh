# Loaded through ~/.zshrc_local. Edit this file, then run omz reload.

# Select the tracked config explicitly; macOS otherwise uses Application Support.
alias lg='lazygit --use-config-file "$HOME/config/configs/lazygit/config.yml"'

# Select by OS, not whether darwin-rebuild happens to be on PATH.
# Resolve the managed macOS executable at invocation time, including sudo calls.
_config-rebuild() {
  if [[ $OSTYPE == darwin* ]]; then
    sudo /nix/var/nix/profiles/system/sw/bin/darwin-rebuild "$@"
  else
    sudo nixos-rebuild "$@"
  fi
}

rebuild() {
  _config-rebuild switch --flake "$HOME/config#$(hostname)" && exec zsh
}
alias nrs=rebuild

nix-clean() {
  echo "→ User GC..."
  nix-collect-garbage -d
  echo "→ System GC..."
  sudo nix-collect-garbage -d
  echo "✓ Done. Old generations removed."
}

nix-update() {
  nix flake update --flake "$HOME/config" && rebuild
}

nix-rollback() {
  _config-rebuild --list-generations --flake "$HOME/config" || return
  if [[ $OSTYPE == darwin* ]]; then
    echo "Pick: sudo /nix/var/nix/profiles/system/sw/bin/darwin-rebuild --switch-generation <N> --flake ~/config"
  else
    echo "Pick: sudo nixos-rebuild --switch-generation <N> --flake ~/config"
  fi
}

# SSH hosts are generated from nix_secrets by nix/common/ssh.nix.
# Clear retired names when reloading an existing shell.
unalias post-sales se1 se2 sem se1lv semd se3 vps1lv 2>/dev/null || true
alias loki='ssh loki' sigyn='ssh sigyn' ssh-windows='ssh windows'
alias vps1='ssh vps1' vps2='ssh vps2'
alias mimer='ssh mimer' freyr='ssh freyr' mini='ssh mini' neo='ssh neo'
alias ecoray3d='ssh ecoray3d' sep='ssh sep' plato='ssh plato'
alias minid='ssh -t mini "cd lucasfth/ecoray-web && git checkout development && git pull && exec \$SHELL --login"'

# Open files by suffix without depending on EDITOR or VISUAL.
alias -s vue=code ts=code tsx=code js=code jsx=code nix=code json=code
alias -s py=code sh=code zsh=code go=code rs=code
alias -s yaml=vim yml=vim toml=vim
alias -s md=bat txt=bat log=bat

# pbcopy reads stdin, not a filename argument.
copy-public-key() {
  pbcopy < "$1"
}
alias -s pub=copy-public-key

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
