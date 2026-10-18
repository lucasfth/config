import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, symlink } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import sourceOutline, { outlineSource } from './source-outline.ts';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

async function fixture(run: (root: string) => Promise<void>) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'pi-outline-'));
  try { await run(root); } finally { await rm(root, { recursive: true, force: true }); }
}

test('outlines TS declarations and members with exact read ranges, not references', async () => fixture(async root => {
  await writeFile(path.join(root, 'auth.ts'), [
    'export interface User {', '  id: string;', '}',
    'export class Auth {', '  verify(token: string) {', '    return token.length > 0;', '  }', '}',
    'export const validate = (token: string) => token.length > 0;',
    'export type Token = string;',
  ].join('\n'));
  const result = await outlineSource(root, 'auth.ts');
  assert.deepEqual(result.symbols.map(item => [item.name, item.kind, item.startLine, item.endLine]), [
    ['User', 'interface', 1, 3], ['User.id', 'property', 2, 2], ['Auth', 'class', 4, 8],
    ['Auth.verify', 'method', 5, 7], ['validate', 'function', 9, 9], ['Token', 'type', 10, 10],
  ]);
  assert.equal(result.truncated, false);
}));

test('handles TSX, JS, nested declarations and limits without returning function bodies', async () => fixture(async root => {
  await writeFile(path.join(root, 'view.tsx'), 'export const View = () => <div>BODY_CANARY</div>;\nfunction outer() { function inner() {} }\n');
  const result = await outlineSource(root, 'view.tsx', { limit: 2 });
  assert.deepEqual(result.symbols.map(item => item.name), ['View', 'outer']);
  assert.equal(result.truncated, true);
  assert.doesNotMatch(JSON.stringify(result), /BODY_CANARY/);
  await writeFile(path.join(root, 'app.js'), 'const run = function () {};\n');
  assert.equal((await outlineSource(root, 'app.js')).symbols[0].kind, 'function');
}));

test('rejects traversal, symlink escapes, directories, unsupported files and oversized source', async () => fixture(async root => {
  await assert.rejects(outlineSource(root, '../outside.ts'), /workspace/);
  await assert.rejects(outlineSource(root, path.join(root, 'absolute.ts')), /relative/);
  await writeFile(path.join(root, 'secret.py'), 'pass');
  await assert.rejects(outlineSource(root, 'secret.py'), /JS\/TS/);
  await writeFile(path.join(root, 'large.ts'), 'x'.repeat(262145));
  await assert.rejects(outlineSource(root, 'large.ts'), /262144/);
  await symlink(os.tmpdir(), path.join(root, 'escape'));
  await assert.rejects(outlineSource(root, 'escape/any.ts'), /workspace/);
  await symlink(root, path.join(root, 'dir.ts'));
  await assert.rejects(outlineSource(root, 'dir.ts'), /regular file/);
}));

test('honours cancellation and validates symbol limits for direct callers', async () => fixture(async root => {
  await writeFile(path.join(root, 'small.ts'), 'function run() {}');
  await assert.rejects(outlineSource(root, 'small.ts', { signal: AbortSignal.abort() }), /abort/i);
  await assert.rejects(outlineSource(root, 'small.ts', { limit: 0 }), /limit/i);
}));

test('registers deferred read-only source_outline with anchored read guidance', async () => fixture(async root => {
  await writeFile(path.join(root, 'small.ts'), 'function run() {}');
  let tool: any;
  sourceOutline({ registerTool: (value: any) => { tool = value; } } as unknown as ExtensionAPI);
  assert.equal(tool.name, 'source_outline');
  assert.equal(tool.exposure, 'deferred');
  assert.equal(tool.annotations.readOnlyHint, true);
  const result = await tool.execute('id', { path: 'small.ts' }, undefined, undefined, { cwd: root });
  assert.match(result.content[0].text, /small\.ts:1-1/);
  assert.match(result.content[0].text, /anchored read/);
}));

test('extension loads without TypeScript and tool invocation returns actionable error', async () => fixture(async root => {
  const source = await import('node:fs/promises').then(fs => fs.readFile(new URL('./source-outline.ts', import.meta.url), 'utf8'));
  // Copy the actual module outside the repository so its lazy TypeScript import cannot resolve.
  // typebox is the only runtime import besides node builtins and host types.
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const isolated = source.replace(/from ['"]typebox['"]/u, `from ${JSON.stringify(require.resolve('typebox'))}`);
  await writeFile(path.join(root, 'outline.ts'), isolated);
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ type: 'module' }));
  await writeFile(path.join(root, 'small.ts'), 'function run() {}');
  const runner = `import assert from 'node:assert/strict'; import extension, { outlineSource } from './outline.ts'; let registered; extension({registerTool: tool => {registered=tool;}}); assert.equal(registered.name,'source_outline'); await assert.rejects(outlineSource(${JSON.stringify(root)}, 'small.ts'), /TypeScript parser unavailable.*npm ci/); console.log('optional parser absence verified');`;
  await writeFile(path.join(root, 'run.mjs'), runner);
  const tsx = require.resolve('tsx');
  const output = execFileSync(process.execPath, ['--import', tsx, path.join(root, 'run.mjs')], { encoding: 'utf8', env: { ...process.env, NODE_PATH: '' } });
  assert.match(output, /optional parser absence verified/);
}));
