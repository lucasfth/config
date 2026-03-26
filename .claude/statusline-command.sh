#!/bin/sh
# Claude Code status line — mirrors Starship catppuccin_mocha prompt style

input=$(cat)

# Colors (catppuccin_mocha accents)
SAPPHIRE='\033[38;2;116;199;236m'   # directory
LAVENDER='\033[38;2;180;190;254m'   # git branch
BASE_BG='\033[48;2;30;30;46m'       # git branch background
GREEN='\033[38;2;166;227;161m'      # git clean / ahead
YELLOW='\033[38;2;249;226;175m'     # git modified
RED='\033[38;2;243;139;168m'        # git conflicts / deleted
TEAL='\033[38;2;148;226;213m'       # git ahead
PEACH='\033[38;2;250;179;135m'      # git behind
MAUVE='\033[38;2;203;166;247m'      # git diverged
SKY_BLUE='\033[38;2;137;220;235m'   # git untracked
DIM='\033[2m'
RESET='\033[0m'
BOLD='\033[1m'

# --- Directory ---
cwd=$(echo "$input" | jq -r '.workspace.current_dir // .cwd')
# Truncate to last 4 path components (mirrors starship truncation_length=4)
short_dir=$(echo "$cwd" | awk -F'/' '{
  n=NF; start=n-3; if(start<1) start=1;
  out="";
  for(i=start;i<=n;i++){
    if(i>start) out=out"/";
    out=out$i
  }
  print out
}')
# Replace home prefix
short_dir=$(echo "$short_dir" | sed "s|^$HOME|~|")

# --- Git info ---
branch=""
git_status_str=""
if git -C "$cwd" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  branch=$(git -C "$cwd" symbolic-ref --short HEAD 2>/dev/null || git -C "$cwd" rev-parse --short HEAD 2>/dev/null)

  # Count statuses (skip optional locks)
  staged=$(git -C "$cwd" diff --no-lock-index --cached --name-only 2>/dev/null | wc -l | tr -d ' ')
  modified=$(git -C "$cwd" diff --no-lock-index --name-only 2>/dev/null | wc -l | tr -d ' ')
  untracked=$(git -C "$cwd" ls-files --others --exclude-standard 2>/dev/null | wc -l | tr -d ' ')
  ahead=0; behind=0
  ab=$(git -C "$cwd" rev-list --no-lock-index --left-right --count "@{upstream}...HEAD" 2>/dev/null)
  if [ -n "$ab" ]; then
    behind=$(echo "$ab" | awk '{print $1}')
    ahead=$(echo "$ab" | awk '{print $2}')
  fi

  [ "$staged" -gt 0 ]    && git_status_str="${git_status_str}${GREEN}+${staged} ${RESET}"
  [ "$modified" -gt 0 ]  && git_status_str="${git_status_str}${YELLOW}!${modified} ${RESET}"
  [ "$untracked" -gt 0 ] && git_status_str="${git_status_str}${SKY_BLUE}?${untracked} ${RESET}"
  if [ "$ahead" -gt 0 ] && [ "$behind" -gt 0 ]; then
    git_status_str="${git_status_str}${MAUVE}⇕⇡${ahead}⇣${behind} ${RESET}"
  elif [ "$ahead" -gt 0 ]; then
    git_status_str="${git_status_str}${TEAL}⇡${ahead} ${RESET}"
  elif [ "$behind" -gt 0 ]; then
    git_status_str="${git_status_str}${PEACH}⇣${behind} ${RESET}"
  fi
fi

# --- Model ---
model=$(echo "$input" | jq -r '.model.display_name // empty')

# --- Context window ---
used_pct=$(echo "$input" | jq -r '.context_window.used_percentage // empty')

# --- Build output ---
# Prompt arrow + directory
printf "${BOLD}➜${RESET} ${SAPPHIRE}[ %s ]${RESET}" "$short_dir"

# Git branch + status
if [ -n "$branch" ]; then
  printf " ${BASE_BG}${LAVENDER} %s${RESET}" "$branch"
  if [ -n "$git_status_str" ]; then
    printf " "
    printf "${git_status_str}"
  fi
fi

# Model
if [ -n "$model" ]; then
  printf "${DIM} · %s${RESET}" "$model"
fi

# Context %
if [ -n "$used_pct" ]; then
  printf "${DIM} · ctx: $(printf '%.0f' "$used_pct")%%${RESET}"
fi

printf "\n"
