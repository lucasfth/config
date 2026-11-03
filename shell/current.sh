# Load commands from the canonical Nix shell sources rendered by deploy-shell.py.
_huginn_shell_root=${HUGINN_SHELL_ROOT:-$HOME/.local/share/huginn-shell}
export HUGINN_CONFIG_ROOT="$_huginn_shell_root/configs"
export PATH="$_huginn_shell_root/bin:$HOME/.local/bin:$HOME/.nix-profile/bin:$PATH"
if [ -n "${ZSH_VERSION-}" ] && [ -r "$_huginn_shell_root/plugins/oh-my-zsh/plugins/git/git.plugin.zsh" ]; then
  autoload -Uz compinit
  (( $+functions[compdef] )) || compinit
  . "$_huginn_shell_root/plugins/oh-my-zsh/lib/git.zsh"
  . "$_huginn_shell_root/plugins/oh-my-zsh/plugins/git/git.plugin.zsh"
elif [ -n "${BASH_VERSION-}" ]; then
  git_current_branch() { command git symbolic-ref --quiet --short HEAD 2>/dev/null || command git rev-parse --short HEAD 2>/dev/null; }
  git_main_branch() {
    local branch ref
    for branch in main trunk mainline default stable master; do
      for ref in "refs/heads/$branch" "refs/remotes/origin/$branch" "refs/remotes/upstream/$branch"; do
        if command git show-ref -q --verify "$ref"; then printf '%s\n' "$branch"; return; fi
      done
    done
    ref=$(command git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null) && { printf '%s\n' "${ref#origin/}"; return; }
    printf 'master\n'
  }
  git_develop_branch() {
    local branch
    for branch in dev devel develop development; do
      if command git show-ref -q --verify "refs/heads/$branch"; then printf '%s\n' "$branch"; return; fi
    done
    printf 'develop\n'
  }
  [ ! -r "$_huginn_shell_root/git-aliases.sh" ] || . "$_huginn_shell_root/git-aliases.sh"
fi
[ ! -r "$_huginn_shell_root/aliases.sh" ] || . "$_huginn_shell_root/aliases.sh"
if [ -n "${ZSH_VERSION-}" ]; then
  [ ! -r "$_huginn_shell_root/env.sh" ] || . "$_huginn_shell_root/env.sh"
  [ ! -r "$_huginn_shell_root/interactive.zsh" ] || . "$_huginn_shell_root/interactive.zsh"
else
  [ ! -r "$_huginn_shell_root/commands.sh" ] || . "$_huginn_shell_root/commands.sh"
fi
