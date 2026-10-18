# Observed OMP workflow parity

Audit: all 215 available prior parent JSONL sessions, 2026-09-03 through 2026-10-16, excluding this implementation session. Every file read successfully. Counts describe calls/outputs, not proof of successful use. `agent.db` command usage was read-only.

| Observed capability | Sessions | Selected replacement | Verification boundary |
| --- | ---: | --- | --- |
| Continuous advisor | 175 | pi-omplike-advisor with explicit role gate and narrow compatibility patch | Configured advisor made a separate loopback provider request; live model quality unverified |
| Subagents | 71 | pi-subagents; custom task/scout/reviewer/security-reviewer/sonic profiles | Scout foreground routing exercised; background and messaging not exercised |
| Agent messaging | 47 | pi-intercom plus subagents supervisor bridge | Native protocol differs |
| Background/interactive shell | 96 | pi-interactive-shell | PTY/dispatch exercise required |
| Browser API | 84 | dedicated Freyr CDP bridge built on pi-chrome-use transport | No browser/service reconnection without approval |
| Inline image content | 103 | native Pi terminal image support | Terminal-dependent |
| SVG output | 49 | bounded SVG display transformer and resvg rasterizer | Actual Markdown renderer and PTY Kitty transport exercised; no human pixel inspection |
| Mermaid output | 8 | native Pi Mermaid rendering | Actual Markdown renderer produced terminal diagram |
| Compaction | 55 | native Pi fallback plus pi-condense recoverable task-boundary pruning | Local summary/stub/recovery smoke; live cache/cost benefit unmeasured |
| LSP device | 69 | one lazy adapter runtime with rename/actions and after-write diagnostics | Real TypeScript cross-file rename, unused-import action and write diagnostic exercised; resource operations/command-only actions rejected |
| Todos | 174 | small native extension with session entries/widget | OMP phase schema differs |
| Interactive questions | 85 | native ask_user selector/input | OMP multi-question schema differs |
| Web search | 52 | pi-web-access, Exa-only initial routing, cookies prohibited | Provider response exercise required |
| Persistent evaluation | 142 | lazy persistent Python and JS workers with governed host-tool bridge | Globals/lexical state, await, read re-entry, errors, abort/reset/shutdown exercised; not a sandbox or OMP rich-object renderer |
| Session history helper | 13 | read-only omp_history plus native Pi session tree/resume | OMP sessions are not silently converted |
| Semantic code find | 120 | bounded local candidate collection plus task-model ranking; summary-role source summaries | Registered tools reached loopback providers; corpus bounds and path protections checked, not exhaustive vector search |
| Local source outlines (profile addition) | — | Deferred JS/TS AST declaration/member ranges with optional lazy parser | Registered SDK tool and missing-parser isolation tested; no Vue SFC or cross-file reference support |
| Cache telemetry report (profile addition) | — | `/cache-report` joins branch usage to bounded raw-field-presence observations by response ID | Real SDK command/loopback explicit-zero versus absent check; native miss estimates unchanged, live-provider/UI behavior unverified |

Command counters: switch133, model30, new32, resume18, mcp9, fast9, btw7, queue4, login4, extensions3, others1. `/model` and `/models` now configure saved roles, matching OMP's role-first distinction; `/switch` changes the active session only. `/plan` and `/commit` consume their saved roles for one turn and restore the prior selection; `/commit` proposes a message, not a git commit. Native `/login`, `/new`, `/resume`, `/mcp`, `/reload`, `/compact`, `/tree`, `/fork` remain available. Compatibility adds `/queue` and `/reload-plugins`; pi-btw supplies `/btw`. OMP `/fast`, `/ssh`, `/wt`, `/goal` are not replicated as commands; use explicit provider settings, the shell and native worktrees where appropriate. No fake aliases are provided.

OpenUI was evaluated from its primary README. It is a generative web UI framework, not a Pi terminal renderer. It is intentionally not installed; no frontend/server is needed for inline images, tables, Mermaid or SVG.

## Latest upstream comparison

Checked OMP [v18.12.1](https://github.com/can1357/oh-my-pi/releases/tag/v18.12.1), published 2026-10-17, against this profile. The approved persistent Python/JS eval, bounded model-ranked search/source summaries, LSP text refactors/write diagnostics and recoverable context pruning are now implemented above. Remaining missing/non-equivalent capabilities include rich OMP eval figures/objects, exhaustive semantic indexing, AST queries/staged codemods, resource-style LSP file operations and command-only actions, DAP debugging, time-travel stream rules, live collaboration, native retain/learn/recall memory backends, desktop/ACP control, atomic commit splitting, conflict:// resolution, the broad archive/PDF/notebook/SQLite/SSH/internal-URI filesystem, native review/annotate workflows, full Agent Hub steering/typed isolation and OMP's in-process shell/coreutils. Sources: [tagged README](https://github.com/can1357/oh-my-pi/blob/v18.12.1/README.md), release notes. The current read adapter covers issue:// and pr://, not every OMP URI scheme.

The approved high-relevance subset above is now implemented. Remaining upstream gaps are the other capabilities in the comparison, plus rich eval output and resource-style LSP actions. Native Pi compaction/tree/fork/resume are present; MCP sign-in and Freyr/Herdr validation remain integration acceptance gaps. The advisor package is not claimed equivalent to v18.12.1 advisor.continueSeverity.


## Normal command acceptance — 2026-10-17

The profile is now in canonical `configs/pi/`, and the reloadable shell maps plain `pi` to `scripts/pi-native`. The separate Homebrew executable is unchanged. The actual `pi update` command completed with the user-owned cache, setup, typecheck, tests and integration verification. A live print smoke returned `PI_PROFILE_HEALTHY` after correcting the Neo server-root API path to `/v1`.

The original 2026-10-17 acceptance had 24 passing tests. The approved capability upgrade is verified separately by the retained eval/retrieval/LSP/context/condense/compaction smokes and current verification.json. These checks do not establish live advisor quality, real Freyr/Herdr/MCP behavior, background messaging or full OMP parity. Freyr CDP was left unchanged. No comparative efficiency claim.

## Acceptance rules

A registered command is not exercised UI. A peer override is not compatibility proof. A passing typecheck is not a live advisor/browser/model request. A generated file is not an installed Herdr hook or activated Nix generation. Report each separately.
