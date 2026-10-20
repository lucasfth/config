# Shared interactive Zsh profile for the managed remote-shell launcher.
[[ -o interactive ]] || return
[[ -n ${_HUGINN_FLEET_ZSH_LOADED:-} ]] && return
typeset -g _HUGINN_FLEET_ZSH_LOADED=1

typeset _huginn_root=${HUGINN_SHELL_ROOT:-$HOME/.local/share/huginn-shell}
typeset _huginn_label=${HUGINN_HOST_LABEL:-${HOST:-${HOSTNAME:-$(command hostname 2>/dev/null)}}}
_huginn_label=${_huginn_label//[^a-zA-Z0-9._-]/}
[[ -n $_huginn_label ]] || _huginn_label=host
typeset -g _HUGINN_FLEET_HOST_LABEL=$_huginn_label

# Keep the launcher-provided prompt presets independent of each host's old config.
if [[ -n ${SSH_CONNECTION:-} || -n ${SSH_TTY:-} ]]; then
  [[ -r $_huginn_root/starship-ssh.toml ]] && export STARSHIP_CONFIG="$_huginn_root/starship-ssh.toml"
else
  [[ -r $_huginn_root/starship.toml ]] && export STARSHIP_CONFIG="$_huginn_root/starship.toml"
fi

# Make completion available before loading fzf-tab. A populated compdef function
# indicates that compinit already ran in the original startup files.
autoload -Uz compinit add-zsh-hook edit-command-line
if (( ! $+functions[compdef] )); then
  compinit
fi

# Case-insensitive and prefix/fuzzy completion also work without fzf-tab.
zstyle ':completion:*' matcher-list \
  'm:{[:lower:][:upper:]}={[:upper:][:lower:]}' 'r:|=*' 'l:|=* r:|=*'

# Source Oh My Zsh's helper and clipboard libraries before the complete git plugin.
if [[ -r $_huginn_root/plugins/oh-my-zsh/lib/functions.zsh ]]; then
  source "$_huginn_root/plugins/oh-my-zsh/lib/functions.zsh"
fi
if [[ -r $_huginn_root/plugins/oh-my-zsh/lib/clipboard.zsh ]]; then
  source "$_huginn_root/plugins/oh-my-zsh/lib/clipboard.zsh"
fi
if [[ -r $_huginn_root/plugins/oh-my-zsh/lib/git.zsh ]]; then
  source "$_huginn_root/plugins/oh-my-zsh/lib/git.zsh"
fi
if [[ -r $_huginn_root/plugins/oh-my-zsh/plugins/git/git.plugin.zsh ]]; then
  source "$_huginn_root/plugins/oh-my-zsh/plugins/git/git.plugin.zsh"
fi

# fzf-tab must follow compinit and precede autosuggestions; highlighting loads last.
if (( ! $+widgets[fzf-tab-complete] )) && [[ -r $_huginn_root/plugins/fzf-tab/fzf-tab.plugin.zsh ]]; then
  source "$_huginn_root/plugins/fzf-tab/fzf-tab.plugin.zsh"
fi
if (( $+widgets[fzf-tab-complete] )); then
  zstyle ':completion:*:descriptions' format '[%d]'
  zstyle ':completion:*:*:*:*:*' menu no
  zstyle ':fzf-tab:complete:cd:*' fzf-preview 'ls -A -p -- "$realpath" 2>/dev/null'
  zstyle ':fzf-tab:complete:__zoxide_z:*' fzf-preview 'ls -A -p -- "$realpath" 2>/dev/null'
else
  zstyle ':completion:*:*:*:*:*' menu select
  zstyle ':completion:*:default' list-prompt '%SAt %p: Hit TAB for more, or the character to insert%s'
  zstyle ':completion:*:default' select-prompt '%SScrolling active: current selection at %p%s'
fi

if (( ! $+functions[_zsh_autosuggest_start] )) && [[ -r $_huginn_root/plugins/zsh-autosuggestions/zsh-autosuggestions.zsh ]]; then
  source "$_huginn_root/plugins/zsh-autosuggestions/zsh-autosuggestions.zsh"
fi

# Shared history and the Mac's standard editing/navigation bindings.
HISTFILE=${HISTFILE:-$HOME/.zsh_history}
HISTSIZE=10000
SAVEHIST=20000
setopt APPEND_HISTORY SHARE_HISTORY HIST_IGNORE_SPACE HIST_IGNORE_ALL_DUPS HIST_SAVE_NO_DUPS HIST_FIND_NO_DUPS
bindkey -e
typeset _huginn_editor=vim
command -v vim >/dev/null 2>&1 || _huginn_editor=vi
source "$_huginn_root/keybindings.zsh"
bindkey -M emacs '^P' history-beginning-search-backward
bindkey -M emacs '^N' history-beginning-search-forward

# Retain familiar, portable aliases even if the plugin archive is unavailable.
alias ll='ls -alFh' la='ls -A' l='ls -CF' ..='cd ..' ...='cd ../..'
alias g='git' gst='git status' gco='git checkout' gbr='git branch'
alias gcm='git commit -m' gd='git diff' gds='git diff --staged'
alias gaa='git add -A' gl='git pull' gup='git pull --rebase'
alias gp='git push' glog='git log --oneline --graph --decorate --all'

# Open source files in VS Code when present, otherwise fall back to Vim/vi.
typeset _huginn_code_editor=$_huginn_editor
command -v code >/dev/null 2>&1 && _huginn_code_editor=code
if command -v code >/dev/null 2>&1 || command -v vim >/dev/null 2>&1 || command -v vi >/dev/null 2>&1; then
  alias -s vue=$_huginn_code_editor ts=$_huginn_code_editor tsx=$_huginn_code_editor
  alias -s js=$_huginn_code_editor jsx=$_huginn_code_editor nix=$_huginn_code_editor
  alias -s json=$_huginn_code_editor py=$_huginn_code_editor sh=$_huginn_code_editor
  alias -s zsh=$_huginn_code_editor go=$_huginn_code_editor rs=$_huginn_code_editor
  alias -s yaml=$_huginn_editor yml=$_huginn_editor toml=$_huginn_editor
fi
if command -v bat >/dev/null 2>&1; then
  alias -s md=bat txt=bat log=bat
elif command -v vim >/dev/null 2>&1 || command -v vi >/dev/null 2>&1; then
  alias -s md=$_huginn_editor txt=$_huginn_editor log=$_huginn_editor
fi

# Initialize optional tools only when the original startup files did not.
if command -v direnv >/dev/null 2>&1 && (( ! $+functions[_direnv_hook] )); then
  eval "$(command direnv hook zsh)"
fi
if command -v zoxide >/dev/null 2>&1 && (( ! $+functions[__zoxide_z] )); then
  eval "$(command zoxide init zsh)"
fi
if [[ -o interactive && -t 0 ]] && command -v fzf >/dev/null 2>&1 && (( ! $+functions[fzf-history-widget] )); then
  typeset _huginn_fzf_zsh
  _huginn_fzf_zsh="$(command fzf --zsh 2>/dev/null)" && eval "$_huginn_fzf_zsh"
fi

typeset _huginn_starship_ready=0 _huginn_hook
typeset -a _huginn_starship_hooks _huginn_other_hooks
for _huginn_hook in "${precmd_functions[@]}"; do
  if [[ $_huginn_hook == *starship* ]]; then
    _huginn_starship_ready=1
    _huginn_starship_hooks+=("$_huginn_hook")
  else
    _huginn_other_hooks+=("$_huginn_hook")
  fi
done
if (( ! _huginn_starship_ready )) && \
   { (( $+functions[prompt_starship_precmd] || $+functions[__starship_precmd] || $+functions[starship_precmd] )) ||
     [[ ${STARSHIP_SHELL:-} == zsh && $PROMPT == *starship* ]]; }; then
  _huginn_starship_ready=1
fi
if (( ! _huginn_starship_ready )) && command -v starship >/dev/null 2>&1; then
  typeset _huginn_starship_init
  _huginn_starship_init="$(command starship init zsh 2>/dev/null)" && eval "$_huginn_starship_init"
  _huginn_starship_ready=0
  _huginn_starship_hooks=()
  _huginn_other_hooks=()
  for _huginn_hook in "${precmd_functions[@]}"; do
    if [[ $_huginn_hook == *starship* ]]; then
      _huginn_starship_ready=1
      _huginn_starship_hooks+=("$_huginn_hook")
    else
      _huginn_other_hooks+=("$_huginn_hook")
    fi
  done
fi
if (( _huginn_starship_ready )); then
  # The final Starship hook captures exit status after legacy prompt reset hooks.
  precmd_functions=(${precmd_functions:#*starship*})
  precmd_functions+=(${_huginn_starship_hooks[@]})
  typeset -gi _HUGINN_FLEET_STARSHIP_ACTIVE=1
  typeset -g _HUGINN_FLEET_STARSHIP_PROMPT=$PROMPT
  typeset -g _HUGINN_FLEET_STARSHIP_RPROMPT=$RPROMPT
else
  typeset -gi _HUGINN_FLEET_STARSHIP_ACTIVE=0
fi

_huginn_fleet_apply_prompt() {
  local _huginn_status=$?
  if (( _HUGINN_FLEET_STARSHIP_ACTIVE )); then
    PROMPT=$_HUGINN_FLEET_STARSHIP_PROMPT
    RPROMPT=$_HUGINN_FLEET_STARSHIP_RPROMPT
  fi
  local _huginn_label_prompt="%F{#94e2d5}${_HUGINN_FLEET_HOST_LABEL}%f"
  RPROMPT=${RPROMPT//$_huginn_label_prompt/}
  [[ -z $RPROMPT ]] || RPROMPT+=" "
  RPROMPT+=$_huginn_label_prompt
  return $_huginn_status
}
add-zsh-hook -d precmd _huginn_fleet_apply_prompt 2>/dev/null
add-zsh-hook precmd _huginn_fleet_apply_prompt

# Load syntax highlighting last, after every other ZLE/plugin customization.
if (( ! $+functions[_zsh_highlight] )) && [[ -r $_huginn_root/plugins/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh ]]; then
  source "$_huginn_root/plugins/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh"
fi

