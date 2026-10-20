# Pi header legend and bottom-anchored model picker

Lucas approved header option 2: keep the existing raven/wordmark and command hints, then add a muted separator and an input-border colour legend underneath. Use coloured square glyphs from the same `composerColors` function as the composer, with muted labels: Responding, Tools, Waiting / retry, Compacting, Error, and an idle/session-colour note. Wrap whole entries; hide the legend in very small terminals so the composer remains usable. Do not recolour the legend with the session's single artwork colour.

`/switch` currently requests an overlay anchored at `center`. Change this to `bottom-center`, retaining its width, margin, search, selection and cancellation behavior. This shared picker also serves saved role selection.

## Implementation and acceptance

1. Add a failing header renderer test for the separated legend, exact light/dark swatches, width limits and small-window fallback. Implement in `configs/pi/extensions/presentation.ts`, retaining existing artwork boundaries.
2. Add a failing picker test using the real TUI overlay layout at multiple terminal sizes and while filtering. Change only its anchor in `configs/pi/extensions/model-picker.ts`.
3. Extend existing isolated PTY checks to inspect real header swatch cells and picker location, selection and Escape. Update `configs/pi/README.md`; run focused tests, typecheck, full unit tests and affected PTY integrations.

No dependencies, provider changes, commits, deployment, live-session reloads or service restarts. New source is loaded by a new Pi process or an operator-requested reload. PTY/xterm captures prove the consumer terminal-cell path, not physical Ghostty/Herdr rendering.

## Approved compact visual follow-up

Lucas requested a visual explanation of upper-left identity versus lower-right activity without increasing header height. Replace the blank/separator rows with a 42-column, two-line miniature composer border from 63 columns upward. Keep its labels muted and its border on the same activity/status/colour path as the real composer. Rename the legend `Lower-right`; narrower panes retain the text-only separator. Existing row guards, wordmark boundaries and total height stay unchanged. Verify static swatches plus live miniature idle/model/tool endpoints in dark/light 30-row PTYs, responsive renderer tests and the full unit/typecheck gate.

## Approved full-width startup demo

Superseding the 42-column sample: use the available header width while preserving the same two rows. Fresh idle TUI sessions with no prior user prompt fade the sample's lower-right through model/tool/waiting/compaction/error colours (two seconds per transition, 100 ms render tick), labelled `Activity demo`. Never mutate real activity or the actual composer. Stop and clear the timer on submitted input, agent start and shutdown; clear before session replacement and skip resumed user branches. After submission the sample follows real activity and never resumes the demo on settle. Keep compact-pane fallbacks unchanged. Verify mock-clock lifecycle cleanup, full-width rendering and existing height guard, real typed-input notification, dark/light PTY animation with idle composer and subsequent live activity, full tests and typecheck.

## Prompt-row refinement

Lucas requested that the dummy composer resemble the actual input. Add one muted `Your prompt…` interior row and matching side borders, making the sample three rows tall (one extra header row). Rename `Lower-right` to `Activity type`. Preserve window-width sizing, animation stop and the eight-free-row guard. Update renderer and PTY row math together; verify an actual composer is visible in 30 rows. PTY sampling must respect synchronized-update boundaries rather than reading half-painted frames. A probe of the real `input` event marks the first submitted prompt in terminal output; no subsequent complete repaint may contain the demo label. Picker capture must wait for a complete overlay (row-38 count footer, or selected item for a singleton filter), not treat the first hint bytes as a finished frame.
