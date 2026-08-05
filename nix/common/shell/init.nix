{
  config,
  pkgs,
  lib,
}: {
  content = ''

    # ── SSH: use ASCII-only configs (mobile clients lack Nerd Fonts) ─
    if [[ -n ''${SSH_CONNECTION-} || -n ''${SSH_TTY-} ]]; then
      export STARSHIP_CONFIG="$HOME/config/starship-ssh.toml"
      alias tmux='tmux -f ~/config/.tmux-ssh.conf'
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

    # ── Local overrides (for quick experiments, no rebuild needed) ──
    if [ -f "$HOME/.zshrc_local" ]; then
      source "$HOME/.zshrc_local"
    fi
    # ── Comma: auto-run missing commands via nix (e.g. ffmpeg → , ffmpeg) ──
    if command -v comma >/dev/null 2>&1; then
      source <(comma --zsh 2>/dev/null)
    fi


    # ── Mokka wallpaper reload (flag-based, only after nrs) ───
    if [ -f "$HOME/.mokka-reload" ]; then
      LATEST=$(ls -t "$HOME/Pictures/wallpapers/mokka-"*.heic 2>/dev/null | head -1)
      if [ -n "$LATEST" ]; then
        osascript -e "tell application \"Finder\" to set desktop picture to POSIX file \"$LATEST\"" 2>/dev/null
      fi
      rm -f "$HOME/.mokka-reload"
    fi

    # ── Shortcuts ──────────────────────────────────────────────
    if command -v darwin-rebuild >/dev/null 2>&1; then
      rebuild() { sudo darwin-rebuild switch --flake ~/config#"$(hostname)" && launchctl kickstart -k gui/$(id -u)/org.nixos.sketchybar 2>/dev/null; exec zsh; }
      nix-clean() {
        echo "→ User GC..."
        nix-collect-garbage -d
        echo "→ System GC..."
        sudo nix-collect-garbage -d
        echo "✓ Done. Old generations removed."
      }
    else
      rebuild() { sudo nixos-rebuild switch --flake ~/config#"$(hostname)" && exec zsh; }
      nix-clean() {
        echo "→ User GC..."
        nix-collect-garbage -d
        echo "→ System GC..."
        sudo nix-collect-garbage -d
        echo "✓ Done. Old generations removed."
      }
    fi
    alias nrs="rebuild"
    alias nix-search="nix search nixpkgs"
    nix-which() { local p; p="$(which "$1")"; case "$p" in */nix/store/*|*/.nix-profile/*|*/run/current-system/*) echo "$p  ← Nix" ;; /opt/homebrew/*) echo "$p  ← Brew" ;; *) echo "$p" ;; esac; }
    if command -v darwin-rebuild >/dev/null 2>&1; then
      nix-update() { nix flake update --flake ~/config && sudo darwin-rebuild switch --flake ~/config#"$(hostname)" && exec zsh; }
      nix-rollback() { sudo darwin-rebuild --list-generations --flake ~/config; echo "Pick: sudo darwin-rebuild --switch-generation <N> --flake ~/config"; }
    else
      nix-update() { nix flake update --flake ~/config && sudo nixos-rebuild switch --flake ~/config#"$(hostname)" && exec zsh; }
      nix-rollback() { sudo nixos-rebuild --list-generations --flake ~/config; echo "Pick: sudo nixos-rebuild --switch-generation <N> --flake ~/config"; }
    fi
    nix-diff() { nix profile diff-closures --profile /nix/var/nix/profiles/system --profile "/nix/var/nix/profiles/system-$1-link"; }
  '';
}
