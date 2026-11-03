# Herdr Agents view implementation plan

Approved design: `../specs/2026-11-03-herdr-agents-view-design.md`.

## Scope and setup

Implement in the isolated pinned source checkout
`~/.cache/huginn/herdr-client/agents-view.3Lkz6f`, with canonical client/profile
patches applied. Preserve the nearby dirty checkouts and the unrelated Volundr
changes. No dependencies, protocol fields, installation or server lifecycle
changes. Commit/publication remain unapproved.

## 1. Product identity, title and status

- Extend `src/client/shell/agent_sidebar.rs` using existing `ClientShellAgent`
  metadata and palette. Keep explicit custom token layouts compatible; change
  default rows to a compact product-icon/title/status line. Fix unknown label.
- Add tests to `src/client/shell/tests/endpoints.rs` using `state_with_remote`,
  `ClientShellAgent`, `compose`, and buffer/hit-map assertions. First demonstrate
  failure for missing raven/title and status styles, then implement.
- Verify product distinctions, missing/blank titles, non-Hugi Pi, stale rows,
  focus background, narrow widths and terminal-cell-safe truncation.

## 2. Dynamic machine headers and navigation

- Extend `src/client/shell/endpoint_agents.rs` using endpoint-qualified rows.
  Count headers in row heights in both rendering and `reveal_endpoint_agent`.
  Never put headers in hit maps or keyboard target lists. No fixed name list.
- Apply consistent single-machine headers through
  `src/client/shell/agent_sidebar.rs` and its local sidebar call if needed.
- Add a three-endpoint rendering test with arbitrary/duplicate names and empty
  groups. Verify priority/custom views remain flat. Run the existing endpoint
  navigation, scroll, mouse and collapse tests and fix genuine regressions.

## 3. Managed Hugi presentation metadata

- Use the existing `pane.report_metadata` method to report a Hugi profile token
  and session title from managed Pi source. Keep the stock state hook as state
  authority. A presentation marker must not change the detected agent kind.
- Follow current Pi extension docs before implementing lifecycle hooks.
- Add tests using the existing Node/tsx test runner and a synthetic local socket;
  prove title refresh, TUI gating and no identity leakage to another session.
- Run targeted Pi tests, then the canonical Pi verification target as practical.

## 4. Reproducible artifact and checks

- Capture the isolated source diff (excluding the existing Pi discovery diff)
  into `configs/herdr/client.patch`. Verify both patches apply to a clean copy.
- Run affected Rust shell tests and integration asset tests. Use the existing
  build helper in build-only mode to prove clean application, integration tests,
  client shell tests and release build. Preserve failing command exit status.
- Exercise fixture composition through the actual client renderer and record
  its text/styles separately from unperformed live font/client acceptance.
- Update `configs/herdr/README.md` with the exact verified counts and adoption
  boundaries. Keep installation, live server metadata adoption and remote rollout
  explicitly unperformed. No rollback is needed for source-only edits; the prior
  installed client and all live agent sessions remain untouched.
