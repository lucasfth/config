import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createAgentSession, SessionManager } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { prepareRuntime, sourceDir } from './runtime.mjs';

const dir = await mkdtemp(path.join(os.tmpdir(), 'pi-condense-proof-'));
const calls = [];
const original = 'ORIGINAL_EVIDENCE_CANARY ' + 'bounded evidence '.repeat(600);
const server = http.createServer(async (req, res) => {
  let raw = '';
  for await (const part of req) raw += part;
  const body = JSON.parse(raw);
  calls.push(body.model);
  const summary = body.model === 'claude-haiku-5-5';
  const needsTool = !summary && !body.messages.some(message => message.role === 'tool');
  const delta = needsTool
    ? { role: 'assistant', tool_calls: [{ index: 0, id: 'condense-evidence', type: 'function', function: { name: 'evidence_probe', arguments: '{}' } }] }
    : { role: 'assistant', content: summary ? '[[1:evidence_probe]] Read original evidence; important marker ORIGINAL_EVIDENCE_CANARY.' : 'Evidence inspected.' };
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  for (const [part, finish] of [[delta, null], [{}, needsTool ? 'tool_calls' : 'stop']]) {
    res.write(`data: ${JSON.stringify({ id: 'condense-proof', object: 'chat.completion.chunk', created: 1, model: body.model, choices: [{ index: 0, delta: part, finish_reason: finish }] })}\n\n`);
  }
  res.end('data: [DONE]\n\n');
});
const listen = Promise.withResolvers();
server.listen(0, '127.0.0.1', listen.resolve);
await listen.promise;
let session;
try {
  process.env.PI_CODING_AGENT_DIR = dir;
  process.env.NEO_PROXY_API_KEY = 'synthetic';
  await prepareRuntime({ agentDir: dir, env: { ...process.env, NEO_PROXY_URL: `http://127.0.0.1:${server.address().port}/v1` }, ompDir: path.join(dir, 'absent') });
  const settings = JSON.parse(await readFile(path.join(dir, 'settings.json'), 'utf8'));
  settings.extensions = [path.join(sourceDir, 'node_modules/pi-condense/index.ts')];
  settings.packages = [];
  settings.skills = [];
  settings.contextPrune.minBatchChars = 1000;
  settings.contextPrune.chainCompression.enabled = false;
  await writeFile(path.join(dir, 'settings.json'), JSON.stringify(settings));
  await writeFile(path.join(dir, 'mcp.json'), '{"mcpServers":{}}');
  const made = await createAgentSession({
    cwd: dir, agentDir: dir, sessionManager: SessionManager.create(dir, path.join(dir, 'sessions')),
    customTools: [{ name: 'evidence_probe', label: 'Evidence probe', description: 'Return evidence for integration smoke', parameters: Type.Object({}), async execute() { return { content: [{ type: 'text', text: original }], details: {} }; } }],
  });
  session = made.session;
  assert.deepEqual(made.extensionsResult.errors, []);
  await session.bindExtensions({ mode: 'tui' });
  await session.prompt('Inspect the evidence.');
  await session.waitForIdle();
  assert.ok(calls.includes('claude-haiku-5-5'), 'Automatic summary reaches dedicated role');
  const entries = session.sessionManager.getEntries();
  const indexes = entries.filter(entry => entry.type === 'custom' && entry.customType === 'context-prune-index');
  assert.ok(indexes.length, 'Original evidence indexed');
  assert.ok(entries.some(entry => entry.type === 'message' && entry.message.role === 'toolResult' && entry.message.content.some(content => content.type === 'text' && content.text === original)), 'Raw transcript remains intact');
  const projected = await session.extensionRunner.emitContext(session.messages);
  assert.ok(!JSON.stringify(projected).includes('bounded evidence bounded evidence bounded evidence'), 'Future context uses a stub');
  const query = session.extensionRunner.getToolDefinition('context_tree_query');
  assert.ok(query);
  const restored = await query.execute('recover', { toolCallIds: ['t1'] }, undefined, undefined, session.extensionRunner.createToolContext('recover', undefined));
  const recovered = restored.content.filter(content => content.type === 'text').map(content => content.text).join('\n');
  assert.ok(recovered.includes('ORIGINAL_EVIDENCE_CANARY'));
  console.log(JSON.stringify({ calls, automaticSummary: true, indexEntries: indexes.length, originalRecovered: true, rawTranscriptPreserved: true, prunedProjection: true }, null, 2));
} finally {
  session?.dispose();
  server.closeAllConnections();
  const closed = Promise.withResolvers();
  server.close(closed.resolve);
  await closed.promise;
  await rm(dir, { recursive: true, force: true, maxRetries: 3 });
}
