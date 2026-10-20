import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createAgentSession, SessionManager, initTheme } from '@earendil-works/pi-coding-agent';
import { prepareRuntime } from './runtime.mjs';

// Transport/lifecycle exercise, not a model-quality test. All model traffic goes
// to this deterministic loopback server with a synthetic key and private state.
const root = await mkdtemp(path.join(os.tmpdir(), 'huginn-pi-sdk-'));
const calls = [];
const server = http.createServer(async (request, response) => {
  let body = '';
  for await (const chunk of request) body += chunk;
  const payload = JSON.parse(body);
  calls.push(payload.model);
  const chunk = {
    id: 'local-proof', object: 'chat.completion.chunk', created: 1, model: payload.model,
    choices: [{ index: 0, delta: { role: 'assistant', content: payload.model === 'claude-haiku-5-5' ? 'No advice needed.' : 'LOCAL_TRANSPORT_RESPONSE' }, finish_reason: null }],
  };
  response.writeHead(200, { 'Content-Type': 'text/event-stream' });
  response.write(`data: ${JSON.stringify(chunk)}\n\n`);
  response.write(`data: ${JSON.stringify({ ...chunk, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } })}\n\n`);
  response.end('data: [DONE]\n\n');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let session;
try {
  initTheme('dark', false);
  process.env.PI_CODING_AGENT_DIR = root;
  process.env.NEO_PROXY_API_KEY = 'synthetic-local-only';
  const endpoint = `http://127.0.0.1:${server.address().port}/v1`;
  await prepareRuntime({ agentDir: root, env: { ...process.env, NEO_PROXY_URL: endpoint, ECORAY_MIMER_IP: '' }, ompDir: path.join(root, 'absent') });
  const configuredModels = JSON.parse(await readFile(path.join(root, 'models.json'), 'utf8'));
  assert.deepEqual(Object.keys(configuredModels.providers), ['neo-proxy']);
  assert.equal(new URL(configuredModels.providers['neo-proxy'].baseUrl).hostname, '127.0.0.1');
  await writeFile(path.join(root, 'mcp.json'), JSON.stringify({ mcpServers: {} }));
  const settings = JSON.parse(await readFile(path.join(root, 'settings.json'), 'utf8'));
  settings.skills = [];
  settings.extensions = settings.extensions.filter(filename => !filename.endsWith('muninn.ts'));
  await writeFile(path.join(root, 'settings.json'), JSON.stringify(settings));
  const result = await createAgentSession({ cwd: root, agentDir: root, sessionManager: SessionManager.create(root, path.join(root, 'sessions')) });
  session = result.session;
  assert.equal(result.extensionsResult.errors.length, 0, JSON.stringify(result.extensionsResult.errors));
  const errors = [];
  await session.bindExtensions({ mode: 'print', onError: error => errors.push(error) });
  await session.prompt('Return a short local transport response.');
  assert.ok(calls.includes('gpt-6.1-sol'), 'Main agent must reach its configured endpoint');
  // Continuous review is background work now; primary settlement does not await it.
  const advisorDeadline = Date.now() + 5000;
  while (!calls.includes('claude-haiku-5-5') && Date.now() < advisorDeadline) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.ok(calls.includes('claude-haiku-5-5'), 'Continuous advisor must reach its distinct configured model');
  const delegate = session.extensionRunner.getToolDefinition('subagent');
  assert.ok(delegate, 'Delegation tool must load');
  const delegated = await delegate.execute('local-child', { agent: 'scout', task: 'Reply briefly; no tools needed.', async: false }, undefined, undefined, session.extensionRunner.createToolContext('local-child', undefined));
  assert.ok(!delegated.isError, JSON.stringify(delegated));
  assert.ok(calls.includes('gpt-6-luna'), 'Scout must use the task model role');
  assert.equal(errors.length, 0, JSON.stringify(errors));
  const canary = path.join(root, 'edit-canary.txt');
  await writeFile(canary, 'before\n');
  const reader = session.extensionRunner.getToolDefinition('read');
  const editor = session.extensionRunner.getToolDefinition('edit');
  assert.ok(reader && editor, 'Anchored editing tools must register');
  const toolContext = session.extensionRunner.createToolContext('editing-proof', undefined);
  const readResult = await reader.execute('read-proof', { path: canary }, undefined, undefined, toolContext);
  const text = readResult.content.filter(part => part.type === 'text').map(part => part.text).join('\n');
  const anchor = text.match(/(1#[A-Za-z0-9]+)/)?.[1];
  assert.ok(anchor, 'Read must expose a real anchor');
  await editor.execute('edit-proof', { path: canary, edits: [{ op: 'replace', pos: anchor, lines: ['after'] }] }, undefined, undefined, toolContext);
  assert.equal(await readFile(canary, 'utf8'), 'after\n');
  const restored = SessionManager.open(session.sessionManager.getSessionFile());
  assert.ok(restored.buildSessionContext().messages.some(message => message.role === 'assistant'));
  assert.equal(restored.getSessionName(), 'Return a short local transport response.', 'Automatic topic title survives session reload');
  console.log(JSON.stringify({ scenario: 'file-and-session', anchoredEdit: await readFile(canary, 'utf8'), restoredAssistantMessages: restored.buildSessionContext().messages.filter(message => message.role === 'assistant').length }));
  console.log(JSON.stringify({ scenario: 'loopback-provider-lifecycle', calls, extensionErrors: errors.length, scope: 'local transport only; not live model/auth/browser proof' }));
} finally {
  if (session) await session.extensionRunner.emit({ type: 'session_shutdown', reason: 'quit' });
  session?.dispose();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  await rm(root, { recursive: true, force: true });
}
