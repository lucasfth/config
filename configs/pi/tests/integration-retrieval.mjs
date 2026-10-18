import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { collectCandidates, rankCandidates, summarizeSource } from '../extensions/code-search.ts';
import { buildSessionContext, createMemoryRecall } from '../extensions/muninn.ts';

const root = await mkdtemp(path.join(os.tmpdir(), 'retrieval-integration-'));
try {
  execFileSync('git', ['init', '-q'], { cwd: root });
  await mkdir(path.join(root, 'src'));
  await writeFile(path.join(root, '.gitignore'), 'private.ts\n');
  await writeFile(path.join(root, 'src/auth.ts'), 'export function validateSession(token) {\n  return token.length > 0;\n}\n');
  await writeFile(path.join(root, 'private.ts'), 'validateSession secret\n');
  const candidates = await collectCandidates(root, 'where is session token validation', { maxFiles: 20, maxFileBytes: 2000, maxTotalBytes: 4000, maxCandidates: 8 });
  assert.ok(candidates.length > 0);
  assert.ok(candidates.every(candidate => candidate.path === 'src/auth.ts'));
  const calls = [];
  const model = {
    role: 'task/local-deterministic-provider',
    async rank(prompt) {
      calls.push(prompt);
      if (prompt.includes('Rank code snippets')) return JSON.stringify({ rankings: [{ index: 0, score: 0.96, reason: 'Defines token validation.' }] });
      return 'Validates that a session token is nonempty.';
    },
  };
  const ranked = await rankCandidates('where is session token validation', candidates, model, 3);
  assert.equal(ranked[0].candidate.path, 'src/auth.ts');
  assert.equal(ranked[0].score, 0.96);
  assert.match(calls[0], /session token validation/);
  const summary = await summarizeSource(root, 'src/auth.ts', 1, 3, model);
  assert.match(summary.summary, /nonempty/);
  assert.equal(summary.startLine, 1);
  assert.equal(summary.endLine, 3);
  assert.match(summary.hint, /offset: 1, limit: 3/);
  assert.match(calls[1], /1: export function validateSession/);

  const reads = [];
  const vault = {
    async read(filename) { reads.push(filename); return { content: `body:${filename}` }; },
    async list() { return { files: ['projects/example/repo/main/one.md', 'projects/example/repo/main/two.md'] }; },
  };
  const context = await buildSessionContext({ org: 'example', repo: 'repo', branch: 'main' }, vault);
  assert.match(context, /Prior session index/);
  assert.doesNotMatch(context, /body:projects/);
  assert.equal(reads.some(filename => filename.startsWith('projects/')), false);
  const recalled = await createMemoryRecall(vault)(['projects/example/repo/main/two.md']);
  assert.match(recalled, /body:projects\/example\/repo\/main\/two\.md/);
  assert.equal(reads.filter(filename => filename.startsWith('projects/')).length, 1);
} finally {
  await rm(root, { recursive: true, force: true });
}
console.log('Retrieval integration passed: bounded local candidates, model-ranked evidence, selected-range summary, deferred note recall.');
