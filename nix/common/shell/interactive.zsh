# Loaded through ~/.zshrc_local. Edit this file, then run omz reload.

# Read the prompt source on reload instead of the previous Nix-store snapshot.
# Keep the ASCII/host-label prompt for SSH and preserve explicit custom configs.
if [[ -z ${SSH_CONNECTION-} && -z ${SSH_TTY-} &&
      ( -z ${STARSHIP_CONFIG-} || $STARSHIP_CONFIG == "$HOME/.config/starship.toml" ) ]]; then
  export STARSHIP_CONFIG="$HOME/config/configs/starship/starship.toml"
fi

# Nix and remote shells consume the same command definitions.
source "${HUGINN_SHELL_ROOT:-${${(%):-%x}:A:h:h:h:h}/shell}/commands.sh"

# Preserve Pi's CLI completion when its completion function is already loaded.
if (( $+functions[compdef] && $+functions[_pi] )); then
  compdef _pi pi pi-native
fi

# Keep the local sidebar patch independent of Homebrew upgrades. A function also
# keeps the command recognizable to zsh-syntax-highlighting (see Pi above).
if [[ $OSTYPE == darwin* ]]; then
  unalias herdr 2>/dev/null || true
  function herdr {
    local patched="$HOME/.local/libexec/herdr-patched"
    if [[ -x $patched ]]; then
      "$patched" "$@"
    else
      command herdr "$@"
    fi
  }
fi

# Managed Herdr automatic tab titles. The upstream hook deduplicates on reload.
if [[ -n ${HERDR_PANE_ID:-} && -r ${XDG_CONFIG_HOME:-$HOME/.config}/herdr/plugins/herdr-automatic-rename/shell/hook.zsh ]]; then
  source "${XDG_CONFIG_HOME:-$HOME/.config}/herdr/plugins/herdr-automatic-rename/shell/hook.zsh"
fi

# Select by OS, not whether darwin-rebuild happens to be on PATH.
# Resolve the managed macOS executable at invocation time, including sudo calls.
if [[ -z ${HUGINN_SHELL_ROOT-} || -f $HOME/config/flake.nix ]]; then
_config-rebuild() {
  if [[ $OSTYPE == darwin* ]]; then
    sudo /nix/var/nix/profiles/system/sw/bin/darwin-rebuild "$@"
  else
    sudo nixos-rebuild "$@"
  fi
}

rebuild() {
  _config-rebuild switch --flake "$HOME/config#$(hostname)" && exec zsh
}
alias nrs=rebuild

nix-clean() {
  echo "→ User GC..."
  nix-collect-garbage -d
  echo "→ System GC..."
  sudo nix-collect-garbage -d
  echo "✓ Done. Old generations removed."
}

nix-update() {
  nix flake update --flake "$HOME/config" && rebuild
}

nix-rollback() {
  _config-rebuild --list-generations --flake "$HOME/config" || return
  if [[ $OSTYPE == darwin* ]]; then
    echo "Pick: sudo /nix/var/nix/profiles/system/sw/bin/darwin-rebuild --switch-generation <N> --flake ~/config"
  else
    echo "Pick: sudo nixos-rebuild --switch-generation <N> --flake ~/config"
  fi
}

fi

# Open files by suffix without depending on EDITOR or VISUAL.
typeset _huginn_editor=vi _huginn_code_editor=vi _huginn_text_reader=vi
command -v vim >/dev/null 2>&1 && _huginn_editor=vim
_huginn_code_editor=$_huginn_editor
command -v code >/dev/null 2>&1 && _huginn_code_editor=code
_huginn_text_reader=$_huginn_editor
command -v bat >/dev/null 2>&1 && _huginn_text_reader=bat
alias -s vue=$_huginn_code_editor ts=$_huginn_code_editor tsx=$_huginn_code_editor
alias -s js=$_huginn_code_editor jsx=$_huginn_code_editor nix=$_huginn_code_editor json=$_huginn_code_editor
alias -s py=$_huginn_code_editor sh=$_huginn_code_editor zsh=$_huginn_code_editor go=$_huginn_code_editor rs=$_huginn_code_editor
alias -s yaml=$_huginn_editor yml=$_huginn_editor toml=$_huginn_editor
alias -s md=$_huginn_text_reader txt=$_huginn_text_reader log=$_huginn_text_reader

if command -v pbcopy >/dev/null 2>&1; then
  copy-public-key() { pbcopy < "$1"; }
  alias -s pub=copy-public-key
fi

# Resolve relative to this file, including when loaded through ~/.zshrc_local.
source "${HUGINN_SHELL_ROOT:-${${(%):-%x}:A:h:h:h:h}/shell}/keybindings.zsh"
autoload -Uz zmv

if command -v pbcopy >/dev/null 2>&1; then
  copy-command-buffer() {
    print -rn -- "$BUFFER" | command pbcopy || return
    zle -M "Copied command to clipboard"
  }
  zle -N copy-command-buffer
  bindkey -M emacs '^X^Y' copy-command-buffer
fi
