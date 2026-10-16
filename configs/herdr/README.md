# Herdr

This directory contains the managed Herdr configuration. The configured prefix is `Ctrl+B`.

## Agent-only navigation in Ghostty

Requires Ghostty 1.3+ and the matching `../ghostty/config` source.

1. Press **Ctrl+B** or **Hyper+A** (`Cmd+Option+Ctrl+Shift+A`), release, then **a**.
2. Press `j/k` repeatedly to focus the next/previous agent immediately, or
   the **number-row keys 1–9** to focus an agent by sidebar index. Number triggers
   match physical key positions rather than layout-produced characters. Ordinary
   terminals are skipped; numpad digits are not bound by this table.
3. Press **Esc** or **Enter** to exit the mode. These exit keys are not sent to
   the shell or agent. Any other unbound key exits the mode and is forwarded
   normally, so unexpected typing cannot remain trapped in the agent table.

This uses a persistent Ghostty key table, not Herdr's Go To picker. Native Herdr
actions perform selection; Ghostty sends explicit Kitty-encoded modified keys
because plain control bytes can be ambiguous. No scripts, fork, or server restart
are required. The mode is local to the Ghostty surface, not a native Herdr mode.

Both Ctrl+B and Hyper+A enter the same one-shot Ghostty prefix table. Agent-mode
entry sends explicit Kitty Escape (`ESC [ 27 u`) to leave Herdr prefix mode;
a bare Escape can merge with the next shortcut and lose the first digit.

Outside agent mode, Hyper+A followed by `h/j/k/l` still navigates panes and
`1–9` still selects tabs. `Ctrl+B`, then `g` retains the separate Go To picker.
Other terminals retain native `Ctrl+B` shortcuts but not Ghostty's persistent mode.

## Copy mode on Danish keyboards

Press **Ctrl+B**, release, then **Option+8** (`[` on Danish macOS layouts).
After the **COPY** indicator appears, use `h/j/k/l` to move, `v` to select,
`y` to copy, and `q` or Esc to leave. Hyper+A can replace Ctrl+B in Ghostty.

The explicit copy-mode bindings accept plain `[`, Alt+`[`, and Alt+8. Numbered
agent transport uses Ctrl+Alt+digits instead of Alt+digits to avoid stealing
Option+8. The visible agent-mode digit shortcuts remain unchanged. Deploy both
the Herdr and Ghostty source changes together, then reload both configurations.

An isolated terminal test confirmed Danish Alt+8 enters COPY mode and `v`/`y`
copies an exact sentinel; the prior clipboard was restored. Physical keyboard
acceptance in the current Ghostty client is a separate check.

## Configuration

`config.toml` and Ghostty's config are Nix-store-backed sources. A repository edit
does not update either deployed file. After an explicitly approved system rebuild:

1. Reload Ghostty configuration with **Cmd+Shift+,**.
2. In each attached Herdr client, press **Ctrl+B**, then **r**. This reloads client
   keybindings and the selected server config without restarting agent sessions.

Do not reload just one half: old Herdr bindings cannot interpret the new transport
chords, and old Ghostty config still sends `prefix+a` to the old Go To binding.

Verification: isolated Herdr tests exercised the complete prefix-entry, cancel,
and agent-digit transport with two reported agents and an ordinary terminal.
The bare-Escape sequence failed; explicit Kitty Escape passed. The direct numbered
Herdr action worked, but plain digits in Ghostty agent mode initially failed.
Ghostty's CLI parses the revised number-row triggers as physical `digit_1..9`.
After the approved 2026-10-16 rebuild and reload, Lucas confirmed that agent
numbering works in his current window. Earlier he confirmed copy mode and j/k.
This is user-reported keyboard acceptance, not automated physical-key testing;
all nine indices, fallback typing, and every pane/tab shortcut were not exhaustively
checked. No further GUI windows or synthetic live input are used for verification.
