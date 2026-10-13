# Portable Catppuccin Mocha shell; sourced by the remote user's .bashrc.
[[ $- == *i* ]] || return

__huginn_prompt() {
    local status=$? branch='' env_part='' arrow='➜' color='166;227;161'
    if (( status != 0 )); then arrow='✘'; color='243;139;168'; fi
    if [[ -n ${VIRTUAL_ENV:-} ]]; then env_part="(${VIRTUAL_ENV##*/}) ";
    elif [[ -n ${CONDA_DEFAULT_ENV:-} ]]; then env_part="(${CONDA_DEFAULT_ENV}) "; fi
    if command -v git >/dev/null 2>&1; then
        branch=$(git symbolic-ref --short HEAD 2>/dev/null || git rev-parse --short HEAD 2>/dev/null) || branch=''
    fi
    [[ -z $branch ]] || branch=" \[\e[38;2;180;190;254m\]git:${branch}\[\e[0m\]"
    PS1="${env_part}\[\e[38;2;${color}m\]${arrow}\[\e[0m\] \[\e[38;2;116;199;236m\]\w\[\e[0m\]${branch}"
    if [[ -n ${SSH_CONNECTION:-} || -n ${SSH_TTY:-} ]]; then
        local label=${HUGINN_HOST_LABEL:-${HOSTNAME%%.*}} column
        column=$(( ${COLUMNS:-80} - ${#label} ))
        if (( column > 0 )); then
            PS1="\[\e[s\e[${column}G\e[38;2;148;226;213m\]${label}\[\e[0m\e[u\]${PS1}"
        fi
    fi
    PS1+=' '
}
PROMPT_COMMAND=__huginn_prompt

alias ll='ls -alFh --color=auto'
alias la='ls -A --color=auto'
alias l='ls -CF --color=auto'
alias ..='cd ..'
alias ...='cd ../..'
alias g='git'
alias gst='git status'
alias gco='git checkout'
alias gbr='git branch'
alias gcm='git commit -m'
alias gd='git diff'
alias gds='git diff --staged'
alias gaa='git add -A'
alias gl='git pull'
alias gup='git pull --rebase'
alias gp='git push'
alias gpsup='git push -u origin "$(git symbolic-ref --short HEAD)"'
alias glog='git log --oneline --graph --decorate --all'

shopt -s histappend checkwinsize cdspell autocd
HISTSIZE=10000
HISTFILESIZE=20000
HISTCONTROL=ignoreboth:erasedups
bind 'set completion-ignore-case on'
bind 'set show-all-if-ambiguous on'
export EDITOR=vim VISUAL=vim LESS='-R -F -X'
