#!/usr/bin/env bash
# Catppuccin colors — read from env if set, else detect (one-shot for standalone use)

if [ -n "$BAR_COLOR" ]; then
  return 0 2>/dev/null || exit 0  # already set by sketchybarrc
fi

# Standalone fallback: detect once
is_dark() {
  [[ $(osascript -e 'tell application "System Events" to tell appearance preferences to get dark mode') = "true" ]]
}

if is_dark; then
  # ── Mocha ───────────────────────────────────────────────────
  BAR_COLOR=0xff1e1e2e
  SURFACE0=0xff313244
  SURFACE1=0xff45475a
  OVERLAY0=0xff6c7086
  TEXT=0xffcdd6f4
  SUBTEXT0=0xffa6adc8
  MAUVE=0xffcba6f7
  BLUE=0xff89b4fa
  GREEN=0xffa6e3a1
  YELLOW=0xfff9e2af
  PEACH=0xfffab387
  RED=0xfff38ba8
  TEAL=0xff94e2d5
  LAVENDER=0xffb4befe
else
  # ── Latte ───────────────────────────────────────────────────
  BAR_COLOR=0xffeff1f5
  SURFACE0=0xffccd0da
  SURFACE1=0xffbcc0cc
  OVERLAY0=0xff9ca0b0
  TEXT=0xff4c4f69
  SUBTEXT0=0xff5c5f77
  MAUVE=0xff8839ef
  BLUE=0xff1e66f5
  GREEN=0xff40a02b
  YELLOW=0xffdf8e1d
  PEACH=0xfffe640b
  RED=0xffd20f39
  TEAL=0xff179299
  LAVENDER=0xff7287fd
fi
