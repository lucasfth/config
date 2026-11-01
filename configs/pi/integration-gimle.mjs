// Explicit live consumer acceptance. Never part of automatic unit tests.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Type } from '@sinclair/typebox';
import { streamSimple } from './node_modules/@earendil-works/pi-ai/dist/api/openai-completions.js';
import { createAgentSession, SessionManager, ModelRuntime } from '@earendil-works/pi-coding-agent';
import { prepareRuntime } from './runtime.mjs';

const dir = await mkdtemp(path.join(os.tmpdir(), 'pi-gimle-acceptance-'));
try {
  await prepareRuntime({ agentDir: dir, env: { ...process.env, NEO_PROXY_URL: process.env.NEO_PROXY_URL || 'http://127.0.0.1:1/v1' } });
  const settings = JSON.parse(await readFile(path.join(dir, 'settings.json'), 'utf8'));
  Object.assign(settings, { extensions: [], packages: [], skills: [], prompts: [], compaction: { enabled: false } });
  await writeFile(path.join(dir, 'settings.json'), JSON.stringify(settings));
  await writeFile(path.join(dir, 'mcp.json'), '{"mcpServers":{}}');
  const runtime = await ModelRuntime.create({ modelsPath: path.join(dir, 'models.json'), authPath: path.join(dir, 'auth.json') });
  const model = runtime.getModel('gimle', 'qwen3.5-9b-6bit');
  assert.ok(model, 'Native model registry loads Gimle');
  const auth = await runtime.getAuth(model);
  assert.ok(auth?.auth.apiKey);
  const options = { apiKey: auth.auth.apiKey, maxTokens: 256, signal: AbortSignal.timeout(180000), temperature: 0 };
  const tool = { name: 'gimle_probe', description: 'Return a synthetic test receipt without side effects.', parameters: Type.Object({ value: Type.String() }) };
  const messages = [
    { role: 'system', content: 'Follow the user instructions. Use only the supplied synthetic tool.', toolsAdded: [tool], timestamp: 0 },
    { role: 'user', content: [{ type: 'text', text: 'Call gimle_probe with value VERIFIED. Do not answer before calling it.' }], timestamp: Date.now() },
  ];
  let textEvents = 0;
  const firstStream = streamSimple(model, { messages }, options);
  for await (const event of firstStream) if (event.type.endsWith('delta')) textEvents++;
  const first = await firstStream.result();
  assert.equal(first.stopReason, 'toolUse', first.errorMessage);
  const call = first.content.find(p => p.type === 'toolCall');
  assert.equal(call?.name, 'gimle_probe');
  assert.equal(call.arguments.value, 'VERIFIED');
  messages.push(first, { role: 'toolResult', toolCallId: call.id, toolName: call.name, content: [{ type: 'text', text: 'GIMLE_TOOL_VERIFIED' }], isError: false, timestamp: Date.now() },
    { role: 'user', content: [{ type: 'text', text: 'Reply exactly GIMLE_TOOL_VERIFIED.' }], timestamp: Date.now() });
  const final = await streamSimple(model, { messages }, options).result();
  assert.equal(final.stopReason, 'stop', final.errorMessage);
  assert.ok(final.content.some(p => p.type === 'text' && p.text.includes('GIMLE_TOOL_VERIFIED')));
  assert.ok(textEvents > 0, 'Received actual streamed deltas');
  const denied = await streamSimple(model, { messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }], timestamp: Date.now() }] }, { ...options, apiKey: 'invalid-test-key' }).result();
  assert.equal(denied.stopReason, 'error');
  for (const override of [{ adapters: '/tmp/untrusted' }, { draft_model: 'remote/model' }, { max_tokens: 5000 }]) {
    const rejected = await streamSimple(model, { messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }], timestamp: Date.now() }] },
      { ...options, onPayload: payload => ({ ...payload, ...override }) }).result();
    assert.equal(rejected.stopReason, 'error', 'Unsafe override must be rejected');
  }
  const { session } = await createAgentSession({ cwd: dir, agentDir: dir, modelRuntime: runtime, model, thinkingLevel: 'off', noTools: true, sessionManager: SessionManager.inMemory() });
  const timer = setTimeout(() => session.abort(), 120000);
  try {
    await session.prompt('Reply exactly GIMLE_SESSION_VERIFIED.');
    assert.match(session.getLastAssistantText(), /GIMLE_SESSION_VERIFIED/);
  } finally { clearTimeout(timer); session.dispose(); }
  console.log(JSON.stringify({ provider: 'gimle', streamedDeltas: textEvents, tool: call.name, toolArguments: call.arguments, toolResultContinuation: true, nativeSession: true, unauthorizedRejected: true }));
} finally { await rm(dir, { recursive: true, force: true }); }
