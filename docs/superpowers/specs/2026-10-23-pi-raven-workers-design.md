# Pi raven worker rows

Lucas approved compact crow glyphs, restrained animation and shared composer activity colours in this conversation.

## Scope and design

- Canonical implementation: `configs/pi/extensions/workers.ts`, loaded by `configs/pi/runtime.mjs`.
- Show one terminal-cell crow and status glyph per worker above the prompt. Cap at six worker rows, including at most two terminal rows; successful rows clear after five seconds, failures persist. Expose overflow and `/subagents-fleet` for inspection.
- Read the public event-bus RPC `ping` and untargeted `status` contracts. A tracked package patch adds explicit async run identities to fleet/snapshot records for reliable deduplication across workflow and materialized worker start times; never infer identities from agent/start alone. Use `asyncSnapshot` for reported tool/attention/lifecycle facts. Fleet entries alone have no current-tool evidence: label that activity unavailable.
- Reuse `composerColors` from `presentation.ts`. Tool is orange, waiting amber, errors red, unknown activity uses the session identity colour. Pulse the crow toward the theme's dim foreground, not an assumed background. Static status glyphs keep colour meanings unambiguous.
- Pulse every 250 ms while running, excluding attention states. Refresh status at two-second cadence only after the exact public response summary confirms the session-matched in-memory branch; lifecycle hints also refresh. Failed replies/timeouts immediately mark status unavailable and stop animation; absent fresh replies age out after eight seconds.
- Initialize timers on session start; clear timers, outstanding reply subscription and widget on shutdown. Read-only observer: never launches, steers or stops workers.
- Lucas's live smoke test exposed duplicate UI surfaces and five rows for two workers. Disable package FleetView/async widgets in the generated profile, retain summary inline tool receipts and `/subagents-fleet`. No dependency version changes, terminal/font edits, activation, commits or publication.
- Follow-up compact layout: display reported provider/model and thinking (foreground uses fleet effort), explicit pending placeholders when absent, bounded supplied labels and activity unknown shorthand. Quiet-age text appears only after 20 seconds; no stuck heuristic, inferred task titles, model-routing change or token/cost counters. Model and label columns are bounded so they cannot consume the whole row at ordinary widths.

## Implementation and acceptance

1. Add pure projection/render tests: async tool versus foreground unknown, shared dark/light colours, fixed-cell pulse, terminal/waiting/static states, narrow widths.
2. Implement observer and lifecycle tests: correlated RPC, startup-order ready recovery, above-editor mounting, safe polling, stale state and shutdown/switch cleanup.
3. Register in generated runtime settings and exercise the real Pi host under a PTY with the installed package RPC bridge/projections and synthetic execution state (`node integration-workers.mjs`). Verify one-cell width, colour frames, waiting/error/done transitions and clearing. No paid model or live child launches are required.
4. Run `npm test`, `npm run typecheck`, the PTY integration and the existing presentation integration. Document activation separately: a newly launched `pi --continue` regenerates runtime settings. Current terminal font appearance still needs Lucas's visual acceptance.

## Limits

Font glyph is a single silhouette: brightness pulse, not wing frames. Active is not proof of progress. No fabricated model/thinking/file detail. Async snapshots omit raw task prompts, so show only available public labels. Foreground completion disappears from the active fleet projection rather than manufacturing a success record. PTY/xterm proof does not attest Ghostty font fallback or actual provider/child execution.
