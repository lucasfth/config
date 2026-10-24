{
  config,
  pkgs,
  lib,
  hostname,
  ...
}: {
  programs.vim = {
    enable = true;
    # The headless host needs terminal Vim, not the GTK GUI variant.
    packageConfigurable = lib.mkIf (hostname == "gimle") pkgs.vim;
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
    extraConfig = ''
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
}
