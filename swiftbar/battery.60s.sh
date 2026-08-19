#!/usr/bin/env bash
# Battery percentage with icon
info=$(pmset -g batt 2>/dev/null)
if [[ $info =~ ([0-9]+)% ]]; then
  pct=${BASH_REMATCH[1]}
else
  echo "🔌 —"
  exit 0
fi

case "$info" in
  *discharging*)
    if ((pct <= 20)); then icon="🪫"; else icon="🔋"; fi
    echo "$icon $pct%" ;;
  *charging*|*"AC attached"*)
    echo "⚡ $pct%" ;;
  *)
    echo "🔌 $pct%" ;;
esac
