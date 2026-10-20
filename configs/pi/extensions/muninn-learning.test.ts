import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildSessionContext, createMemoryRecall, type VaultClient } from "./muninn.ts";

const approvedPath = "tech/learning/general.md";
const document = (scope = "general", entries: unknown[] = [{
  id: "approved-fixture", text: "APPROVED_FIXTURE_LESSON",
  approved_by: "Lucas", approved_at: "2026-10-20", approval_reference: "fixture approval",
  source: { path: "projects/example/repo/main/2026-10-01.md", sha256: "a".repeat(64) },
}]) => `---\ntype: agent-config\n---\n# Approved learning\n\n\`\`\`json\n${JSON.stringify({ schema: 1, scope, entries })}\n\`\`\``;
const candidate = document("example/repo", [{ id: "candidate", status: "candidate", text: "UNAPPROVED_CANDIDATE_DO_NOT_LOAD" }]);

test("startup loads approved supplemental guidance, never candidate documents", async () => {
  const reads: string[] = [];
  const client: VaultClient = {
    async read(filename) {
      reads.push(filename);
      if (filename === approvedPath) return { content: document() };
      if (filename === "tech/learning/projects/example/repo.md") return { content: candidate };
      if (filename.startsWith("dreams/")) return { content: "UNAPPROVED_DREAM_DO_NOT_LOAD" };
      if (filename.startsWith("tech/learning/")) throw new Error("not found");
      return { content: "Existing required guidance" };
    },
    async list() { return { files: [] }; },
  };
  const context = await buildSessionContext({ org: "example", repo: "repo", branch: "main" }, client);
  assert.match(context, /APPROVED_FIXTURE_LESSON/);
  assert.doesNotMatch(context, /UNAPPROVED_CANDIDATE/);
  assert.ok(!reads.some(filename => filename.startsWith("dreams/")));
});

test("an unapproved document at the expected general path is never startup guidance", async () => {
  const client: VaultClient = {
    async read(filename) {
      return { content: filename === approvedPath ? document("general", [{ status: "candidate", text: "UNAPPROVED_CANDIDATE" }]) : "Existing guidance" };
    },
    async list() { return { files: [] }; },
  };
  const context = await buildSessionContext({ org: "example", repo: "repo", branch: "main" }, client);
  assert.doesNotMatch(context, /UNAPPROVED_CANDIDATE/);
});

test("approval and startup share the exact 8000 UTF-16-unit boundary", async () => {
  const fixture = JSON.parse(execFileSync("python3", [
    fileURLToPath(new URL("../../volundr/aar_learning.test.py", import.meta.url)), "--budget-fixture",
  ], { encoding: "utf8" })) as { note: string; texts: string[]; overflowRejected: boolean };
  assert.equal(fixture.overflowRejected, true);
  const client: VaultClient = {
    async read(filename) { return { content: filename === approvedPath ? fixture.note : "" }; },
    async list() { return { files: [] }; },
  };
  const context = await buildSessionContext({ org: "example", repo: "repo", branch: "main" }, client);
  const section = context.split("## Approved supplemental learning — general")[1]?.split("\n\n---")[0];
  assert.ok(section);
  assert.equal(("## Approved supplemental learning — general" + section).length, 8000);
  for (const text of fixture.texts) assert.ok(section.includes(text));
});

test("malformed approval, candidate status, wrong scopes and excessive supplements fail closed", async () => {
  const good = { id: "fixture", text: "REJECT_THIS_TEXT", approved_by: "Lucas", approved_at: "2026-10-20",
    approval_reference: "fixture", source: { path: "projects/example/repo/main/2026-10-01.md", sha256: "b".repeat(64) } };
  const invalids = [
    { ...good, status: "candidate" }, { ...good, approved_by: "model" },
    { ...good, approval_reference: "" }, { ...good, source: { ...good.source, sha256: "bad" } },
    { ...good, source: { ...good.source, path: "projects/../escape.md" } },
    { ...good, text: "REJECT_THIS_TEXT".repeat(1000) }, { ...good, approved_at: "invalid" },
  ];
  for (const content of [document("general", invalids), document("other/project", [good]), "malformed JSON"]) {
    const client: VaultClient = {
      async read(filename) { return { content: filename === approvedPath ? content : "Required preserved" }; },
      async list() { return { files: [] }; },
    };
    const context = await buildSessionContext({ org: "example", repo: "repo", branch: "main" }, client);
    assert.doesNotMatch(context, /REJECT_THIS_TEXT/);
    assert.match(context, /Required preserved/);
  }
});

test("recall resolves an archived AAR using its original approved source path", async () => {
  const source = "projects/example/repo/feature/slash/2026-09-01.md";
  const archived = "projects/_archive/example/repo/feature/slash/2026-09-01.md";
  const reads: string[] = [];
  const client: VaultClient = {
    async read(filename) {
      reads.push(filename);
      if (filename === archived) return { content: "ORIGINAL_ARCHIVED_EVIDENCE" };
      throw new Error("not found");
    },
    async list() { return { files: [] }; },
  };
  const recalled = await createMemoryRecall(client)([source]);
  assert.match(recalled, /ORIGINAL_ARCHIVED_EVIDENCE/);
  assert.ok(recalled.includes(archived));
  assert.deepEqual(reads, [source, archived]);
});

test("startup omits legacy correction tables without deleting curated text or raw recall", async () => {
  const text = "# Curated\nKeep curated rule.\n\n## Auto-Generated Correction Log (last 14 days)\nLEGACY_NOISE\n<!-- OMP-sessions-refresh -->\n\nRelated: [[other]]\n## Later curated rule\nKeep this too.";
  const client: VaultClient = {
    async read(filename) { return { content: filename.startsWith("tech/learning/") ? "" : text }; },
    async list() { return { files: ["projects/_archive/example/repo/main/2026-09-01.md", "projects/example/repo/main/2026-10-20.md"] }; },
  };
  const context = await buildSessionContext({ org: "example", repo: "repo", branch: "main" }, client);
  assert.doesNotMatch(context, /LEGACY_NOISE/);
  assert.match(context, /Keep curated rule/);
  assert.match(context, /Keep this too/);
  assert.doesNotMatch(context, /projects\/_archive/);
  assert.match(await createMemoryRecall(client)(["tech/030-Coding-Style.md"]), /LEGACY_NOISE/);
});

test("per-entry UTF-16 bounds agree with Python for astral characters", async () => {
  for (const count of [750, 751]) {
    const text = "😀".repeat(count);
    const entry = { text, approved_by: "Lucas", approved_at: "2026-10-20", approval_reference: "fixture",
      source: { path: "projects/example/repo/main/2026-09-01.md", sha256: "a".repeat(64) } };
    const client: VaultClient = {
      async read(filename) { return { content: filename === approvedPath ? document("general", [entry]) : "" }; },
      async list() { return { files: [] }; },
    };
    const context = await buildSessionContext({ org: "example", repo: "repo", branch: "main" }, client);
    assert.equal(context.includes(text), count === 750);
  }
});
