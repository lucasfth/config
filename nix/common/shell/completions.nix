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

    # ── Opencode completions ─────────────────────────────────
    ###-begin-opencode-completions-###
    _opencode_yargs_completions()
    {
      local reply
      local si=$IFS
      IFS=$'\n' reply=($(COMP_CWORD="$((CURRENT-1))" COMP_LINE="$BUFFER" COMP_POINT="$CURSOR" opencode --get-yargs-completions "''${words[@]}"))
      IFS=$si
      if [[ ''${#reply} -gt 0 ]]; then
        _describe 'values' reply
      else
        _default
      fi
    }
    if [[ "''${zsh_eval_context[-1]}" == "loadautofunc" ]]; then
      _opencode_yargs_completions "$@"
    else
      compdef _opencode_yargs_completions opencode
    fi
    ###-end-opencode-completions-###
  '';
}
