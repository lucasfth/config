{
  config,
  pkgs,
  lib,
}: {
  content = ''

    # ── Fuzzy completion menu and directory previews ─────────
    zstyle ':completion:*' matcher-list \
      'm:{[:lower:][:upper:]}={[:upper:][:lower:]}' 'r:|=*' 'l:|=* r:|=*'
    zstyle ':completion:*' list-colors ''${(s.:.)LS_COLORS}
    zstyle ':completion:*:descriptions' format '[%d]'
    # Override Oh My Zsh's more-specific "menu select" style.
    zstyle ':completion:*:*:*:*:*' menu no
    zstyle ':fzf-tab:complete:cd:*' fzf-preview 'ls -A -p -- "$realpath"'
    zstyle ':fzf-tab:complete:__zoxide_z:*' fzf-preview 'ls -A -p -- "$realpath"'

    # ── Mole shell completion ────────────────────────────────
    if [ -r "$HOME/.cache/zsh/mole-completion.zsh" ]; then
      source "$HOME/.cache/zsh/mole-completion.zsh"
    fi
  '';
}
