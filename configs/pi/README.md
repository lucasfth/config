# Huginn native Pi profile

Canonical source: `~/config/configs/pi/`. The reloadable shell defines `pi` and `pi-native` as functions calling `~/config/scripts/pi-native`, so zsh recognizes them as commands. Existing shells need `omz reload`; a new interactive shell loads them automatically. `command pi` still selects the separate Homebrew executable. No OMP executable or provider configuration is replaced.

## Launch and update

```sh
omz reload
pi
pi update --check
pi update
```

The managed profile pins upstream Pi and its selected packages in `package.json`/`package-lock.json`. `pi update` updates the four native host packages together to one exact registry release, applies the tracked compatibility patches, then runs typecheck, tests and retained integration checks. If those checks fail, the previous manifests and locked dependencies are restored; failed restoration is reported explicitly. It does not run the global Homebrew updater.

The npm cache is `~/.cache/huginn-pi/npm`, not the root-owned shard in `~/.npm`. No sudo, recursive permission changes, `--force`, or global package replacement is needed. To install the profile's dependencies from scratch:

```sh
cd ~/config/configs/pi
npm ci --ignore-scripts --cache "$HOME/.cache/huginn-pi/npm"
npm run setup
```

Private settings, sessions and generated provider/MCP configuration live in `~/.local/share/huginn-pi/agent`; `PI_CODING_AGENT_DIR` overrides that location. These are not source files. Neo endpoint/key must be available to the launching shell. Optional Codex roles require native Pi login; OAuth refresh ownership is not copied from OMP. Mimer/TypeSafe roles require their own route/credentials.

Each launch regenerates settings from this checkout, retaining saved role choices. Canonical skills are included once; project-provided skill names take precedence. Project skill scanning stops at this checkout's repository root, so an enclosing checkout cannot hide a nested worktree's canonical skills. The isolated checks regenerate temporary state, not the live profile.

## Presentation and model commands

- OMP-style composer with model, path, branch, context and thinking level in its top border; no duplicate footer. Native cursor, paste, history and autocomplete behavior remain in the editor.
- User messages have a distinct dark block (light-theme equivalent included), while assistant replies retain the terminal background. Skill messages stay compact; tool panels include call/output borders and native diff/image/expansion rendering. Generated light/dark profile palettes follow terminal appearance. MCP errors remain visible.
- `/switch` opens searchable session-only selection; direct `/switch neo-proxy/gpt-6-luna:low` changes this session only.
- `/model` and `/models` configure saved roles/defaults, model and thinking level without changing the current session. A narrow tracked host patch lets the extension own `/model`; there is no editor-input rewrite.
- Task/scout/reviewer/security-reviewer/sonic use the task role. `/plan <request>` uses the plan role for one turn; `/commit <context>` uses the dedicated commit role to propose a message, never to create a commit. Both restore the prior session model/thinking after settling. Continuous advisor remains separate.
- The commit role is a requested profile addition; OMP's checked configuration declares default/plan/task, not a dedicated commit role.
- Input/tool images, SVG rasterization, numeric-table charts, native Mermaid and LaTeX retain their own terminal rendering paths.
- Unnamed sessions get a short topic title from the first substantive user message, persisted through Pi's native session-name API and displayed in the composer border. Greetings are skipped; existing names and `/name <title>` are preserved.
- Numeric tables, including percentage columns, render horizontal bars with a legend for multiple series. Mermaid `xychart-beta` categorical line/bar series render bounded terminal plots (up to 24 categories and four series), including negative values; malformed or unsupported syntax stays as source. Wide horizontal flowcharts retry the native vertical layout before falling back to source.
- GitHub `issue://2` and `pr://2` resolve directly through anchored `read`, against the current GitHub repository. Explicit owner/repo and PR diff views are supported. GitHub CLI handles authentication; no MCP lookup or separate model tool is required.

Charts, SVGs, diagram fitting and title naming run automatically as TypeScript event/render hooks. The model only emits normal content; it does not invoke `/visuals` to render it. Finalized visual transformations use a bounded 16-entry content/width/theme/image-protocol cache. Streaming, user and thinking text bypass visual processing. Muninn context is injected once per session; the configured advisor runs from lifecycle hooks. These callbacks are in-process, not separate worker threads. `/visuals` remains an optional diagnostic/demo command.

## On-demand code capabilities and context economy

- `eval` lazily starts session-scoped Python and JavaScript workers. Python globals and JavaScript lexical bindings persist across cells. JS supports top-level await. Host calls use `tools.read(path="README.md")` in Python and `await tools.read({path:"README.md"})` in JavaScript; they go through Pi's normal validation/hooks. `/eval-reset [py|js|all]` clears state. Timeout/abort terminates the interpreter and reports state loss. This is local-user code execution, not a sandbox; use `var` or fresh JS names to avoid lexical redeclarations.
- `semantic_code_search` uses bounded gitignore-aware local candidate windows, then the saved task model ranks snippets and returns paths/ranges/evidence. It is not an exhaustive vector index; narrow the path when the corpus exceeds limits. `summarize_read` uses the summary role and cites its exact source range; use raw anchored `read` before editing.
- LSP starts lazily. A pinned local TypeScript server backs cross-file symbol rename, code-action listing/application and automatic diagnostics returned after successful write/edit. Plain WorkspaceEdit text changes are applied only inside the project with bounds/overlap/stale-file checks. Resource create/delete/rename operations, snippet edits and command-only actions are rejected explicitly, not silently applied. Other language servers require explicit local configuration; automatic server installation stays off.
- `pi-condense@2.12.0` runs automatically at final-reply task boundaries for batches of at least 6000 characters; it also has a context-pressure trigger at 18% of the configured window (capped by the package at 300k tokens). The dedicated saved `summary` role defaults to Haiku with thinking off. Originals remain recoverable with `context_tree_query`; skills/core instructions and write/edit/todo/recall results are protected. Error purging is disabled. Five recent closed chains remain raw; range-summary fusion is off. Summary calls add latency and can disrupt provider prefix caching—no net speed/cost win is claimed without live measurements.
- Native compaction stays enabled as the fallback, with 30k recent tokens and a 300k context trigger for the three configured main/task/plan models. A small hook caps native summary output budgeting independently so the earlier trigger does not authorize enormous summaries.
- The direct core is read/bash/edit/write/grep/find/ls, subagent, todo/ask_user, codemode and tool_search. Browser/history/eval/LSP/web/interactive shell and administration schemas are deferred, still callable through discovery. Native codemode inline-schema budget is zero. Skill descriptions use a compact index, not full bodies. Required safety/project rules stay eager; prior notes are paths only and `memory_recall` fetches selected bodies.

All of this activates from the canonical profile on the next launch. It does not install a second harness, change the global Pi/OMP executable, or start remote services. The language workers and LSP are real local child processes, not prompt simulations.


## Verification

```sh
cd ~/config/configs/pi
npm run typecheck
npm test
npm run verify:integration
```

Latest repair verification runs from main `configs/pi`, not the earlier detached acceptance checkout. The gate covers singular `/model` role assignment in a PTY, `/switch`/Escape state, loopback plan/commit model routing and restoration, and real bash output rendering. `integration-terminal.mjs` retains separate `/tmp/pi-terminal-line-proof.{ansi,txt,png}`, `/tmp/pi-terminal-bar-proof.{ansi,txt,png}` and transcript captures. ANSI is captured from a real PTY; the PNG rasterizes xterm cells with their foreground/background colors. These are deterministic response fixtures, not live-model generation or pixel-identical Ghostty proof.

Compared with the supplied OMP screenshot: model/path/branch/context moved into the composer border, the duplicate footer is gone, user messages have a distinct dark block, and tool results have neutral boxed call/output sections. OMP's complete status segments, attachment cards and specialized tool layouts are not identical. Persistent eval, bounded semantic retrieval and LSP text refactoring now work; live model quality, MCP authentication and real Freyr/Herdr interaction remain separate acceptance gates.

The retained integration scripts use isolated private state and synthetic loopback credentials for model routing, RPC, terminal and renderer checks. They assert provider isolation, zero UI model requests, clean exit and actual image/chart/diagram output. Loopback provider responses test the harness, not live model quality. PTY capture does not establish pixel-perfect OMP appearance or human Ghostty/Herdr acceptance.

Acceptance provenance: the role/Escape, catalogue, typecheck and 26-test results above were run in detached `.worktrees/pi-acceptance`, based on `5df64bc`, with the main checkout's `configs/pi/` copied in, including installed dependencies and their compatibility patches. `runtime.mjs`, `integration-adversarial.mjs` and `integration-catalogue.mjs` were subsequently resynced. The canonical `herdr-config`, `sudo-ssh-freyr` and `sudo-ssh-mimer` SKILL.md files were also copied after their description metadata changed. These were main-source edits, not a worktree-only implementation. A final comparison found no profile-source differences, excluding `node_modules`, README and verification records; this was not a fresh dependency installation or a main-checkout acceptance run.

`integration-adversarial.mjs` launches this checkout's `launch.mjs` directly, never a shell alias. It asserts saved task-role persistence across an RPC restart, unchanged active models after role setup, invalid/cancelled RPC switches, and a literal PTY Escape. Summary flags are computed from captured states. Skills stay enabled; MCP is disabled only for this isolated UI check.

`node integration-catalogue.mjs` is a separate, rerunnable catalogue smoke using the existing OMP cache and temporary Pi state. It matches escaped full model IDs followed by provider/context metadata; truncated labels are reported as unverified, not counted. Exit zero means the smoke completed, not that every cached model had a whole-token visible row or accepts completion requests.

The retained whole-token run observed 58 of 60 cached model rows (JSON read from `/tmp/pi-catalogue-acceptance.json`). `nvidia/nemotron-3-super-120b-a12b` and `nvidia/nemotron-3-ultra-550b-a55b` remain unverified as exact rows because the picker truncates their labels. Cached catalogue size, exact rendered labels, and working inference endpoints are separate checks.

The default-startup capture used no launcher flags and temporary private state. It first stopped at `Trust project folder?`; accepting the highlighted project-only `Trust` option allowed the Huginn header to appear. The header then showed `MCP servers need attention` with Vercel and Supabase requiring sign-in. That run exited 0. Its capture did not exercise skill suggestions; the separate capture below did. The live profile was not regenerated by these checks.

A separate no-flag PTY capture visibly showed `skill:typesafe-ai` and `skill:herdr-config` autocomplete rows with their descriptions (`/tmp/pi-startup-skills.json`). It had MCP enabled and no skill collision/description diagnostics. That capture was stopped after observation; its clean exit is unverified.

For live MCP status, run `node launch.mjs mcp list --json` (put `mcp` first; a leading `--offline` makes it a prompt instead). Vercel and Supabase use Pi's separate OAuth store; `/mcp login vercel` and `/mcp login supabase` require browser approval. A sign-in warning is not a successful authenticated connection. The latest live check found both `needs-auth`, Muninn `failed` (`fetch failed`), and Company Library `connected`. No server was disabled or warning suppressed.

Retained handoff artifacts: `.worktrees/pi-acceptance` (detached, with copied sources/dependencies), `/tmp/pi-catalogue-acceptance.json` and `/tmp/pi-startup-skills.json` have **not** been removed. Temporary per-run agent directories and the throwaway startup probes were removed. The exact catalogue check remains rerunnable as `configs/pi/integration-catalogue.mjs`; startup captures are evidence, not a retained startup harness. `/tmp` evidence is ephemeral.

## Integration boundaries

Freyr retains its existing signed-in Chromium and SSH/CDP/VNC setup. `freyr_browser` only attaches to the dedicated existing loopback tunnel and owns its assigned tabs. It exposes snapshot/click/type/same-origin navigation/screenshot/close, not arbitrary page JavaScript or local browser/profile discovery. Login/2FA remains Lucas's Screen Sharing workflow. No browser reconnect/service start is automatic. SVG checks are bounded defense in depth, not a general-purpose untrusted SVG sandbox.

Native MCP supplies Muninn, Company Library, Supabase and Vercel access; Muninn injection uses the profile's generated configuration. Live services/authentication require separate acceptance. Herdr supports Pi, but its Pi hook is not installed here. Nothing in this profile activates Nix or deploys remotely.

## Maintenance and known differences

The profile carries narrow native-host patches for `/model` dispatch/autocomplete precedence and compact skill-message padding. User messages use native vertical padding and a separate background. `host-entry.mjs` runs the native unbundled host so these patches are effective; the global executable is untouched. Advisor/LSP compatibility patches remain required. `npm run setup` checks/applies the tracked patches and fails if they no longer apply.

This is not a full OMP replacement. Persistent eval, model-ranked bounded source retrieval and LSP text refactors are now implemented, but rich OMP eval objects/figures, exhaustive semantic indexing, rename-file resource operations, AST tools, Snapcompact, desktop/ACP/collab and exact command/UI equivalence remain outside this profile. Background messaging, live provider quality, real Freyr/Herdr interaction and MCP authentication are separate acceptance gates. See [parity.md](parity.md). No comparative speed or cost improvement is claimed.
