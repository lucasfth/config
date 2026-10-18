import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { collectCandidates, rankCandidates, summarizeSource, type Candidate, type RankingModel } from "./code-search.ts";

test("candidate collection respects gitignore and bounds the local code corpus", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "retrieval-corpus-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd: root });
    await mkdir(path.join(root, "src"));
    await mkdir(path.join(root, "vendor"));
    await writeFile(path.join(root, ".gitignore"), "vendor/\nsecret.ts\n");
    await writeFile(path.join(root, "src", "auth.ts"), "export function verifyToken() { return true; }\n".repeat(12));
    await writeFile(path.join(root, "secret.ts"), "verifyToken private\n");
    await writeFile(path.join(root, "vendor", "auth.ts"), "verifyToken\n");
    const candidates = await collectCandidates(root, "how does token verification work", { maxFiles: 10, maxFileBytes: 2000, maxTotalBytes: 4000, maxCandidates: 8 });
    assert.ok(candidates.length > 0);
    assert.ok(candidates.every(candidate => candidate.path === "src/auth.ts"));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("semantic ranking uses the configured task-role model and validates structured ranks", async () => {
  const requested: string[] = [];
  const model: RankingModel = {
    role: "task",
    async rank(prompt) {
      requested.push(prompt);
      return JSON.stringify({ rankings: [{ index: 1, score: 0.91, reason: "This directly handles token validation." }] });
    },
  };
  const items = [
    { path: "src/other.ts", startLine: 1, endLine: 3, snippet: "unrelated" },
    { path: "src/auth.ts", startLine: 8, endLine: 12, snippet: "verifyToken(token)" },
  ];
  const ranked = await rankCandidates("where is token validation", items, model, 1);
  assert.equal(model.role, "task");
  assert.match(requested[0], /where is token validation/);
  assert.equal(ranked[0]?.candidate.path, "src/auth.ts");
  assert.equal(ranked[0]?.score, 0.91);
  assert.match(ranked[0]?.reason ?? "", /directly handles/);
});

test("semantic ranking rejects malformed model output instead of returning fake matches", async () => {
  const model: RankingModel = { role: "task", async rank() { return "not json"; } };
  await assert.rejects(rankCandidates("query", [{ path: "a.ts", startLine: 1, endLine: 1, snippet: "x" }], model, 3), /invalid ranking/i);
});

test("summarized source reads stay bounded and cite exact source ranges with a raw read hint", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "retrieval-read-"));
  try {
    const file = path.join(root, "src", "service.ts");
    await mkdir(path.dirname(file));
    await writeFile(file, Array.from({ length: 20 }, (_, i) => `line-${i + 1}`).join("\n"));
    const promptInputs: string[] = [];
    const model: RankingModel = { role: "task", async rank(prompt) { promptInputs.push(prompt); return "This range initializes and starts the service."; } };
    const result = await summarizeSource(root, "src/service.ts", 4, 7, model, { maxSourceBytes: 2000, maxPromptChars: 3000 });
    assert.match(result.hint, /offset: 4, limit: 4/);
    assert.equal(result.startLine, 4);
    assert.equal(result.endLine, 7);
    assert.match(result.summary, /initializes and starts/);
    assert.match(promptInputs[0], /line-4[\s\S]*line-7/);
    assert.doesNotMatch(promptInputs[0], /line-3|line-8/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("summarized source rejects out-of-root paths and oversized ranges", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "retrieval-read-"));
  const model: RankingModel = { role: "task", async rank() { return "summary"; } };
  try {
    await writeFile(path.join(root, 'range.ts'), Array.from({length:300},()=> 'x').join('\n'));
    await assert.rejects(summarizeSource(root, "../secret", undefined, undefined, model), /within workspace/i);
    await assert.rejects(summarizeSource(root, 'range.ts', 1, 300, model), /range limit/i);
  } finally { await rm(root, { recursive: true, force: true }); }
});
