{
  config,
  pkgs,
  lib,
  ...
}: let
  initContent = (import ./init.nix {inherit config pkgs lib;}).content;
  aliasesContent = (import ./aliases.nix {inherit config pkgs lib;}).content;
  pathsContent = (import ./paths.nix {inherit config pkgs lib;}).content;
  completionsContent = (import ./completions.nix {inherit config pkgs lib;}).content;
  envContent = (import ./env.nix {inherit config pkgs lib;}).content;
in {
  imports = [./starship.nix];

  home.file.".zshrc_local".source =
    config.lib.file.mkOutOfStoreSymlink
    "${config.home.homeDirectory}/config/nix/common/shell/interactive.zsh";

  programs.zsh = {
    enable = true;
    syntaxHighlighting.enable = true;

    history = {
      append = true;
      share = true;
      ignoreSpace = true;
      ignoreAllDups = true;
      saveNoDups = true;
      findNoDups = true;
    };

    dirHashes = {
      config = "${config.home.homeDirectory}/config";
      code = "${config.home.homeDirectory}/Desktop/code";
      downloads = "${config.home.homeDirectory}/Downloads";
    };

    oh-my-zsh = {
      enable = true;
      plugins = ["git"];
    };

    initContent = lib.mkMerge [
      # Oh My Zsh runs compinit at order 800. fzf-tab must follow it and
      # precede autosuggestions; Home Manager loads autosuggestions at 700.
      (lib.mkOrder 900 ''
        source ${pkgs.zsh-fzf-tab}/share/fzf-tab/fzf-tab.plugin.zsh
        source ${pkgs.zsh-autosuggestions}/share/zsh-autosuggestions/zsh-autosuggestions.zsh
      '')
      (lib.mkOrder 1000 (lib.concatStrings [
        initContent
        pathsContent
        aliasesContent
        completionsContent
        envContent
      ]))
    ];
  };
}
