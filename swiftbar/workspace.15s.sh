#!/usr/bin/env bash
# Shows current AeroSpace focused workspace
ws=$(aerospace list-workspaces --focused 2>/dev/null)
[ -n "$ws" ] && echo " $ws " || echo " — "
