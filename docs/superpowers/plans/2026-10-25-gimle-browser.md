# Gimle browser source migration

Goal/design: `../specs/2026-10-25-gimle-browser-design.md`. Operator approved the
source migration. No live profile generation, browser/tunnel startup, remote
helper invocation, DNS changes, commits or Nix activation.

1. Add a failing source/runtime test for the new Gimle-only registration, port
   9444 and skill. Rename the existing restricted extension/test/skill and update
   canonical runtime, instructions, isolated integration references and docs.
   Preserve credential guards and dedicated-tab lifecycle. Add explicit WS
   endpoint tests as the CDP connection must never follow an alternate endpoint.
2. Add `scripts/gimle-browser` with strict fixed SSH destination, dedicated remote
   Chrome profile, loopback port 9444, explicit start/stop and diagnostic status.
   No software install or user profile discovery. Unit-test helper flow with fake
   SSH/net commands only. Verify syntax; never invoke it against Gimle this turn.
3. Run Pi typecheck, focused/full unit suite and isolated affected integrations.
   Verify generated temporary runtime uses the new instructions/tool/skill and
   excludes Freyr. Preserve unrelated in-progress checkout changes.
4. Document `pi --continue` relaunch and separate activation approval. State live
   proof pending. Rollback is reverting only these source changes then relaunching;
   no existing Freyr infrastructure is modified or stopped.

## Executed source verification

- Migration test failed first on the missing Gimle extension registration, then
  caught the still-selected shared Freyr skill. Pi excludes that old guide now;
  shared/OMP sources are unchanged.
- Helper tests failed before the helper existed. A later ownership regression
  reproduced acceptance of port 94440 by the prefix match. Fixed with exact
  full-command equality; fake stop tests now reject wrong profile/port/trailing
  arguments and reused PID. No real browser process was signalled.
- WebSocket validator test failed on the missing export, then passed with the
  connection path using the validator. Freyr port 9333 remains a negative test.
- `npm test`: 148 passed, zero failures. `npm run typecheck`: passed.
- `integration-context.mjs`: actual isolated SDK registered `gimle_browser` as
  deferred; `integration-adversarial.mjs`: one Gimle skill, zero startup errors,
  zero model requests; `integration-ui.mjs`: exit 0, zero model requests/errors.
- `bash -n scripts/gimle-browser` and `git diff --check`: passed.
- All generated profile tests used temporary agent directories. Live instructions,
  existing Freyr services, and Gimle browser/tunnel remain untouched. No helper
  invocation against Gimle (including status), no Chrome install, DNS, commit,
  push, staging or Nix activation. Live macOS readiness and owned-tab UI proof
  remain pending separate approval and a managed Pi relaunch.

## Subsequent activation and public tool naming

Lucas later approved activation with “go”. The dedicated Gimle Chrome and
loopback 9444 tunnel started successfully; an owned https://example.com tab
was opened, read and closed via the then-loaded `gimle_browser` tool. Freyr
services/tunnels remained untouched. No DNS-provider login was attempted.

The setup session then relayed Lucas’s approval to name the restricted tool
`loki_browser` while retaining Gimle as host. Source, instructions, skill and
registration tests now use `loki_browser`. File paths `extensions/gimle.ts` and
`skills/using-gimle-browser`, helper `scripts/gimle-browser`, port 9444, remote
profile and existing tunnels are unchanged. No new activation or publication
is authorized by this rename. Live profile instructions/name need a managed
relaunch; registration can be verified in an isolated SDK fixture meanwhile.

Rename verification: failing migration-policy check observed before implementation;
then 148/148 unit tests, TypeScript typecheck, focused helper/validator tests and
`integration-context.mjs` passed. The isolated SDK registers only `loki_browser`,
not `gimle_browser` or `freyr_browser`. `git diff --check` passed. No helper
invocation or live profile refresh performed during this rename.

## Same-tab cPanel handoff (subsequent approved scope)

Lucas asked for the tool to complete cPanel navigation and future requested DNS
updates, then explicitly approved the same-tab handoff proposal with “then do it”.
This scope changes the existing extension, tests, local browser skill and README.
It does not authorize a particular DNS target value, unrelated records, credentials,
public routing, commits or browser/tunnel restarts.

- Red: three focused checks failed on missing handoff/page-state exports.
- Green: same-tab selection, HTTPS/origin validation, browser mouse input, no
  unrelated-target calls, original ownership plus explicit handoff destination,
  login/2FA refusal, and session-URL redaction pass focused tests.
- Snapshot URLs redact `/cpsess…` and omit query/fragment. Presence/visibility
  checks never read credential field values. Authenticated cPanel app paths are
  usable; an actual login/challenge page is not.
- Update only the selected anchor target, never enumerate/adopt existing tabs.
  Use `follow_link` with the expected bare HTTPS destination origin.
- The loaded extension/schema needs `/reload`; this resets tab bookkeeping.
  Open a fresh named Nordicway tab afterward, with no infrastructure restart.
- Pending live proof: exact Nordicway anchor selection, completed SSO in the owned
  tab, authenticated cPanel/Zone Editor, and requested DNS readback/propagation.
  No DNS changes made during implementation.

Handoff verification: `npm test` passed 153/153; `npm run typecheck` passed;
`integration-context.mjs` passed; `git diff --check` passed. Focused browser tests
passed 10/10, including refusing unrelated origins/credential pages and allowing
the explicitly assigned authenticated cPanel origin. All handoff tests used fake
CDP/page fixtures; no live cPanel handoff, DNS edit, extension reload or browser
restart has been performed. The running session still advertises the old schema
without `follow_link`; use `/reload`, then open a fresh named app tab for live proof.

Live attempt after operator continuation: opened authenticated Nordicway customer
dashboard in owned tab `hbit-cpanel-handoff`. `follow_link` refused the selected
anchor before sending any mouse event; cPanel handoff remains unverified. Two
selectors were tried, neither progressed. The generic refusal did not identify
which check failed. Added whitelisted fixed-reason diagnostics (never return href,
attributes or raw page exceptions). Red test reproduced missing diagnostic;
then 11 focused tests, 154/154 full tests, typecheck and diff-check passed.
This diagnostic addition requires another extension reload before live diagnosis.
No DNS changes, login interaction, browser/tunnel restart or public Hbit claim.

## Native control discovery and clicks

Lucas explicitly requested ordinary human-like browser clicking and a working
solution rather than more selector guesses. Implemented visible-control snapshot
metadata (structural selectors, role and visible label only; no href/input value),
and browser mouse input for ordinary clicks. Targets must be unique, visible,
uncovered and noncredential. Popup-target/download controls are refused; use the
explicit same-tab handoff. No arbitrary coordinates/caller JavaScript or unrelated
tab adoption was added. Existing credential, app-origin and token-redaction guards
remain. The diagnostic failure was exact-link selection, not a confirmed origin
or login issue; no click was sent on those failures.

Red: new control-discovery/native-click tests failed on missing metadata/DOM-click
behavior. Green: 14 focused browser tests, 157/157 full tests, typecheck, isolated
integration-context and diff-check passed. No live activation/restart/DNS edit.
Required next check: `/reload`, open fresh named Nordicway tab, use the cPanel
control's exact snapshot selector, follow to confirmed cPanel origin, then inspect
the actual result. Neither cPanel navigation nor public Hbit is complete yet.
