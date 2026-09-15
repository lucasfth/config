# Muninn MCP Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every Huginn local-vault read and write with automatic session context retrieval and retrospective persistence through Muninn MCP.

**Architecture:** A new OMP hook initializes the Muninn streamable-HTTP MCP transport, composes the existing `vault_read` and `vault_list` tools into the current tech-document and five-session-note context payload, then injects it before the model responds. `retro` uses the existing `vault_read`/`vault_write` tools to replace the daily remote note with its appended content. The tracked `.omp/agent` tree remains the source, then is copied to the live `~/.omp/agent` tree.

**Tech Stack:** TypeScript hook extensions, Bun test runner, OMP HTTP MCP configuration, Muninn MCP configured by untracked `MUNINN_MCP_URL`.

**Commit policy:** Do not commit or push unless Lucas explicitly requests it.

---

## File structure

- `.omp/agent/mcp.json` — declares the `muninn` HTTP MCP server beside Vercel.
- `.omp/agent/hooks/muninn.ts` — detects repository identity, calls Muninn, and returns a session-start injection.
- `.omp/agent/hooks/muninn.test.ts` — isolates context assembly from transport and verifies selection, ordering, and failure output.
- `.omp/agent/AGENTS.md` — retains local identity/safety/deployment policy without importing `~/vault`.
- `.omp/agent/skills/retro/SKILL.md` and `.omp/skills/retro/SKILL.md` — define the remote daily-note read/append/write workflow for extension-local and active skill discovery.
- `~/.omp/agent/...` — live copy synchronized only after the tracked configuration passes focused checks.

### Task 1: Add the Muninn endpoint and a testable context hook

**Files:**
- Modify: `.omp/agent/mcp.json`
- Create: `.omp/agent/hooks/muninn.ts`
- Create: `.omp/agent/hooks/muninn.test.ts`

- [ ] **Step 1: Write the failing focused tests.** Define a `VaultClient` fake returning all five always-injected files (`huginn-identity`, `huginn-web-rules`, `huginn-conventions`, `010-Lucas`, and `030-Coding-Style`), the config stack document, and an intentionally unsorted six-file project list. Assert `buildSessionContext` includes identity, web rules, conventions, Lucas context, the two coding documents, keeps only the newest five note paths, and emits a descriptive unavailable-context message when `vault_list` throws.

```ts
import { expect, test } from "bun:test";
import { buildSessionContext, type Project, type VaultClient } from "./muninn";

const project: Project = { org: "lucasfth", repo: "config", branch: "main" };
const client: VaultClient = {
  read: async (filename) => ({ content: `body:${filename}` }),
  list: async () => ({ files: [
    "projects/lucasfth/config/main/2026-09-01.md",
    "projects/lucasfth/config/main/2026-09-06.md",
    "projects/lucasfth/config/main/2026-09-02.md",
    "projects/lucasfth/config/main/2026-09-05.md",
    "projects/lucasfth/config/main/2026-09-03.md",
    "projects/lucasfth/config/main/2026-09-04.md",
  ] }),
};

test("injects baseline, applicable tech docs, and five newest notes", async () => {
  const context = await buildSessionContext(project, client);
  expect(context).toContain("body:tech/huginn-identity.md");
  expect(context).toContain("body:tech/huginn-web-rules.md");
  expect(context).toContain("body:tech/huginn-conventions.md");
  expect(context).toContain("body:life/010-Lucas.md");
  expect(context).toContain("body:tech/030-Coding-Style.md");
  expect(context).toContain("body:tech/032-Nix-Darwin-Patterns.md");
  expect(context).not.toContain("body:projects/lucasfth/config/main/2026-09-01.md");
  expect(context).toContain("body:projects/lucasfth/config/main/2026-09-06.md");
});

test("returns an unavailable-context notice when Muninn fails", async () => {
  const context = await buildSessionContext(project, { ...client, list: async () => { throw new Error("offline"); } });
  expect(context).toContain("Muninn context unavailable: offline");
});
```

- [ ] **Step 2: Run the test to establish the missing-hook failure.**

Run: `bun test .omp/agent/hooks/muninn.test.ts`

Expected: FAIL because `.omp/agent/hooks/muninn.ts` does not exist.

- [ ] **Step 3: Add Muninn to the tracked MCP configuration.** Preserve the Vercel entry and add this sibling server entry:

```json
"muninn": {
  "type": "http",
  "url": "<generated from MUNINN_MCP_URL>"
}
```

- [ ] **Step 4: Implement `.omp/agent/hooks/muninn.ts`.** Export `Project`, `VaultClient`, `buildSessionContext`, and the default OMP hook. Keep the existing `git rev-parse` / `git remote get-url origin` project derivation and `_local/<basename>` fallback. Use these exact document paths:

```ts
const COMMON_PATHS = [
  "tech/huginn-identity.md",
  "tech/huginn-web-rules.md",
  "tech/huginn-conventions.md",
  "life/010-Lucas.md",
  "tech/030-Coding-Style.md",
];
const TECH_DOCS: Record<string, string[]> = {
  "lucasfth/config": ["tech/032-Nix-Darwin-Patterns.md"],
  "EcoRayDev/ecoray-web": ["tech/031-Nuxt-Vue-Patterns.md"],
};
const notesPattern = `projects/${project.org}/${project.repo}/${project.branch}/*.md`;
```

Implement an internal `McpVaultClient` using `fetch` against the exact endpoint. For every request, POST JSON-RPC with `Content-Type: application/json`, `Accept: application/json, text/event-stream`, and a monotonically increasing numeric `id`. Send `initialize` with protocol version `2024-11-05`, then call `tools/call` using `vault_read` or `vault_list`. Parse the server envelope `result.content[*].text` as JSON, and reject non-2xx responses, JSON-RPC errors, missing text content, or malformed tool JSON.

`buildSessionContext` must read `COMMON_PATHS` and applicable stack paths, list the branch’s notes, lexically sort paths, select `slice(-5)`, read them concurrently with `Promise.all`, strip YAML frontmatter with `/^---\n[\s\S]*?\n---\n?/`, and preserve the current `## <doc-name>` and `## Prior sessions` headings. On any MCP failure, return exactly `## Muninn context unavailable\n\nMuninn context unavailable: <error message>`; never read the local vault.

The default hook registers `pi.on("context", ...)`, calls `buildSessionContext`, and returns one `{ role: "user", content }` message. It must not create a file, cache a response, or import Node filesystem APIs.

- [ ] **Step 5: Run focused tests.**

Run: `bun test .omp/agent/hooks/muninn.test.ts`

Expected: PASS; confirms oldest-note exclusion, newest-note inclusion, stack-document selection, and no silent local fallback on transport failure.

### Task 2: Remove vault imports and migrate retrospectives

**Files:**
- Modify: `.omp/agent/AGENTS.md`
- Modify: `.omp/agent/skills/retro/SKILL.md`
- Modify: `.omp/skills/retro/SKILL.md`
- Delete: `.omp/agent/hooks/vault.ts`

- [ ] **Step 1: Replace global agent directives.** Keep the identity anchor, web-content distrust rule, deployment approval section, and reference to `RULES.md`. Delete the `## Full Context` `@~/vault/...` imports and the `## Session Start` vault-read instruction. Add this replacement section:

```markdown
## Operational Context

`hooks/muninn.ts` injects repository conventions and prior session notes from Muninn at session start. Muninn is the sole mutable operational knowledge source. Never access the local vault filesystem.
```

- [ ] **Step 2: Rewrite the `retro` skill for Muninn.** Replace every local vault path and write instruction with this exact protocol:

```markdown
1. Derive `<org>`, `<repo>`, and `<branch>` using the existing Git commands; use `_local/<dirname>/main` only when Git metadata is unavailable.
2. Set `filename` to `projects/<org>/<repo>/<branch>/YYYY-MM-DD.md`.
3. Call Muninn `vault_read` for `filename`. If absent, start `content` with YAML frontmatter containing `project`, `branch`, `date`, and `tags`, followed by the existing date heading.
4. Append `## Summary`, `## What went well`, and `## Corrections` to `content` using the existing honesty rules.
5. Call Muninn `vault_write` with `{ filename, content }`.
6. Report the Muninn filename and Corrections bullets. If either MCP call fails, report the failure and do not claim the note was stored.
```

Update the frontmatter description and announcements to say “Muninn session note”, not “vault note.” Keep the existing content-quality rules unchanged. Apply the identical skill content to `.omp/agent/skills/retro/SKILL.md` and the active `.omp/skills/retro/SKILL.md`.

- [ ] **Step 3: Delete the obsolete hook.** Remove `.omp/agent/hooks/vault.ts`; `muninn.ts` is the only automatic context hook.

- [ ] **Step 4: Run source-level cutover checks.** Use the `grep` tool with pattern `~/vault|vault.ts` over `.omp/agent/AGENTS.md`, `.omp/agent/hooks`, `.omp/agent/skills/retro`, and `.omp/skills/retro`.

Expected: no matches. Then run `bun test .omp/agent/hooks/muninn.test.ts` and expect PASS.

### Task 3: Synchronize the live agent configuration and prove behavior

**Files:**
- Modify: `~/.omp/agent/mcp.json`
- Create: `~/.omp/agent/hooks/muninn.ts`
- Create: `~/.omp/agent/hooks/muninn.test.ts`
- Modify: `~/.omp/agent/AGENTS.md`
- Modify: `~/.omp/agent/skills/retro/SKILL.md`
- Modify: `~/.omp/skills/retro/SKILL.md`
- Delete: `~/.omp/agent/hooks/vault.ts`

- [ ] **Step 1: Copy the changed tracked artifacts to the live agent tree.** Copy only `mcp.json`, `AGENTS.md`, `hooks/muninn.ts`, `hooks/muninn.test.ts`, and both `skills/retro/SKILL.md` copies from their tracked locations to their matching live OMP locations, then delete `~/.omp/agent/hooks/vault.ts`. Do not copy runtime databases, sessions, caches, models, or unrelated skills.

- [ ] **Step 2: Verify the live hook against Muninn without writing.** Run the live focused test and a throwaway Bun invocation that imports `buildSessionContext`, derives the current project, and prints whether the output contains `## huginn-identity`, `## 030-Coding-Style`, and `## Prior sessions`.

Run: `bun test ~/.omp/agent/hooks/muninn.test.ts`

Expected: PASS. The smoke invocation reports all three markers as `true` and performs no `vault_write` call.

- [ ] **Step 3: Verify OMP’s MCP registration and fresh-session injection.** Start a disposable OMP session with no retained session state, ask it to identify the injected config convention, and verify the first supplied context includes identity, web rules, Huginn conventions, Lucas context, repository conventions, and the expected Muninn headings. Confirm `muninn` and `vercel` both appear in the active MCP server configuration.

Run: `omp --no-session -p "State the injected Nix configuration convention in one sentence."`

Expected: one sentence derived from the Muninn-provided context; no local-vault path appears in output or logs.

- [ ] **Step 4: Verify retrospective round trip.** Run `retro` for the current session so the remote note is useful persistent history. Inspect the resulting current-project daily note with `vault_read`, then invoke `buildSessionContext` for the current project and branch. Confirm the new Summary and Corrections appear in the injected context. Do not create or delete a disposable remote note.

- [ ] **Step 5: Final cutover scan.** Use the `grep` tool with pattern `~/vault|vault.ts` over `~/.omp/agent/AGENTS.md`, `~/.omp/agent/hooks`, `~/.omp/agent/skills/retro`, and `~/.omp/skills/retro`.

Expected: no matches. Do not run `nrs` or a system rebuild; OMP reads these files directly.
