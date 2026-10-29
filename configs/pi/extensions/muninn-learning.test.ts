import assert from "node:assert/strict";
import test from "node:test";
import { skillLearningReceipt, buildSessionContext, createMemoryRecall, type VaultClient } from "./muninn.ts";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const project = { org: "example", repo: "repo", branch: "main" };

test("fresh context routes procedural learning to installed skills, never legacy supplements", async () => {
  const reads: string[] = [];
  const client: VaultClient = {
    async read(filename) {
      reads.push(filename);
      if (filename.startsWith("tech/learning/")) return { content: "OBSOLETE_STARTUP_LESSON" };
      return { content: "Required curated guidance" };
    },
    async list() { return { files: ["projects/example/repo/main/2026-10-29.md"] }; },
  };
  const context = await buildSessionContext(project, client);
  assert.match(context, /Volundr procedural learning/);
  assert.match(context, /installed skills/);
  assert.match(context, /AAR.*evidence/s);
  assert.match(context, /Required curated guidance/);
  assert.match(context, /Prior session index/);
  assert.equal(reads.some(path => path.startsWith("tech/learning/") || path.startsWith("dreams/")), false);
  assert.doesNotMatch(context, /OBSOLETE_STARTUP_LESSON/);
});

test("recall still retrieves historical evidence and archived AARs explicitly", async () => {
  const source = "projects/example/repo/main/2026-09-01.md";
  const archived = source.replace("projects/", "projects/_archive/");
  const client: VaultClient = {
    async read(filename) {
      if (filename === archived) return { content: "ORIGINAL_ARCHIVED_EVIDENCE" };
      if (filename === "tech/learning/general.md") return { content: "HISTORICAL_ONLY" };
      throw new Error("not found");
    },
    async list() { return { files: [] }; },
  };
  assert.match(await createMemoryRecall(client)([source]), /ORIGINAL_ARCHIVED_EVIDENCE/);
  assert.match(await createMemoryRecall(client)(["tech/learning/general.md"]), /HISTORICAL_ONLY/);
});

test("startup omits retired generated correction blocks without hiding curated rules", async () => {
  const body = "# Curated\nKeep curated rule.\n\n## Auto-Generated Correction Log (last 14 days)\nLEGACY_NOISE\n<!-- OMP-sessions-refresh -->\n\nRelated: [[other]]\n## Later rule\nKeep this too.";
  const client: VaultClient = {
    async read() { return { content: body }; },
    async list() { return { files: ["projects/_archive/example/repo/main/2026-09-01.md"] }; },
  };
  const context = await buildSessionContext(project, client);
  assert.doesNotMatch(context, /LEGACY_NOISE/);
  assert.match(context, /Keep curated rule/);
  assert.match(context, /Keep this too/);
  assert.doesNotMatch(context, /projects\/_archive/);
  assert.match(await createMemoryRecall(client)(["tech/030-Coding-Style.md"]), /LEGACY_NOISE/);
});

test("learning owner receipt binds loaded payload and distinguishes missing skills", () => {
  const root = mkdtempSync(join(tmpdir(), "learning-receipt-"));
  try {
    const file = join(root, "SKILL.md");
    writeFileSync(file, "# Candidate fixture\n");
    const first = skillLearningReceipt([{ name: "improvement-loop-audit", filePath: file }]);
    assert.equal(first.installed[0].sha256.length, 64);
    assert.ok(first.missing.includes("knowledge-maintenance"));
    writeFileSync(file, "# Changed fixture\n");
    const second = skillLearningReceipt([{ name: "improvement-loop-audit", filePath: file }]);
    assert.notEqual(first.installed[0].sha256, second.installed[0].sha256);
    assert.equal(second.behaviorProven, false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
