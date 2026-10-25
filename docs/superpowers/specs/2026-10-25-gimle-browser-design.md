# Gimle browser migration

Lucas approved migrating Huginn's browser from Freyr to a dedicated Chrome profile
on Gimle, preserving safety boundaries. This is source-only approval: no browser,
tunnel or device will be started/reconnected by this change. No commits/pushes.

## Design

- Rename the restricted Pi extension/tool/skill to `gimle.ts`, `gimle_browser`,
  and `using-gimle-browser`. Keep owned app tabs, same-origin navigation,
  credential interaction refusal and no arbitrary JavaScript/profile access.
- Fixed local CDP endpoint `http://127.0.0.1:9444`, distinct from Freyr's 9333.
  No host/endpoint override, local-browser fallback or automatic service start.
- New `scripts/gimle-browser` uses verified management SSH to
  `gimle@gimle.tail3e4ba0.ts.net`. Dedicated remote profile:
  `~/.local/share/huginn-browser-gimle/profile`. Explicit Google Chrome executable,
  no discovery of ordinary profiles/tabs/cookies. Loopback debug port 9444 only.
- Helper requires explicit `start` to launch the dedicated browser and SSH tunnel;
  `status` is diagnostic; `stop` only stops the helper-owned tunnel/browser.
  Strict host-key verification; unknown host keys fail. No VNC/Xvfb installation,
  Rosetta, package installs, global settings or Freyr service changes.
- Canonical instructions/runtime/skill/tests/docs switch together. Generated
  `~/.local/share/huginn-pi/agent/AGENTS.md` is untouched. Relaunch through managed
  `pi --continue` to regenerate it and load the new extension/resource paths.

## Acceptance

Source tests must reject Freyr's old port and arbitrary HTTP/WebSocket endpoints,
retain credential guards, verify only Gimle is registered in isolated runtime
preparation, and exercise helper control flow using fake SSH/Chrome boundaries.
Run typecheck and relevant unit/integration checks without a real browser.
Real Chrome startup, screen sharing/login and an owned-tab interaction remain
explicitly unverified until separately approved activation after relaunch.
A green source test is not permission to use Gimle from the current Freyr-only
session. Public Hbit DNS work remains separate.

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
