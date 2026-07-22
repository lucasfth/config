# Mimer dotfiles — Catppuccin Mocha themed shell environment
#
# These are applied via home-manager programs.*.
# Uses lib.mkForce to override the shared nix/common/{vim,tmux}.nix
# configs with Mimer-specific theming and settings.
{ config, pkgs, lib, flakeDir, ... }:

{
  # ── Vim — Catppuccin Mocha + lightline ────────────────────────
  programs.vim = {
    enable = true;
    plugins = with pkgs.vimPlugins; [
      catppuccin-vim
      lightline-vim
    ];
    settings = {
      number = true;
      relativenumber = true;
      tabstop = 2;
      shiftwidth = 2;
      expandtab = true;
      background = "dark";
    };
    extraConfig = lib.mkForce ''
      set so=999
      set termguicolors
      set cursorline
      set showmatch
      set matchtime=2
      set hlsearch
      set incsearch
      set autoindent
      set laststatus=2
      autocmd VimEnter * ++nested colorscheme catppuccin_mocha
      let g:lightline = {
          \ 'colorscheme': 'catppuccin',
          \ 'active': {
          \   'left': [['mode', 'paste'], ['readonly', 'filename', 'modified']],
          \   'right': [['lineinfo'], ['percent'], ['filetype']]
          \ },
          \ 'component': { 'lineinfo': '⧗ %3l:%-2v' },
          \ 'component_function': {
          \   'readonly': 'LightlineReadonly',
          \   'filename': 'LightlineFilename'
          \ }
      \ }
      function! LightlineReadonly()
        return &readonly ? '[RO]' : ""
      endfunction
      function! LightlineFilename()
        return expand('%:t') !=# "" ? expand('%:t') . (&modified ? ' +' : "") : '[No Name]'
      endfunction
      hi LineNr       guifg=#6c7086 guibg=#11111b
      hi CursorLineNr guifg=#f9e2af guibg=#1e1e2e gui=bold
      hi CursorLine   guibg=#181825
      hi StatusLine   guifg=#cdd6f4 guibg=#313244
      hi StatusLineNC guifg=#6c7086 guibg=#181825
      hi Visual       guibg=#45475a guifg=#cdd6f4
      hi Search       guibg=#cba6f7 guifg=#1e1e2e
      hi IncSearch    guibg=#cba6f7 guifg=#1e1e2e
      hi MatchParen   guifg=#f38ba8 guibg=#313244 gui=bold
      hi Pmenu        guibg=#313244 guifg=#cdd6f4
      hi PmenuSel     guibg=#45475a guifg=#f9e2af
      hi Normal       guibg=#1e1e2e guifg=#cdd6f4
      hi VertSplit    guifg=#313244 guibg=NONE
      hi WinSeparator guifg=#313244 guibg=NONE
    '';
  };

  # ── Tmux — Catppuccin Mocha, prefix C-b, vi mode ─────────────
  programs.tmux = {
    enable = true;
    shell = "${pkgs.bash}/bin/bash";
    terminal = "tmux-256color";
    historyLimit = 50000;
    keyMode = "vi";
    mouse = true;
    prefix = "C-b";

    plugins = with pkgs.tmuxPlugins; [
      sensible
      yank
      cpu
      battery
    ];

    extraConfig = lib.mkForce ''
      # ── Pane splitting ──────────────────────────────────────
      bind | split-window -h -c "#{pane_current_path}"
      bind - split-window -v -c "#{pane_current_path}"
      bind z resize-pane -Z

      # ── Copy mode (vi) ──────────────────────────────────────
      bind-key -T copy-mode-vi 'v' send -X begin-selection
      bind-key -T copy-mode-vi C-v send -X rectangle-toggle
      bind-key -T copy-mode-vi 'y' send -X copy-selection-and-cancel

      # ── Reload config ───────────────────────────────────────
      bind r source-file ~/.tmux.conf \; display "reloaded"

      # ── Terminal overrides ──────────────────────────────────
      set -ga terminal-overrides ",xterm-256color:Tc"
      set -g status-interval 5
      set -g base-index 1
      setw -g pane-base-index 1
      set -g renumber-windows on

      # ── Catppuccin Mocha theme ──────────────────────────────
      # Pane borders
      set -g pane-border-style        "fg=#313244"
      set -g pane-active-border-style "fg=#74c7ec"

      # Messages
      set -g message-style         "bg=#313244,fg=#cdd6f4"
      set -g message-command-style "bg=#313244,fg=#cba6f7"
      set -g mode-style            "bg=#45475a,fg=#cdd6f4"

      # Status bar
      set -g status-style    "bg=default,fg=#cdd6f4"
      set -g status-position top

      set -g status-left-length 60
      set -g status-left "\
      #[fg=#cba6f7,bg=default]\ue0b6\
      #[fg=#1e1e2e,bg=#cba6f7,bold]\ue20a\
      #[fg=#cba6f7,bg=default]\ue0b4 \
      #[fg=#74c7ec,bg=default]\ue0b6\
      #[fg=#1e1e2e,bg=#74c7ec,bold]\uf64f #S\
      #[fg=#74c7ec,bg=default]\ue0b4 "

      set -g status-right-length 160
      set -g status-right "\
      #[fg=#74c7ec,bg=default]\ue0b6\
      #[fg=#1e1e2e,bg=#74c7ec]\uf007 #(whoami)  \uf109 #H\
      #[fg=#74c7ec,bg=default]\ue0b4 \
      #[fg=#f9e2af,bg=default]\ue0b6\
      #[fg=#1e1e2e,bg=#f9e2af]\uf4bc #{cpu_percentage}\
      #[fg=#f9e2af,bg=default]\ue0b4 \
      #[fg=#cba6f7,bg=default]\ue0b6\
      #[fg=#1e1e2e,bg=#cba6f7]\uf85a #{ram_percentage}\
      #[fg=#cba6f7,bg=default]\ue0b4 \
      #[fg=#fab387,bg=default]\ue0b6\
      #[fg=#1e1e2e,bg=#fab387]#{battery_icon} #{battery_percentage}\
      #[fg=#fab387,bg=default]\ue0b4 \
      #[fg=#a6e3a1,bg=default]\ue0b6\
      #[fg=#1e1e2e,bg=#a6e3a1]\uf073 %Y-%m-%d  \uf017 %H:%M\
      #[fg=#a6e3a1,bg=default]\ue0b4"

      # Window status
      set -g window-status-format         "#[fg=#6c7086,bg=default] #I:#W "
      set -g window-status-current-format "#[fg=#f9e2af,bg=default]\ue0b6#[fg=#1e1e2e,bg=#f9e2af,bold]#I:#W#[fg=#f9e2af,bg=default]\ue0b4"
      set -g window-status-separator      ""
    '';
  };

  # ── Bash — Catppuccin-themed prompt with git helpers ─────────
  programs.bash = {
    enable = true;

    bashrcExtra = lib.mkForce ''
      # ── Catppuccin Mocha prompt ────────────────────────────
      # mauve user@host : blue path (teal git branch)
      parse_git_branch() {
        git branch 2> /dev/null | sed -e '/^[^*]/d' -e 's/* \(.*\)/ (\1)/'
      }

      PS1='\[\033[38;2;203;166;247m\]\u@\h\[\033[0m\]:\[\033[38;2;137;180;250m\]\w\[\033[38;2;148;226;213m\]$(parse_git_branch)\[\033[0m\]\$ '

      # ── PATH additions ──────────────────────────────────────
      export PATH="$HOME/.local/bin:$HOME/.cargo/bin:$PATH"

      # ── Aliases ─────────────────────────────────────────────
      alias ll='ls -lah'
      alias la='ls -A'
      alias l='ls -CF'
      alias gs='git status'
      alias gc='git commit'
      alias gp='git push'
      alias gl='git log --oneline --graph --all'
      alias gco='git checkout'

      # ── History ─────────────────────────────────────────────
      export HISTSIZE=50000
      export HISTFILESIZE=50000
      export HISTCONTROL=ignoreboth:erasedups
      shopt -s histappend
    '';
  };

  # ── Mimer-specific dotfiles ─────────────────────────────────
  home.file = {
    ".config/starship.toml".source = "${flakeDir.outPath}/starship.toml";
    ".config/lazygit/config.yml".source = "${flakeDir.outPath}/lazygit/config.yml";
  };
}
