# Herdr

This directory contains the managed Herdr configuration. The configured prefix is `Ctrl+B`.

## Agent-only navigation in Ghostty

Requires Ghostty 1.3+ and the matching `../ghostty/config` source.

1. Press **Hyper+A** (`Cmd+Option+Ctrl+Shift+A`), release, then **a**.
2. Press **j/k** repeatedly to focus the next/previous agent immediately, or
   **1–9** to focus an agent by its sidebar index. Ordinary terminals are skipped.
3. Press **Esc** or **Enter** to exit the mode. These exit keys are not sent to
   the shell or agent. Any other unbound key exits the mode and is forwarded
   normally, so unexpected typing cannot remain trapped in the agent table.

This uses a persistent Ghostty key table, not Herdr's Go To picker. Native Herdr
actions perform selection; Ghostty sends explicit Kitty-encoded modified keys
because plain control bytes can be ambiguous. No scripts, fork, or server restart
are required. The mode is local to the Ghostty surface, not a native Herdr mode.

Outside agent mode, Hyper+A followed by `h/j/k/l` still navigates panes and
`1–9` still selects tabs. `Ctrl+B`, then `g` retains the separate Go To picker.
Other terminals retain native `Ctrl+B` shortcuts but not Ghostty's persistent mode.

## Configuration

`config.toml` and Ghostty's config are Nix-store-backed sources. A repository edit
does not update either deployed file. After an explicitly approved system rebuild:

1. Reload Ghostty configuration with **Cmd+Shift+,**.
2. In each attached Herdr client, press **Ctrl+B**, then **r**. This reloads client
   keybindings and the selected server config without restarting agent sessions.

Do not reload just one half: old Herdr bindings cannot interpret the new transport
chords, and old Ghostty config still sends `prefix+a` to the old Go To binding.

Verification: the native agent actions and explicit transport sequences were
exercised in an isolated Herdr server with two reported agents and an ordinary
terminal. Ghostty parses the key tables successfully. Full keyboard-path acceptance
still needs checking in the deployed client: enter mode, switch with j/k and 1–9,
exit, then confirm pane/tab navigation and ordinary typing remain intact.
