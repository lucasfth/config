# Preserve the existing prompt; add an SSH-only machine label on the right.
__huginn_ssh_identity() {
    local label=${HUGINN_HOST_LABEL:-${HOSTNAME%%.*}} column
    if [[ -n ${SSH_CONNECTION:-} || -n ${SSH_TTY:-} ]]; then
        column=$(( ${COLUMNS:-80} - ${#label} ))
        if (( column > 0 )); then
            PS1="\[\e[s\e[${column}G\e[38;2;148;226;213m\]${label}\[\e[0m\e[u\]${PS1}"
        fi
    fi
}
# Existing __prompt rebuilds PS1 every time, preventing repeated prefixes.
PROMPT_COMMAND='__prompt; __huginn_ssh_identity'
