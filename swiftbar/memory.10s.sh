#!/usr/bin/env bash
# Memory pressure
free=$(memory_pressure 2>/dev/null | grep "System-wide memory free percentage" | grep -o '[0-9]\+' | head -1)
if [ -n "$free" ]; then
  used=$((100 - free))
  echo "RAM ${used}%"
fi
