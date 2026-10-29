import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Type } from '@sinclair/typebox';
import { streamSimple } from './node_modules/@earendil-works/pi-ai/dist/api/openai-completions.js';
import { prepareRuntime } from './runtime.mjs';
import { createAgentSession, SessionManager, ModelRuntime } from '@earendil-works/pi-coding-agent';

// Explicit live-provider acceptance; never run automatically with unit tests.
assert.ok(process.env.NEO_PROXY_API_KEY && process.env.ECORAY_MIMER_IP);
const agentDir = await mkdtemp(path.join(os.tmpdir(), 'pi-qwen-live-'));
try {
  await prepareRuntime({ agentDir });
  const { providers } = JSON.parse(await readFile(path.join(agentDir, 'models.json'), 'utf8'));
  const settings = JSON.parse(await readFile(path.join(agentDir, 'settings.json'), 'utf8'));
  Object.assign(settings, { extensions: [], packages: [], skills: [], prompts: [], compaction: { enabled: false } });
  await writeFile(path.join(agentDir, 'settings.json'), JSON.stringify(settings));
  await writeFile(path.join(agentDir, 'mcp.json'), '{"mcpServers":{}}');
  for (const provider of ['mimer', 'neo-proxy']) {
    const definition = providers[provider];
    const model = { ...definition.models.find(model => model.id.startsWith('Qwen3.8-')), provider, api: definition.api, baseUrl: definition.baseUrl };
    const options = { apiKey: provider === 'mimer' ? 'local' : process.env.NEO_PROXY_API_KEY, maxTokens: 256, get signal() { return AbortSignal.timeout(60000); } };
    const tool = { name: 'qwen_probe', description: 'Return a diagnostic receipt. No side effects.', parameters: Type.Object({ value: Type.String() }) };
    const messages = [{ role: 'system', content: 'Follow the user instructions.', toolsAdded: [tool], timestamp: 0 }, { role: 'user', content: [{ type: 'text', text: 'Call qwen_probe with value VERIFIED. Do not answer before calling it.' }], timestamp: Date.now() }];
    let payload;
    const first = await streamSimple(model, { messages }, { ...options, reasoning: 'off', onPayload: p => { payload = p; } }).result();
    assert.equal(first.stopReason, 'toolUse', first.errorMessage);
    assert.equal(payload.chat_template_kwargs.enable_thinking, false);
    const call = first.content.find(part => part.type === 'toolCall');
    assert.ok(call, JSON.stringify(first));
    assert.equal(call.name, tool.name);
    messages.push(first, { role: 'toolResult', toolCallId: call.id, toolName: call.name, content: [{ type: 'text', text: 'QWEN_TOOL_VERIFIED' }], isError: false, timestamp: Date.now() }, { role: 'user', content: [{ type: 'text', text: 'Reply exactly QWEN_TOOL_VERIFIED.' }], timestamp: Date.now() });
    const final = await streamSimple(model, { messages }, { ...options, reasoning: 'off' }).result();
    assert.equal(final.stopReason, 'stop', final.errorMessage);
    const text = final.content.filter(p => p.type === 'text').map(p => p.text).join('');
    assert.match(text, /QWEN_TOOL_VERIFIED/);
    const thinking = await streamSimple(model, { messages: [{ role: 'user', content: [{ type: 'text', text: 'What is 7 times 8? Reply briefly.' }], timestamp: Date.now() }] }, { ...options, reasoning: 'medium' }).result();
    assert.equal(thinking.stopReason, 'stop', thinking.errorMessage);
    assert.ok(thinking.content.some(p => p.type === 'text' && p.text.includes('56')), JSON.stringify(thinking));
    assert.equal(first.content.filter(p => p.type === 'thinking').length, 0);
    assert.ok(thinking.content.some(p => p.type === 'thinking'));
    const runtime = await ModelRuntime.create({ agentDir });
    const loaded = runtime.getModel(provider, model.id);
    assert.ok(loaded, 'Native model registry loads the generated definition');
    const { session } = await createAgentSession({ cwd: agentDir, agentDir, modelRuntime: runtime, model: loaded, thinkingLevel: 'off', noTools: true, sessionManager: SessionManager.inMemory() });
    const deadline = setTimeout(() => session.abort(), 60000);
    try {
      await session.prompt('Reply exactly QWEN_SESSION_VERIFIED.');
      assert.match(session.getLastAssistantText(), /QWEN_SESSION_VERIFIED/);
    } finally { clearTimeout(deadline); session.dispose(); }
    console.log(JSON.stringify({ provider, streamedTool: call.name, toolResultContinuation: text, nativeSessionReply: 'QWEN_SESSION_VERIFIED', thinkingBlocksOff: first.content.filter(p => p.type === 'thinking').length, thinkingBlocksMedium: thinking.content.filter(p => p.type === 'thinking').length, stopReason: thinking.stopReason }));
  }
} finally { await rm(agentDir, { recursive: true, force: true }); }
