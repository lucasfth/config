# Herdr Omni compact layout design

**Status:** Design approved for documentation only; implementation requires separate approval. Rounded-corner preference added 2026-11-06.

## Goal

Make the live Herdr Omni popup easier to scan and more intentional without changing the existing Catppuccin Mocha palette, keybindings, plugin behavior, or Herdr sidebar.

## Evidence and user choice

Lucas selected direction **B — Compact grouped browser** from the visual comparison at `http://localhost:59762` on 2026-11-06. His reference screenshot shows the current Omni v0.17.2 popup: all workspaces, agents, tabs and actions appear together, long titles compete for horizontal room, and the selected-item preview consumes about 42% of a wide window.

## Design

Keep Omni's grouped workspace/agent/tab/action browser and its current search and selection semantics, but make the hierarchy calmer:

- Preserve Catppuccin Mocha colors and current Herdr popup placement, keybindings and categories.
- Keep search and the section-count row at the top. Tighten their spacing and present section counts as a quieter navigation strip.
- Keep the results as the primary column. Retain grouped sections, but render section labels as compact disclosure headers with counts; allow collapsing non-selected groups. The selected group remains expanded so keyboard navigation never hides its current result.
- Give the results list more width. On wide terminals, reduce the selected-item preview from the current 42% to roughly 30%; set a reasonable minimum width so task/session titles are readable. On narrow terminals keep the existing stacked preview behavior.
- Make the preview quieter and denser: consistent heading, status, workspace/tab context, and paths, with long paths wrapped or truncated without displacing the result list. Keep the existing explicit preview toggle and expanded-preview action.
- Improve row alignment and whitespace: consistent icon/badge, title, and right-aligned state columns; distinguish the selected row with the existing accent and surface colors rather than adding colors or decorative effects.
- Use more rounded geometry for the popup frame, search field, selected row and preview surface, while preserving the existing palette and avoiding pill-shaped controls. Use Ratatui-supported border types; do not imply terminal window transparency or native macOS corner clipping.
- Keep the footer concise and aligned; do not let shortcut help compete with the search or selected result.

The mockup for the approved direction is preserved in the brainstorming session. It is a layout illustration, not a promise that every field can be changed through a plugin setting.

## Architecture and constraints

Omni currently implements its Ratatui layout/rendering in a single Rust UI module; the upstream repository is pinned as a prebuilt release binary in `configs/herdr/plugins.nix`. The requested visual adjustments are not known to be configurable in v0.17.2. If implementation requires Rust changes, keep them reviewable in this repository as a patch or pinned fork/source derivation—never modify the `/tmp` inspection checkout as the deliverable. Do not change upstream source pin or release binary hash without an explicit implementation decision and verified build.

The existing active system has Omni v0.17.2 installed. This design does not authorize a rebuild, Home Manager activation, plugin update, Herdr reload/restart, or any remote/fleet rollout.

## Acceptance checks for a separately approved implementation

- Catppuccin palette and all existing shortcut/action behavior remain unchanged.
- Wide popup: list is visibly primary, preview is at most about one-third of content width, columns remain aligned, and long task titles gain readable space.
- Popup/panel border characters use visibly rounded corners where the active terminal encoding and renderer support them; layout remains legible in plain-text fallback.
- Narrow popup: content remains legible and the preview stacks without clipping essential controls.
- Group collapse/expand is keyboard accessible, preserves the selected item and does not change filtering or selection semantics.
- Existing Omni search, workspace selection, tab/agent navigation, preview toggle, expanded preview, and popup close paths continue to work.
- Build the exact patched source derivation and record its output/hash. Exercise the newly built popup in an isolated Herdr server, then verify the live popup only after a separately approved activation.

## Non-goals

- Palette/theme redesign, new colors, fonts, shadows, animation, or decorative branding.
- Herdr sidebar redesign, changes to server/config keys, keybinding collision fixes, or changes to the current `prefix+g` assignment.
- New search/indexing capabilities, transcript behavior, agent-state semantics, or automatic naming behavior.
- Activating or distributing any implementation.
