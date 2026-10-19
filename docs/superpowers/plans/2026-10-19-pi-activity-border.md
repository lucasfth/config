# Pi session/activity border

Approved direction: stable session identity at upper-left, diagonal blend toward actual activity at lower-right. Context usage stays numeric; no token/effort/progress scale.

## Scope and architecture

- `configs/pi/extensions/presentation.ts`: pure exported session/state colour mapping using Catppuccin Mocha/Latte; session ID selects one stable identity swatch. Lifecycle events track model work, concurrent tools, blocking UI prompts and terminal errors. Existing status indicators supply retry/compaction state (there is no extension retry event).
- Colour the existing top/bottom borders per grapheme and vertical borders per row after native layout, without changing editor text, cursor markers, image tokens, autocomplete or shortcuts. Upper-left anchor includes the spinner; lower-right is the activity endpoint. No extension animation timer.
- Model: blue; tools: peach; retry/waiting for input: amber; compaction/branch summary: mauve; actual terminal error: red. Normal settlement/cancellation restores idle. Terminal errors remain visible until new activity/session; recoverable tool failures stay tool/model state rather than turning the run red.
- State precedence: held retry/compaction indicator, blocking UI prompt, error, concurrent tools, working/idle. Track tool IDs and prompt depth rather than a single busy boolean.

## Behavior slices and checks

1. Add rendered lifecycle regression in `extensions/presentation.test.ts`, prove it fails against unchanged presentation, implement pure mapping/state/layout. Test stable session identity across reload/resume, varying IDs, light/dark, tool overlap, UI prompts, retry/compaction holds, cancellation, error/recovery and widths/graphemes.
2. Update `integration-spinner.mjs` expectations for intentional gradient: read actual host session ID via an isolated fixture extension, check exact upper-left/spinner identity and exact lower-right activity endpoint. Exercise real model→tool→model→idle in a PTY in both palettes; retain ANSI/screen captures and native spinner animation assertions.
3. Run unit tests, TypeScript, presentation and terminal integrations; update `configs/pi/README.md` with the legend and verification limits.

No dependencies, commits, pushes, activation or live-process restarts. Preserve unrelated edits. Source is loaded by an operator Pi `/reload`. PTY fixtures use deterministic local provider responses, not live-provider/UI pixel proof.

## Verification and discovered defect

The narrow-pane check exposed native recursion for an unfit wide grapheme. The placeholder compatibility patch was removed and its installed edit reversed. Tests record RangeError at widths 1, 2, 3 and 5 (padding 2, focus on/off); widths 4 and 6–8 render. This is an unfixed native limitation, not part of the colour feature. No resize-recovery claim applies to the final implementation.

After removing the workaround, repeated setup, 84 unit tests, TypeScript, both activity-colour PTYs and terminal integration passed. Real PTY model/tool/idle colour checks passed in both appearances; terminal chart/composer and presentation smokes passed. The full integration command stopped at the skill-metadata character budget in `integration-context.mjs` (45680, limit 14399). An isolated run excluding presentation reproduced the identical failure. Condense/compaction checks after that failing gate passed separately. Full integration is not green.
