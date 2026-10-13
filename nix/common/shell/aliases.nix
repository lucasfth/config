{
  config,
  pkgs,
  lib,
}: {
  content = ''


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
