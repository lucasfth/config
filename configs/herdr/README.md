# Herdr

This directory contains the managed Herdr configuration. The configured prefix is `Ctrl+B`.

## Navigate agents and terminals

Press **Hyper+A**, then **a** in Ghostty to open Herdr's Go To picker. Ghostty sends `Ctrl+B` for Hyper+A (`Cmd+Option+Ctrl+Shift+A`), so `Ctrl+B`, then `a` works in other terminals. `Ctrl+B`, then `g` remains an alternate shortcut. The picker lists agents **and terminals** as rows grouped by workspace; it is not an agent-only persistent live-focus mode. Use `j`/`k` to select a row, `Enter` to switch to it, and `Esc` to cancel. The picker also supports `/` search and agent-state filters; `a` shows all terminals again.

This does not add digit-based agent selection. Existing pane navigation remains `Ctrl+B` then `h`/`j`/`k`/`l`; the picker binding does not replace those pane bindings.

## Configuration

`config.toml` is the source configuration. Herdr reads `~/.config/herdr/config.toml` on macOS and Linux. After an approved deployment, the running server can reload its configuration with:

```sh
herdr server reload-config
```

No live reload or system activation is performed by editing this repository file.
