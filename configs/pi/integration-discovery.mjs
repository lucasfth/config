import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createAgentSession, SessionManager } from '@earendil-works/pi-coding-agent';
import { prepareRuntime, sourceDir } from './runtime.mjs';

const root = await mkdtemp(path.join(os.tmpdir(), 'pi-discovery-proof-'));
let session;
let requests = 0;
const server = http.createServer(async (req, res) => {
  let raw = '';
  for await (const part of req) raw += part;
  const body = JSON.parse(raw);
  const turn = ++requests;
  const id = `discovery-${turn}`;
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  const chunk = (delta, finish_reason, extra = {}) => ({ id, object: 'chat.completion.chunk', created: 1, model: body.model, choices: [{ index: 0, delta, finish_reason }], ...extra });
  res.write(`data: ${JSON.stringify(chunk({ role: 'assistant', content: 'Synthetic discovery proof.' }, null))}\n\n`);
  res.write(`data: ${JSON.stringify(chunk({}, 'stop'))}\n\n`);
  res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created: 1, model: body.model, choices: [], usage: { prompt_tokens: 100, completion_tokens: 5, total_tokens: 105, ...(turn === 1 ? { prompt_tokens_details: { cached_tokens: 0 } } : {}) } })}\n\n`);
  res.end('data: [DONE]\n\n');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
try {
  const agentDir = path.join(root, 'agent');
  process.env.PI_CODING_AGENT_DIR = agentDir;
  process.env.NEO_PROXY_API_KEY = 'synthetic';
  await mkdir(path.join(root, 'src'));
  await writeFile(path.join(root, 'src/auth.ts'), 'export function verify(token: string) {\n return token.length > 0;\n}\n');
  await prepareRuntime({ agentDir, env: { ...process.env, NEO_PROXY_URL: `http://127.0.0.1:${server.address().port}/v1` }, ompDir: path.join(root, 'absent') });
  const settings = JSON.parse(await readFile(path.join(agentDir, 'settings.json'), 'utf8'));
  const selected = ['cache-report.ts', 'source-outline.ts'].map(name => path.join(sourceDir, 'extensions', name));
  for (const extension of selected) assert.ok(settings.extensions.includes(extension));
  settings.extensions = selected;
  settings.packages = []; settings.skills = []; settings.compaction.enabled = false;
  await writeFile(path.join(agentDir, 'settings.json'), JSON.stringify(settings));
  const made = await createAgentSession({ cwd: root, agentDir, sessionManager: SessionManager.inMemory() });
  session = made.session;
  assert.deepEqual(made.extensionsResult.errors, []);
  await session.bindExtensions({ mode: 'print' });
  const tool = session.extensionRunner.getToolDefinition('source_outline');
  assert.ok(tool);
  const result = await tool.execute('outline-proof', { path: 'src/auth.ts' }, undefined, undefined, session.extensionRunner.createToolContext('outline-proof', undefined));
  assert.match(result.content[0].text, /src\/auth\.ts:1-3 · function verify/);
  assert.match(result.content[0].text, /anchored read/);
  await session.prompt('Reply once for cache telemetry proof.');
  await session.prompt('Reply again without cache telemetry.');
  // Execute the registered slash command via the real session, not a simulated handler map.
  const output = [];
  const original = console.log;
  console.log = text => output.push(String(text));
  try { await session.prompt('/cache-report'); } finally { console.log = original; }
  const report = output.join('\n');
  assert.match(report, /cache read 0/);
  assert.match(report, /cache read unknown/);
  assert.equal(requests, 2, 'outline and cache command must not make model calls');
  console.log(JSON.stringify({ registeredOutline: 'src/auth.ts:1-3', explicitZeroAndAbsentDistinguished: true, modelRequests: requests, scope: 'real SDK command/tool and deterministic loopback provider; no live provider or terminal UI claim' }, null, 2));
} finally {
  session?.dispose();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  await rm(root, { recursive: true, force: true, maxRetries: 3 });
}
