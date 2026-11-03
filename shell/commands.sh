# Shared commands sourced by Nix Zsh and remote Zsh/Bash profiles.
# Deployment supplies public app configs here; never a secrets/config checkout copy.
_huginn_config_root=${HUGINN_CONFIG_ROOT:-$HOME/config/configs}
if command -v lazygit >/dev/null 2>&1; then
  if [ -r "$_huginn_config_root/lazygit/config.yml" ]; then
    alias lg='lazygit --use-config-file "$_huginn_config_root/lazygit/config.yml"'
  else
    alias lg=lazygit
  fi
fi

# Preserve installed providers/profiles. Never redirect stock Pi to an incomplete
# config checkout or install a fresh provider as a side effect of shell startup.
_huginn_pi_launcher=
if [ -x "$HOME/config/scripts/pi-native" ] && [ -d "$HOME/config/configs/pi/node_modules/@earendil-works/pi-coding-agent" ]; then
  _huginn_pi_launcher="$HOME/config/scripts/pi-native"
elif [ "${HUGINN_HOST_LABEL-}" = vps1 ] && [ -x /opt/pi-native/pi ]; then
  _huginn_pi_launcher=/opt/pi-native/pi
elif command -v pi >/dev/null 2>&1; then
  _huginn_pi_launcher=pi
fi
if [ -n "$_huginn_pi_launcher" ]; then
  unalias pi pi-native 2>/dev/null || true
  pi() {
    if [ "${HERDR_ENV-}" = 1 ] && [ -n "${HERDR_SOCKET_PATH-}" ] && [ -n "${HERDR_PANE_ID-}" ]; then
      local agent_dir=${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}
      [ "$_huginn_pi_launcher" != /opt/pi-native/pi ] || agent_dir=/opt/pi-native/agent
      if [ ! -f "$agent_dir/extensions/herdr-agent-state.ts" ]; then
        PI_CODING_AGENT_DIR="$agent_dir" "${HERDR_BIN_PATH:-herdr}" integration install pi >&2 || true
      fi
    fi
    if [ "$_huginn_pi_launcher" = pi ]; then command pi "$@"
    else "$_huginn_pi_launcher" "$@"; fi
  }
  pi-native() { pi "$@"; }
fi

# Shortcut names mirror the generated SSH inventory; no keys or endpoints travel.
unalias post-sales se1 se2 sem se1lv semd se3 vps1lv 2>/dev/null || true
alias loki='ssh loki' sigyn='ssh sigyn' ssh-windows='ssh windows'
alias vps1='ssh vps1' vps2='ssh vps2'
alias mimer='ssh mimer' freyr='ssh freyr' gimle='ssh gimle' mini='ssh mini' neo='ssh neo'
alias ecoray3d='ssh ecoray3d' sep='ssh sep' plato='ssh plato'
alias minid='ssh -t mini "cd lucasfth/ecoray-web && git checkout development && git pull && exec \$SHELL --login"'

# Compatible tool initialization is shared with the Nix startup behavior.
if [ -r "$_huginn_config_root/tmux/tmux-ssh.conf" ] && [ -n "${SSH_CONNECTION-}${SSH_TTY-}" ]; then
  alias tmux='tmux -f "$_huginn_config_root/tmux/tmux-ssh.conf"'
fi
if [ -n "${BASH_VERSION-}" ]; then
  if command -v direnv >/dev/null 2>&1 && ! declare -F _direnv_hook >/dev/null; then eval "$(command direnv hook bash)"; fi
  if command -v zoxide >/dev/null 2>&1 && ! declare -F __zoxide_z >/dev/null; then eval "$(command zoxide init bash)"; fi
fi
