#!/usr/bin/env bash
# Memory pressure
if [[ $(memory_pressure 2>/dev/null) =~ System-wide\ memory\ free\ percentage:\ ([0-9]+)% ]]; then
  free=${BASH_REMATCH[1]}
  echo "RAM $((100 - free))%"
fi
