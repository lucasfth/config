{
  config,
  pkgs,
  lib,
}: {
  content = ''

    # ── SSH: use ASCII-only configs (mobile clients lack Nerd Fonts) ─
    if [[ -n ''${SSH_CONNECTION-} || -n ''${SSH_TTY-} ]]; then
      export STARSHIP_CONFIG="$HOME/config/configs/starship/starship-ssh.toml"
      alias tmux='tmux -f ~/config/configs/tmux/tmux-ssh.conf'
    fi

    # ── direnv (per-project env auto-loading) ──────────────────
    if command -v direnv >/dev/null 2>&1; then
      eval "$(direnv hook zsh)"
    fi

    # ── zoxide (smarter cd, replaces z plugin) ────────────────
    if command -v zoxide >/dev/null 2>&1; then
      eval "$(zoxide init zsh)"
    fi

    # ── fzf history search (Ctrl+R) ─────────────────────────────
    # Guard: fzf 0.73 key-bindings.zsh has an "always" block that tries to
    # restore the "zle" option even when non-interactive, producing:
    #   (eval):1: can't change option: zle
    # Zed/JetBrains spawn "zsh -ic" to read env, triggering this.
    if [[ -o interactive ]] && [[ -t 0 ]]; then
      if command -v fzf >/dev/null 2>&1; then
        source "$(fzf-share)/key-bindings.zsh"
      fi
    fi

    # ── Alias-tips plugin (vendored in ~/.zsh/) ────────────
    if [ -f "$HOME/.zsh/alias-tips/alias-tips.plugin.zsh" ]; then
      source "$HOME/.zsh/alias-tips/alias-tips.plugin.zsh"
    fi

    # ── Secrets (gitignored, kept on disk) ───────────────────
    if [ -f "$HOME/config/nix_secrets" ]; then
      source "$HOME/config/nix_secrets"
    fi

    # ── Comma: auto-run missing commands via nix (e.g. ffmpeg → , ffmpeg) ──
    if command -v comma >/dev/null 2>&1; then
      source <(comma --zsh 2>/dev/null)
    fi


    # ── Mokka wallpaper reload (flag-based, only after nrs) ───
    if [ -f "$HOME/.mokka-reload" ]; then
      LATEST=$(ls -t "$HOME/Pictures/wallpapers/mokka-"*.heic 2>/dev/null | head -1)
      if [ -n "$LATEST" ] &&
        osascript -e "tell application \"System Events\" to set picture of every desktop to \"$LATEST\"" 2>/dev/null; then
        rm -f "$HOME/.mokka-reload"
      fi
    fi

    alias nix-search="nix search nixpkgs"
    nix-which() { local p; p="$(which "$1")"; case "$p" in */nix/store/*|*/.nix-profile/*|*/run/current-system/*) echo "$p  ← Nix" ;; /opt/homebrew/*) echo "$p  ← Brew" ;; *) echo "$p" ;; esac; }
    nix-diff() { nix profile diff-closures --profile /nix/var/nix/profiles/system --profile "/nix/var/nix/profiles/system-$1-link"; }

  '';
}
