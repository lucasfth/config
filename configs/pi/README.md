<h1 align="center">Huginn</h1>

<pre align="center">

                    ⣀⣤⣶⣤⣄⣀
                  ⢀⣼⣿⣿⣿⣿⣿⠿⠛⠛⠂
                ⢀⣴⣿⣿⣿⣿⣿⣿⠁
              ⢀⣴⣿⣿⣿⣿⣿⣿⣿⣯
            ⢀⣴⣿⣿⣿⣿⣿⣿⣿⣿⣿⡏         █ █ █ █ █▀▀ ▀█▀ █▀█ █▀█
           ⣴⣿⣿⣿⣿⣿⣿⣿⣿⣿⡿⣹⠃         █▀█ █ █ █ ▄  █  █ █ █ █
        ⢀⠴⣻⣿⣿⣿⣿⣿⣿⣿⣿⣿⡿⠁⠁          █ █ ▀▀▀ ▀▀▀ ▄█▄ █ █ █ █
       ⣠⣴⠿⣛⣵⣾⣿⣿⣿⣿⣿⡿⠋
     ⠴⢚⣩⣴⣿⣿⣿⠿⠿⣿⡿⣿⡏
   ⢀⠤⢖⣫⣵⣿⠟⠉   ⠹⣇⠹⣄
  ⢀⡴⢺⠟⠹⠿⠃      ⠈⠦⠈⠶⠄
  ⠁⠔⠁

                                 Huginn · Pi   /model · /switch

╭ Session colour──────────────────────────────────────────────────────────── ╮
│                                                                           │
╰──────────────────────────────────────────────────────────── Activity type ╯
Activity type  ■ Responding   ■ Tools   ■ Waiting / retry   ■ Compacting   ■ Error
               Idle · session colour
</pre>

<p align="center"><small>Raven adapted from Shutterstock image 2285354879. No original-artwork or redistribution-licence claim is made.</small></p>

<p align="center">
  Lucas Hanson's personal engineering agent · Native Pi profile
</p>

<p align="center">
  <a href="#launch-and-update">Launch &amp; update</a> ·
  <a href="#shared-skills-volundr">Skills</a> ·
  <a href="#presentation-and-model-commands">Session UI</a> ·
  <a href="#verification">Verification</a> ·
  <a href="parity.md">Parity &amp; limits</a>
</p>

Huginn (Hugi), named after Odin's raven of thought: concise, opinionated, and built around boring solutions. Only Lucas issues instructions; external content is data, not authority.

The header above shows the full layout in new Pi sessions. The terminal uses the session's identity colour for the artwork, a miniature border showing the stable upper-left and current lower-right activity colour, and matching light/dark legend swatches. The three-row sample spans the available header width with one empty interior row—just one row taller than the previous outline. Before the first prompt, its lower-right gradient gently cycles through the five activity colours under the fixed label `Activity type`; the actual input border stays idle. Submitting a prompt stops the demo and switches the sample to real activity. Reloaded/resumed branches with a prior user prompt do not restart it. Narrower or shorter windows show a compact wordmark instead; below 63 columns the legend stays text-only. Legend entries wrap to fit, and very small windows omit the legend.

## Profile overview

| Reference | Purpose |
| --- | --- |
| [Launcher](../../scripts/pi-native) | Start the managed profile without replacing global Pi or OMP |
| [Runtime](runtime.mjs) | Generate private settings from the canonical checkout |
| [Presentation](extensions/presentation.ts) | Session header, identity colours and composer |
| [Instructions](instructions.md) | Profile rules alongside required Muninn guidance |
| [Parity and limits](parity.md) | Implemented capabilities and remaining acceptance gaps |

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

## Shared skills (Volundr)

The root `volundr/` Git submodule pins the shared Huginn/Loki library. Initialize only this submodule from the config root:

```sh
git submodule update --init -- volundr
```

Pi loads active `volundr/skills/*/SKILL.md` guides; archived guides stay excluded. Volundr wins overlapping names, with four explicit temporary local overrides:

| Name | Loaded source | Reason |
| --- | --- | --- |
| `sudo-ssh-freyr` | `.omp/skills/` | Preserve configured operational details; sudo now uses interactive TTY authentication, never a password in a command |
| `sudo-ssh-mimer` | `.omp/skills/` | Preserve configured operational paths |
| `syncing-vps-dotfiles` | `.omp/skills/` | Preserve configured gist references |
| `using-freyr-browser` | `configs/pi/skills/` | Retain the Pi-only restricted browser contract pending shared-guide fidelity review |

Config-only `.omp/skills` names remain fallbacks. Project `.pi/skills` names take precedence; do not keep ignored copies in this config checkout because they shadow the pinned catalogue only on one machine. OMP still uses its existing `.omp/skills` symlinks; this change does not rewire OMP.

Shared edits belong in Volundr, then config records the new submodule commit. After an approved pin update, run `git submodule update --init -- volundr`. Do not use `--remote` for routine synchronization: it bypasses the pin. Loki reads active packages from its own checkout at the same commit via Hermes `skills.external_dirs`; see `volundr/docs/hermes-consumer.md`. Updates are explicit, not automatic. Shared TypeSafe now carries the corrected Noul semantics and experimental image contract; runtime secrets and adapters remain local.

Each new Pi launch reads the pinned tree; running sessions are not restarted. Tests use temporary state and do not regenerate the live profile.

### After-action reviews

Use `/aar [focus]` for the combined after-action review and daily Muninn record. The prompt loads the shared `aar` skill; approval to review is not approval to apply fixes, publish, or deploy.

OMP’s `.omp/skills/aar` is a compatibility mirror of `volundr/skills/aar`. `skill-mirrors.json` documents the mirror and its empty body-exception list. `node --import tsx --test aar.test.mjs` checks body/reference fidelity and the native `/aar` expansion; it does not prove agent compliance or a successful Muninn write. Keep notices and source attribution with both copies.

### Session environment and context retro

Use `/retro [focus]` for a Huginn-only, proposal-only review of session friction and context bloat. This fills the previously reserved command; it is not an AAR alias and does not write to Muninn. The prompt loads [huginn-retro](skills/huginn-retro/SKILL.md) explicitly. The skill stays out of automatic model discovery, so neither its description nor body adds normal eager context. No Loki/shared-library changes or automatic hooks are installed.

It audits tools, navigation, disconnected checks, duplicate/irrelevant eager guidance and oversized on-demand retrieval. Output is zero to three candidates with session evidence, cause/confidence, canonical target, proposed change, verification and trade-offs. Measurements and estimates must be distinguished; one unused safety rule is not evidence that it should be deleted. Applying a candidate requires separate approval.

`node --import tsx --test aar.test.mjs retro.test.mjs` checks independent native routing, default/focused/quoted arguments, singular explicit-only skill loading and repeated runtime preparation without losing custom prompts. These checks establish plumbing, not model compliance. Trial the skill on actual session evidence separately; a same-agent trial is not independent validation.

New profile launches regenerate these explicit resource paths. An already-running profile must launch again (for example `pi --continue`) to register them; `/reload` alone cannot discover a resource omitted from its existing settings. No system activation or service restart is required.

## Shell commands

Type `!gst` (or any shell command) to run it without querying the model. `!!gst` also excludes its output from model context. The profile's `user-shell.ts` hook runs these commands with `zsh -ic`, loading your normal `.zshrc`, aliases and functions. Each command uses a fresh shell in the current project; it does not share unsaved shell state or persist `cd` between commands. Pi's streaming output, cancellation and exit codes are retained. The model's `bash` tool stays non-interactive Bash.

Existing sessions need a new profile launch (`pi --continue` to resume); launch regenerates the extension list from `runtime.mjs`. No Nix rebuild is needed. Verify the path with `node --import tsx --test user-shell.test.mjs` and `node integration-user-shell.mjs`.

## Presentation and model commands

- Startup header: Lucas's selected Braille raven beside the unchanged three-row block HUGINN wordmark, both using the real session identity colour. The artwork and command hints remain 63 columns × 15 rows and require a terminal at least 63 columns × 30 rows; lettering and hints start at column 33 (zero-based). A full-width, three-row sample composer and wrapping `Activity type` legend follow (19–20 total header rows at full-artwork widths). The sample labels the stable upper-left session colour and current lower-right activity colour, using the composer's state and diagonal gradient; its single interior row stays empty (no placeholder). Below 63 columns, a blank row and muted separator replace the sample. Narrower/shorter windows use HUGINN/HUGI (four artwork rows); terminals below 16 rows use one-line `Huginn · Pi`/`Hugi`. The legend appears from 40 columns × 20 rows only when at least eight rows remain outside the header. Swatches share the composer's exact light/dark activity colours; labels stay muted. The bird is converted from Lucas's supplied reference (Shutterstock image 2285354879); no original-artwork or redistribution-licence claim is made. This custom header intentionally replaces Pi's built-in logo/changelog header; it has no artwork service, font generator or network dependency at startup.
- OMP-style composer with model, repository, branch, context and thinking level in its top border; no duplicate footer. Git checkouts show the repository name (also from subdirectories); linked worktrees show `ecoray-web (wt:3002)`. Outside Git, the home-abbreviated path remains. Repository identity is resolved once per session setup with bounded Git calls, never during rendering. The right-hand session description uses spare space beyond half the border when the left label is short; overflow is marked with an ellipsis. While the main agent works, Pi's native Braille spinner replaces the left-hand idle icon instead of adding a trailing `working` label. Retry/compaction status keeps its explanatory text. Native cursor, paste, history and autocomplete behavior remain in the editor.
- User messages have a distinct dark block (light-theme equivalent included), while assistant replies retain the terminal background. Skill messages stay compact; tool panels include call/output borders and native diff/image/expansion rendering. Generated light/dark profile palettes follow terminal appearance. MCP errors remain visible.
- `/switch` opens searchable session-only selection anchored at the bottom of the terminal, with a one-row margin; filtering keeps its lower edge fixed. Direct `/switch neo-proxy/gpt-6-luna:low` changes this session only.
- `/model` and `/models` configure saved roles/defaults, model and thinking level without changing the current session. A narrow tracked host patch lets the extension own `/model`; there is no editor-input rewrite.
- Task/scout/reviewer/security-reviewer/sonic use the task role. `/plan <request>` uses the plan role for one turn; `/commit <context>` uses the dedicated commit role to propose a message, never to create a commit. Both restore the prior session model/thinking after settling. Continuous advisor remains separate.
- The commit role is a requested profile addition; OMP's checked configuration declares default/plan/task, not a dedicated commit role.
- Input/tool images, SVG rasterization, numeric-table charts, native Mermaid and LaTeX retain their own terminal rendering paths.
- On macOS, **⌘V** pastes clipboard images as compact `[img1]`, `[img2]` composer tokens; Ctrl+V remains available. Backspace/Delete treats each attachment as one item, and undo restores its image mapping. Only explicitly registered images are loaded by the input hook; ordinary `[img1]` text stays literal. A tracked Pi-TUI patch keeps image state separate from large text pastes. A zero-width internal discriminator is stripped from terminal output and expanded to the image path before submission; the provider receives actual image content, not just a path. Existing sessions need a fresh profile launch to load the generated keybindings and hook.
- Verification separates the paths: Lucas confirmed physical ⌘V inserted an image in a disposable Ghostty/Pi window before compact labels were added; the final compact composer and PNG provider submission passed `integration-images.mjs` with a synthetic image. Physical ⌘V on the final compact-label build and text-only physical ⌘V were not repeated.
- Unnamed sessions get a topic title of up to 120 terminal columns from the first substantive user message, persisted through Pi's native session-name API and displayed in the composer border. Greetings are skipped; existing names and `/name <title>` are preserved. Previously shortened saved names are not automatically expanded. Reload extensions or launch a new profile process to load composer/title source changes; no Nix rebuild is needed.
- Numeric tables, including percentage columns, render horizontal bars with a legend for multiple series. Mermaid `xychart-beta` categorical line/bar series render bounded terminal plots (up to 24 categories and four series), including negative values; malformed or unsupported syntax stays as source. Wide horizontal flowcharts retry the native vertical layout before falling back to source.
- GitHub `issue://2` and `pr://2` resolve directly through anchored `read`, against the current GitHub repository. Explicit owner/repo and PR diff views are supported. GitHub CLI handles authentication; no MCP lookup or separate model tool is required.

Charts, SVGs, diagram fitting and title naming run automatically as TypeScript event/render hooks. The model only emits normal content; it does not invoke `/visuals` to render it. Finalized visual transformations use a bounded 16-entry content/width/theme/image-protocol cache. Streaming, user and thinking text bypass visual processing. Muninn context is injected once per session; the configured advisor runs from lifecycle hooks. These callbacks are in-process, not separate worker threads. `/visuals` remains an optional diagnostic/demo command.

### Advisor supervision

The advisor remains a continuous supervisor, with severity-aware delivery:

- Nits and concerns stay visible and enter model context, including the next user prompt when received while idle. They do not restart a finished agent.
- Verified blockers may request a corrective continuation, including after a final answer. At most one such interruption is allowed until a new user prompt or primary tool result; an advisory-only reply cannot rearm it. Escape-aborted runs are not restarted.
- Stable issue identifiers deduplicate rewordings. Escalation remains possible; repeated blockers require new primary activity and changed concrete evidence (for example, an inadequate fix or continued risky action).
- Reviews run in the background without the upstream 15–120-second catch-up waits. A final answer can therefore precede a late finding; a blocker may still trigger its bounded follow-up. This is not a synchronous safety gate or a guarantee that every defect is caught before an action.
- The supervisor prompt forbids status/all-clear spam, invented approval gates and relitigating Lucas's accepted trade-offs without materially new evidence.

Implementation: `extensions/advisor.ts` plus `patches/pi-omplike-advisor-supervision.patch`, applied idempotently by `npm run setup`. Start a fresh profile process or reload extensions to use the changed code; existing sessions are not automatically restarted. An explicit runtime `system-prompts/advisor.md`, if present, overrides the bundled prompt.

`node integration-advisor.mjs` exercises the real extension and Pi session against a deterministic loopback provider: deferred idle advice reaches the next provider request, primary settlement does not wait for routine review, blockers can request follow-ups, and advisory-only replies cannot form an unbounded restart chain. It does not establish live-model severity judgment or physical UI acceptance.

## On-demand code capabilities and context economy

- `eval` lazily starts session-scoped Python and JavaScript workers. Python globals and JavaScript lexical bindings persist across cells. JS supports top-level await. Host calls use `tools.read(path="README.md")` in Python and `await tools.read({path:"README.md"})` in JavaScript; they go through Pi's normal validation/hooks. `/eval-reset [py|js|all]` clears state. Timeout/abort terminates the interpreter and reports state loss. This is local-user code execution, not a sandbox; use `var` or fresh JS names to avoid lexical redeclarations.
- `semantic_code_search` uses bounded gitignore-aware local candidate windows, then the saved task model ranks snippets and returns paths/ranges/evidence. It is not an exhaustive vector index; narrow the path when the corpus exceeds limits. `summarize_read` uses the summary role and cites its exact source range; use raw anchored `read` before editing.
- `source_outline` returns local AST declaration/member ranges for one JS/TS file, without a model call or index. Files are limited to 256 KiB and results to 200 symbols; workspace escapes are rejected. TypeScript is loaded only when called. Production-only installs without the dev parser keep loading normally, but the tool asks for a full `npm ci`. It does not parse Vue SFCs, resolve references or supply edit anchors.
- `/cache-report` shows input/output and cache-read/write tokens for the latest 20 assistant messages on the current branch. Zero cache counts require an explicit raw usage field matched by response ID; otherwise they are unknown. Positive normalized counts remain evidence. The observer separately retains 20 response IDs, including nested responses: eviction can make a message's zero counts unknown even within the report's 20-message window. A fresh process, reload or session replacement also loses raw-field presence. ID-less deltas cannot establish explicit-zero evidence. Miss estimates and compaction handling remain Pi's native `showCacheMissNotices`; no duplicate alerts or custom miss calculations are added. Nested model-call usage and cache warming are excluded from the report. Reports use UI notifications when available, stdout otherwise, and never call the model.
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

The composer uses a stable session-ID-derived Catppuccin identity colour at the upper-left, including the native spinner/model label. Its border blends diagonally toward the lower-right activity colour: blue for model work, peach for running tools, amber for retry or a blocking input/approval dialog, mauve for compaction/branch summary, and red for an actual model/run error. Normal settlement/cancellation restores the uniform session colour; terminal errors remain until new work or a successful recovery. Recoverable tool failures do not turn the session red. Overlapping/nested tools and blocking prompts are counted independently. Context usage stays numeric; colour does not claim effort, progress or output quality. Identity uses six swatches, so different sessions can share a colour.

`integration-spinner.mjs` observes the real fixture session ID and checks exact upper-left/spinner/label identity, top-right midpoint and lower-right model/tool endpoints, plus uniform idle restoration and native animation. Both dark and light runs are included in `verify:integration`; captures are `/tmp/pi-spinner-{dark,light}-proof.{ansi,txt,png}`. Sampling excludes half-painted PTY frames by requiring complete corner glyphs; colour assertions remain exact. PNGs rasterize captured terminal cells, not Ghostty screenshots. Retry/compaction holds, blocking prompts, tool overlap and terminal error/recovery also have focused renderer tests. Reload the profile or start a fresh Pi process to load source changes; no live session was restarted by these tests.

The same dark/light PTYs check actual startup raven rows, the unchanged HUGINN wordmark at column 33, session-colour parity, all five exact activity-colour legend swatches and a visible composer in a 30-row window. They also check the full-width sample's startup demo animation, unchanged idle composer, real typed-input event, switch to live idle/model/tool endpoints, only real activity colours after the submitted-input event, no resumed demo after settlement, and a visible composer with the extra interior row. Mock-clock tests verify timer cleanup on submitted input, agent start, session replacement and shutdown; renderer fixtures with a prior user message skip the demo (not a real-host resume acceptance). Header captures are `/tmp/pi-header-{dark,light}-proof.{txt,png}`; the PNG is a rasterized terminal-cell proof, not a Ghostty screenshot. Renderer tests exhaust widths 0–160 at multiple heights and assert the exact 63×30 artwork boundary, wrapped legends and compact fallbacks. `integration-ui.mjs` checks bottom placement when the picker opens, filters and reopens, plus model selection and Escape cancellation; captures are `/tmp/pi-switch-{open,filtered,reopen}-proof.{txt,ansi}`.

The spinner fixture additionally instruments an isolated copy of the real presentation source to emit invisible demo-timer state markers (no production event, caption change or runtime instrumentation). Every post-submit frame must report the timer absent. `PI_SPINNER_TEST_KEEP_DEMO=1 node integration-spinner.mjs` deliberately disables cleanup only in that fixture and must fail at `demo timer must be absent in every post-submit sample`; normal dark/light runs must pass.

Known native Pi 1.3.0 limit: `wordWrapLine` recurses until a RangeError when a single wide grapheme cannot fit the content width. The padding-2 emoji reproducer fails at terminal widths 1, 2, 3 and 5, with focus both on and off; widths 4 and 6–8 render. Renderer tests record this native limit and check the gradient at supported widths. No placeholder substitution or narrow-pane compatibility patch is shipped. Extremely narrow panes containing wide emoji remain unsupported; normal-width colour PTYs do not establish resize recovery.

Option–Backspace has an explicit ESC+DEL binding in `configs/ghostty/config`, without globally changing Option into Alt (which would affect Danish special characters). `keyboard.test.mjs` guards the source binding and native legacy/Kitty word deletion; it does **not** capture physical Ghostty/Herdr input. The approved 2026-10-19 activation succeeded; deployed source parity, validation and effective/listed Ghostty bindings passed. Lucas confirmed word deletion works after Ghostty config reload. Whether that test included Herdr was not established; physical raw-byte captures were not performed.

`node integration-discovery.mjs` (included in `verify:integration`) exercises the registered outline tool and `/cache-report` through the real SDK with deterministic loopback responses. It distinguishes explicit zero from absent cache telemetry and checks that neither operation adds a model request. It does not establish live-provider cache behavior or terminal UI acceptance.

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

Vercel persistence repair (2026-10-19): the live credential file survived restarts, but its token had only `openid` scope, expired after one hour, and contained no refresh token. Vercel's resource metadata advertises only `openid`; its authorization server also supports `offline_access`. `runtime.mjs` now defaults the standard Vercel endpoint to `oauth.scope: "openid offline_access"`, preserving explicit scopes, callback settings, custom endpoints and the OAuth credential file. A regression checks repeated profile generation and byte-for-byte credential preservation. Start Pi through the launcher again to generate the updated config, then run `/mcp login vercel` and approve consent once. Real issuance/persistence of a refresh token and successful renewal after expiration remain **unverified until that sign-in**; passing config tests does not establish a working live refresh.

Retained handoff artifacts: `.worktrees/pi-acceptance` (detached, with copied sources/dependencies), `/tmp/pi-catalogue-acceptance.json` and `/tmp/pi-startup-skills.json` have **not** been removed. Temporary per-run agent directories and the throwaway startup probes were removed. The exact catalogue check remains rerunnable as `configs/pi/integration-catalogue.mjs`; startup captures are evidence, not a retained startup harness. `/tmp` evidence is ephemeral.

## Integration boundaries

Freyr retains its existing signed-in Chromium and SSH/CDP/VNC setup. `freyr_browser` only attaches to the dedicated existing loopback tunnel and owns its assigned tabs. It exposes snapshot/click/type/same-origin navigation/screenshot/close, not arbitrary page JavaScript or local browser/profile discovery. Login/2FA remains Lucas's Screen Sharing workflow. No browser reconnect/service start is automatic. SVG checks are bounded defense in depth, not a general-purpose untrusted SVG sandbox.

Native MCP supplies Muninn, Company Library, Supabase and Vercel access; Muninn injection uses the profile's generated configuration. Live services/authentication require separate acceptance. When launched inside a Herdr pane, `runtime.mjs` runs that pane’s `HERDR_BIN_PATH integration install pi` (falling back to `herdr` on PATH), targeting the selected `PI_CODING_AGENT_DIR`. This installs/refreshes Herdr’s version-matched native Pi hook; Pi discovers it from the private extensions directory. Installation errors warn without preventing Pi startup. Outside Herdr no installer runs. The hook reports session references and working/idle state, and supports `herdr:blocked` events; it ignores RPC/JSON/print sessions so headless children cannot overwrite the pane’s state. Already-running Pi sessions need `/reload` after the hook has been installed, or a fresh `pi --continue` launch. Herdr’s config reload does not reload Pi extensions. No Herdr/server restart or Nix rebuild is required. `npm run verify:herdr` requires an installed Herdr binary and exercises its real installer/hook through an isolated interactive Pi PTY and fixture socket, checking idle → blocked → idle → working → idle plus session references; it does not prove the live sidebar or automatic emission of blocked events by every dialog. Nothing in this profile activates Nix or deploys remotely.

## Maintenance and known differences

The profile carries narrow native-host patches for `/model` dispatch/autocomplete precedence and compact skill-message padding. User messages use native vertical padding and a separate background. `host-entry.mjs` runs the native unbundled host so these patches are effective; the global executable is untouched. Advisor/LSP compatibility patches remain required. `npm run setup` checks/applies the tracked patches and fails if they no longer apply.

This is not a full OMP replacement. Persistent eval, model-ranked bounded source retrieval, local JS/TS outlines and LSP text refactors are implemented, but rich OMP eval objects/figures, exhaustive semantic indexing, rename-file resource operations, general AST queries/codemods, Snapcompact, desktop/ACP/collab and exact command/UI equivalence remain outside this profile. Background messaging, live provider quality, real Freyr/Herdr interaction and MCP authentication are separate acceptance gates. See [parity.md](parity.md). No comparative speed or cost improvement is claimed.

Historical activity-border verification (2026-10-19): focused unit tests, TypeScript, presentation rendering, dark/light activity PTYs and terminal checks passed, but the full integration gate stopped at the old 14,399-character skill-index budget. That failure is superseded by the verified update below.

Pi 1.4.0 update (2026-10-22): all four native host dependencies are pinned to 1.4.0. `scripts/pi-native update` passed setup, typecheck, all 104 tests and the complete retained integration suite. Lucas approved an absolute 48,000-character discovery-metadata cap after measuring 45,730 characters for 222 skills; skill bodies remain loaded on demand and unchanged. The repo-owned `pi-coding-agent+summary-budget.patch` caps requests through the shared native summary helper at 13,107 tokens independently of the automatic compaction threshold, because Pi 1.4 otherwise uses the model's full output limit. The compaction integration measured `summaryMaxOutput: 13107` and retained the 300,000-token automatic threshold; turn-prefix and branch-summary behavior were not separately exercised. These are isolated SDK/provider/PTY checks, not fresh live-provider or human UI acceptance.

Fresh interactive Zsh resolves `pi` and `pi-native` to the managed launcher; both report 1.4.0. The separate global `/opt/homebrew/bin/pi` also reports 1.4.0, but does not carry this profile's patches. Use normal `pi` for Huginn. Already-running processes retain their loaded version; exit and run `pi --continue` to resume under 1.4.0. The updater keeps verified rollback for future failed updates; this update does not disable that protection.
