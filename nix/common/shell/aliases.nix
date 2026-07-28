{ config, pkgs, lib }:

{
  content = ''

    # ── SSH aliases ───────────────────────────────────────────
    # Host resolution (user + IP + port) is handled by ~/.ssh/config,
    # generated from env vars in ~/config/nix_secrets by nix/common/ssh.nix.
    alias ssh-termux='ssh termux'
    alias ssh-windows='ssh windows'
    alias se1='ssh se1'
    alias se2='ssh se2'
    alias se3='ssh se3'
    alias mimer='ssh mimer'
    alias freyr='ssh freyr'
    alias sem='ssh sem'
    alias sep='ssh sep'
    alias se1lv='ssh -t se1 "cd .openclaw/workspace-louise && exec \$SHELL --login"'
    alias semd='ssh -t sem "cd lucasfth/ecoray-web && git checkout development && git pull && exec \$SHELL --login"'

    # ── General aliases ──────────────────────────────────────
    alias lg="lazygit"
    alias gup="git pull --rebase"

    # ── Batch HEIC → TIFF conversion (macOS only — uses sips) ──
    if command -v sips >/dev/null 2>&1; then
    heic2tiff() {
      if [ $# -eq 0 ]; then
        echo "Usage: heic2tiff <file.heic> [file2.HEIC ...]"
        return 1
      fi
      local in out
      for in in "$@"; do
        out="''${in%.*}.tiff"
        echo "→ ''${out}"
        sips -s format tiff "$in" --out "$out"
      done
      echo "Done."
    }
    fi

    # ── OMP wrapper (auto-saves session to vault after exit) ──
    omp() {
      command omp "$@"; local rc=$?
      case "$rc:$1" in
        0:|0:--resume|0:--continue) ~/.omp/agent/hooks/post/save-to-vault.sh "$(pwd)" 2>/dev/null ;;
      esac
      return $rc
    }

    # ── Local binary aliases (not Nix-packaged) ──────────────
    if [ -x "$HOME/Desktop/code/yt-dlp/yt-dlp" ]; then
      alias yt-dlp="$HOME/Desktop/code/yt-dlp/yt-dlp -x --audio-format mp3 --audio-quality 0 --embed-thumbnail --add-metadata --no-abort-on-error -o './playlist/%(playlist_index)s - %(title)s.%(ext)s'"
    fi
    if [ -x "$HOME/Desktop/code/repolicense-cli/zig-out/bin/repolicense" ]; then
      alias repolicense="$HOME/Desktop/code/repolicense-cli/zig-out/bin/repolicense"
    fi
    alias gtop='~/klaus-services/gtop'
  '';
}
