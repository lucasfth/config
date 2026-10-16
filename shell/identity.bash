# Source after the host's existing interactive startup; preserve its prompt hooks.
[[ $- == *i* ]] || return 0
[[ -z ${HUGINN_SHELL_MANAGED-} && -n ${SSH_CONNECTION-}${SSH_TTY-} ]] || return 0
# Older repo prompts already own the right-hand label; the exported label above
# updates their identity without stacking another cursor-saving prefix.
if declare -F __huginn_prompt >/dev/null || declare -F __huginn_ssh_identity >/dev/null; then
    return 0
fi

__huginn_right_identity() {
    local previous_status=$? label=${HUGINN_HOST_LABEL:-${HOSTNAME%%.*}} column
    # Static prompts keep the previous prefix; dynamic prompts rebuild PS1 themselves.
    if [[ -n ${__huginn_identity_prefix-} && $PS1 == "$__huginn_identity_prefix"* ]]; then
        PS1=${PS1#"$__huginn_identity_prefix"}
    fi
    column=$(( ${COLUMNS:-80} - ${#label} + 1 ))
    __huginn_identity_prefix=''
    if (( column > 0 )); then
        __huginn_identity_prefix="\[\e[s\e[${column}G\e[38;2;148;226;213m\]${label}\[\e[0m\e[u\]"
        PS1="$__huginn_identity_prefix$PS1"
    fi
    return "$previous_status"
}

# Bash 5 can hold an array of callbacks; macOS Bash 3.2 uses a command string.
if [[ $(declare -p PROMPT_COMMAND 2>/dev/null) == 'declare -a '* ]]; then
    __huginn_identity_present=''
    for __huginn_callback in "${PROMPT_COMMAND[@]}"; do
        [[ $__huginn_callback != __huginn_right_identity ]] || __huginn_identity_present=1
    done
    [[ -n $__huginn_identity_present ]] || PROMPT_COMMAND+=(__huginn_right_identity)
    unset __huginn_callback __huginn_identity_present
else
    case ";${PROMPT_COMMAND-};" in
        *';__huginn_right_identity;'*) ;;
        *) PROMPT_COMMAND="${PROMPT_COMMAND:+${PROMPT_COMMAND};}__huginn_right_identity" ;;
    esac
fi
