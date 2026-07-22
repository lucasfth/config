{ config, pkgs, lib, flakeDir, username, hostname, homeDirectory, stateVersion, ... }:
{
  imports = [
    # ── Common shared modules (from nix/common/) ─────────────
    ../../common/packages
    ../../common/git.nix
    ../../common/tmux.nix
    ../../common/vim.nix
  ];

  # ──────────────────────────────────────────────────────────
  # Home basics
  # ──────────────────────────────────────────────────────────
  home = {
    username = lib.mkForce username;
    homeDirectory = lib.mkForce homeDirectory;
    stateVersion = lib.mkForce stateVersion;
  };

  programs.home-manager.enable = true;

  # ──────────────────────────────────────────────────────────
  # Extra packages for Mimer (dev tools, monitoring, etc.)
  # ──────────────────────────────────────────────────────────
  home.packages = with pkgs; [
    # Dev essentials
    cmake
    gcc
    gnumake
    python3

    # Monitoring
    htop
    btop
    wget

    # Editors / file tools
    neovim
    eza

    # GPU monitoring
    nvitop
  ];

  # ──────────────────────────────────────────────────────────
  # Bash — Catppuccin Mocha themed, git-aware
  # ──────────────────────────────────────────────────────────
  programs.bash = {
    enable = true;

    initExtra = ''
      # ── Catppuccin Mocha bash prompt ────────────────────────
      # user=lavender, host=mauve, cwd=blue, prompt=lavender
      PS1='\[\e[38;2;180;190;254m\]\u\[\e[0m\]@\[\e[38;2;203;166;247m\]\h\[\e[0m\] \[\e[38;2;137;180;250m\]\w\[\e[0m\]\$ '

      # ── Git-aware prompt ────────────────────────────────────
      # Shows current branch: green = clean, yellow = dirty
      __git_ps1() {
        local branch
        branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null) || return
        if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
          printf " \[\e[38;2;249;226;175m\](%s *)" "$branch"
        else
          printf " \[\e[38;2;166;227;161m\](%s)" "$branch"
        fi
        printf "\[\e[0m\]"
      }

      # ── Aliases ─────────────────────────────────────────────
      alias ll="eza -la --icons --group-directories-first"
      alias la="eza -a --icons --group-directories-first"
      alias l="eza -l --icons --group-directories-first"
      alias ..="cd .."
      alias ...="cd ../.."
      alias grep="grep --color=auto"
      alias diff="diff --color=auto"
      alias df="df -h"
      alias du="du -h"
      alias free="free -h"

      # ── PATH additions ──────────────────────────────────────
      export PATH="$HOME/.local/bin:$PATH"
      if [ -d "/usr/local/cuda/bin" ]; then
        export PATH="/usr/local/cuda/bin:$PATH"
      fi

      # ── direnv ──────────────────────────────────────────────
      if command -v direnv >/dev/null 2>&1; then
        eval "$(direnv hook bash)"
      fi

      # ── fzf ─────────────────────────────────────────────────
      if command -v fzf >/dev/null 2>&1; then
        eval "$(fzf --bash)"
      fi

      # ── Starship prompt (optional, override PS1) ────────────
      if command -v starship >/dev/null 2>&1; then
        eval "$(starship init bash)"
      fi
    '';

    # Sensible shell options
    shellOptions = [
      "histappend"
      "checkwinsize"
      "globstar"
    ];

    historySize = 10000;
    historyFileSize = 50000;
    historyControl = [ "ignoredups" "ignorespace" ];
  };

  # ──────────────────────────────────────────────────────────
  # Git — global config (no GPG signing on server)
  # ──────────────────────────────────────────────────────────
  programs.git = {
    enable = true;
    settings = {
      init.defaultBranch = "main";
      pull.rebase = true;
      user = {
        name = lib.mkForce "ecoray-admin";
        email = lib.mkForce "admin@ecoray.dk";
      };
    };
  };

  # Désactiver GPG signing (pas de clés sur un serveur)
  programs.gpg.enable = lib.mkForce false;
  services.gpg-agent.enable = lib.mkForce false;

  # ──────────────────────────────────────────────────────────
  # GPU Pipeline Worker — systemd user service (port 9880)
  #
  # Python FastAPI wrapper that sits in front of llama-server
  # with request queuing, health checks, and optional prompt
  # caching. Runs independently of llama-server.
  # ──────────────────────────────────────────────────────────
  systemd.user.services.gpu-pipeline-worker = {
    Unit = {
      Description = "GPU Pipeline Worker — FastAPI wrapper for llama-server (:9880)";
      After = [ "network.target" ];
    };
    Service = {
      Type = "simple";
      ExecStart = "${pkgs.python3}/bin/python3 ${config.home.homeDirectory}/klaus-services/gpu_pipeline_worker.py";
      WorkingDirectory = "${config.home.homeDirectory}/klaus-services";
      Restart = "on-failure";
      RestartSec = 10;
      Environment = [
        "PYTHONUNBUFFERED=1"
        "LLAMA_SERVER_URL=http://127.0.0.1:8080"
      ];
    };
    Install.WantedBy = [ "default.target" ];
  };

  # ──────────────────────────────────────────────────────────
  # llama-server — MANUAL ONLY (documented, not managed)
  #
  # llama.cpp is a custom build (not Nix-packaged). The
  # Qwen3.5-122B model is ~72 GB and requires careful CUDA
  # build flags for optimal RTX PRO 6000 performance.
  #
  # Reference command (run manually or via tmux):
  #
  #   /home/ecoray-admin/llama.cpp/build/bin/llama-server \
  #     -m /home/ecoray-admin/models/Qwen3.5-122B-Q4_K_M.gguf \
  #     --host 0.0.0.0 --port 8080 \
  #     -ngl 99 \
  #     -c 32768 \
  #     --gpu-layers 99 \
  #     --flash-attn \
  #     --metrics \
  #     --slots \
  #     --parallel 4
  #
  # Start the full inference stack:
  #
  #   # Start llama-server in background tmux session
  #   tmux new-session -d -s llama \
  #     "/home/ecoray-admin/llama.cpp/build/bin/llama-server \
  #       -m /home/ecoray-admin/models/Qwen3.5-122B-Q4_K_M.gguf \
  #       --host 0.0.0.0 --port 8080 -ngl 99 -c 32768 \
  #       --flash-attn --metrics --parallel 4 \
  #       2>&1 | tee /home/ecoray-admin/logs/llama-server.log"
  #
  #   # Start pipeline worker
  #   systemctl --user start gpu-pipeline-worker
  #
  # Check health:
  #   curl -s http://localhost:8080/health   # llama-server
  #   curl -s http://localhost:9880/health   # pipeline worker
  #
  # Tailscale IP: 100.90.96.28
  # ──────────────────────────────────────────────────────────

  # Ensure services directory exists
  home.file."klaus-services/.keep".text = ''
    # GPU inference services directory
    # Place gpu_pipeline_worker.py here
  '';

  # ──────────────────────────────────────────────────────────
  # Starship prompt (Catppuccin Mocha)
  # ──────────────────────────────────────────────────────────
  programs.starship = {
    enable = true;
    settings = {
      palette = "catppuccin_mocha";
    };
  };

  # Symlink repo's starship.toml if present
  home.file.".config/starship.toml".source = lib.mkIf (builtins.pathExists "${flakeDir.outPath}/starship.toml") (
    config.lib.file.mkOutOfStoreSymlink "${flakeDir.outPath}/starship.toml"
  );
}
