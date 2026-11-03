# Herdr machine-grouped agents and Hugi status

## Goal and approved appearance

Make the Agents sidebar identify Hugi sessions by their raven and session title,
show their reported status, and group agents under their actual machines.
Lucas approved the layout and status treatment in this session and specified that
machine groups must be discovered, not hardcoded for Local and Gimle.

```text
 agents                         grouped

 ── Local ────────────────────────────
    Update agents sidebar     working
    Fix model picker             done

 ── Gimle ────────────────────────────
    Loki: improve retrieval     input
```

The example machine names and titles are illustrative, not an allowlist.
Use the existing Hugi Nerd Font raven U+EDEA, followed by one explicit space.

## Machine grouping and navigation

- Derive groups from the existing endpoint identities and labels. Any connected
  machine with visible agents appears automatically, including future machines.
  Group by identity, not display label: two identically named endpoints remain
  distinct groups.
- In grouped mode, render one separator/header per machine that has visible
  agents. Preserve existing endpoint order and agent order within each group.
- Use the endpoint's existing label, including its established local label;
  do not introduce hostname lists or machine-specific branches.
- Keep priority mode a flat urgency-sorted list and preserve agent-view filters.
  Do not silently override explicitly configured agent-view ordering to group it.
- Headers are not agents or selectable targets. Digit shortcuts, next/previous,
  pointer hit testing, scrolling and focus continue to address the correct
  endpoint-qualified agent. Account for header height in visibility calculations.
- Compact/collapsed mode keeps its existing space-efficient behavior. The
  expanded, local-only sidebar must still identify its machine consistently.

## Agent identity, icons and title

- Only confirmed Hugi sessions get the raven. Claude Code, Codex, OMP and
  uncustomized Pi sessions use distinct mascot/logo-like terminal glyphs.
- Resolve the icon from reported/detected agent identity, with an explicit Hugi
  profile marker overriding generic Pi presentation. Do not infer the agent
  product from its model/provider: a Hugi session using Codex is still Hugi.
- Prefer existing recognizable Nerd Font product glyphs. Where no suitable
  product glyph exists, use a recognizable monochrome approximation: Claude's
  asterisk/spark, a Codex/OpenAI-like mark, Pi's pi symbol, and an OMP-specific
  symbol or compact OMP wordmark. Approximations are not official logos.
- Unsupported/unknown agents get a neutral terminal/agent icon; do not assign
  them another product's logo. Keep icon selection centralized and extensible.
- Every icon is followed by one explicit space before the session title.
- Trace the current Pi integration and managed profile before choosing the
  identity signal. Reuse an explicit existing signal when available; otherwise
  report a Hugi-specific presentation marker from the managed profile using an
  existing metadata interface. Do not classify Hugi from a title substring.
- Prefer the session's reported title, with existing pane/session label fallback
  when it is empty. Never display an opaque session ID as the primary title.
- Existing sessions lacking the new marker retain their existing appearance
  rather than being guessed to be Hugi. Loading changed reporting code is a
  separate runtime adoption step.
- Session titles remain on the existing terminal/Herdr path; this change does
  not export them into the separate fleet reporting service.

## Status presentation

Keep each agent's identity glyph stable. Apply the same status treatment to
Hugi, Claude, Codex, OMP, basic Pi and fallback identities: status changes the
icon's color and the title's styling, with a short right-aligned text label.
Do not replace product icons with generic state icons or blink/animate.

| Reported state | Agent icon | Title | Label |
| --- | --- | --- | --- |
| Working | Theme blue | Normal brightness | working |
| Blocked, explicitly requesting input | Theme amber | Amber, bold | input |
| Blocked, no explicit input evidence | Theme amber | Amber, bold | blocked |
| Done | Theme green | Quieter | done |
| Idle | Muted | Muted | idle |
| Unknown | Muted | Dim | unknown |
| Stale/offline endpoint | Muted | Dim | stale |

- Use the existing theme palette rather than hardcoded RGB values.
- A focus background remains independent of status; selection must not erase
  status styling. Non-Hugi agents retain recognizable agent icons.
- Staleness takes precedence over cached working/done/input presentation.
- Do not infer completion from idle, blocked from silence, or successful task
  delivery from a completed agent turn. These labels represent reported state.
- Reserve width for the status label, truncate the title safely at terminal-cell
  boundaries, and preserve raven/title spacing at narrow sidebar widths.
- If the producer cannot distinguish input from blocked, render blocked. Do not
  fabricate a finer-grained state from a generic blocked event.

## Existing architecture and intended change boundary

Canonical configuration and reproducible patch sources are in
`configs/herdr/`; `scripts/build-herdr-client.sh` applies `client.patch` and
`pi-profile.patch` to the revision pinned in `client-build.env`.

The pinned client already has endpoint-qualified agent rows in
`src/client/shell/aggregate_navigation.rs`, machine labels in
`src/client/shell/endpoint_agents.rs`, and shared token/row rendering in
`src/client/shell/agent_sidebar.rs`. Extend those paths, with affected sidebar
layout/navigation paths and their existing tests. Add managed Pi reporting
changes only if needed for explicit identity/title metadata.

The nearby development checkouts already have modified files. Preserve those
edits; implement and qualify against a separate disposable copy of the exact
pinned source with the canonical patches applied. Capture reproducible source
changes back into the canonical patch, not just a development checkout.

## Acceptance checks

1. Render at least three synthetic endpoints, including an arbitrary new machine
   name, without configuration changes. Verify group labels, order, and that
   empty groups are absent; also cover duplicate machine labels.
2. Confirm Hugi gets `U+EDEA + space + title`; Claude, Codex, OMP and generic
   Pi each retain distinct identities, with a neutral fallback for unknown
   agents. Verify changing Hugi's model/provider does not change its icon.
   Cover missing titles/identity markers and explicit icon/title spacing.
3. Render all supported statuses and inspect glyph/title/label styles, focused
   rows, stale precedence and narrow-width truncation. Unknown stays unknown.
4. Exercise keyboard numbering, next/previous agent, scrolling and pointer
   selection across headers using endpoint-qualified IDs. Headers cannot focus.
5. Confirm priority ordering, configured agent-view behavior, non-Hugi agents,
   and collapsed mode do not regress.
6. Run affected existing Rust tests and the pinned build helper in build-only
   mode. Exercise the changed renderer with a representative fixture; a build
   alone is not visual or live-client acceptance.
7. Document exact verification and runtime adoption boundaries in
   `configs/herdr/README.md`. If managed Pi reporting changes, test it using the
   existing Pi test tooling without modifying live sessions or credentials.

## Non-goals and approvals

No new dependency, server protocol redesign, fleet collector, hardcoded machine
list, animation or session-state editing. No commit, push, installation, system
activation, server handoff/restart, browser reconnection or remote deployment is
authorized by this design. Build/test artifacts and source changes are separate
from installation and proof in Lucas's running client.

## Implementation sequence

1. Trace the identity/title producer and existing navigation/layout contracts;
   prepare an isolated pinned source tree with the canonical patches.
2. Add failing behavioral/rendering cases alongside each affected change, then
   implement dynamic groups and shared row status/title presentation.
3. Qualify any necessary managed Pi identity/title metadata changes separately.
4. Refresh canonical patches, verify clean application, run affected and pinned
   build checks, and record what is and is not proven in the README.

Self-review: no fixed machine roster; reported versus inferred state is explicit;
source, adoption and live proof are separate; unrelated edits remain preserved.
