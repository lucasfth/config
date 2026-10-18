import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createAgentSession, SessionManager } from '@earendil-works/pi-coding-agent';
import { prepareRuntime, sourceDir } from './runtime.mjs';

const root = await mkdtemp(path.join(os.tmpdir(), 'huginn-pi-eval-'));
await mkdir(root, { recursive: true });
await writeFile(path.join(root, 'README.md'), '# Huginn native Pi profile\n');
let session;
const invoke = async (tool, ctx, args, signal) => tool.execute(`eval-${Math.random()}`, args, signal, undefined, ctx);
const text = result => result.content.filter(part => part.type === 'text').map(part => part.text).join('\n');
try {
  process.env.PI_CODING_AGENT_DIR = root;
  process.env.NEO_PROXY_API_KEY = 'synthetic-local-only';
  await prepareRuntime({ agentDir: root, env: { ...process.env, NEO_PROXY_URL: 'http://127.0.0.1:1/v1', ECORAY_MIMER_IP: '' }, ompDir: path.join(root, 'absent') });
  const settings = JSON.parse(await readFile(path.join(root, 'settings.json'), 'utf8'));
  settings.skills = [];
  settings.extensions = [path.join(sourceDir, 'extensions/eval.ts')];
  settings.packages = [];
  await writeFile(path.join(root, 'settings.json'), JSON.stringify(settings));
  await writeFile(path.join(root, 'mcp.json'), JSON.stringify({ mcpServers: {} }));
  session = (await createAgentSession({ cwd: root, agentDir: root, sessionManager: SessionManager.create(root, path.join(root, 'sessions')) })).session;
  await session.bindExtensions({ mode: 'print' });
  const definition = session.extensionRunner.getToolDefinition('eval');
  assert.ok(definition, 'deferred eval tool registers');
  const ctx = session.extensionRunner.createToolContext('integration-eval', undefined);
  session.agent.state.messages = [{ role:'assistant', content:[{type:'toolCall',id:'integration-eval',name:'eval',arguments:{}}], api:'openai-completions',provider:'neo-proxy',model:'gpt-6.1-sol',usage:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},stopReason:'toolUse',timestamp:Date.now() }];

  const pyFirst = await invoke(definition, ctx, { language: 'py', code: 'persistent_value = 40\npersistent_value + 2' });
  assert.match(text(pyFirst), /42/);
  const pySecond = await invoke(definition, ctx, { language: 'py', code: 'persistent_value += 1\npersistent_value' });
  assert.match(text(pySecond), /41/);
  const jsFirst = await invoke(definition, ctx, { language: 'js', code: 'const persistentValue = await Promise.resolve(40); persistentValue + 2' });
  assert.match(text(jsFirst), /42/);
  const jsTool = await invoke(definition, ctx, { language: 'js', code: 'const readResult = await tools.read({path: "README.md"}); readResult.content[0].text.slice(0, 40)' });
  assert.match(text(jsTool), /Huginn native Pi profile/);
  const pyTool = await invoke(definition, ctx, { language: 'py', code: 'read_result = tools.read(path="README.md")\nread_result["content"][0]["text"][:40]' });
  assert.match(text(pyTool), /Huginn native Pi profile/);

  const pyError = await invoke(definition, ctx, { language: 'py', code: 'raise ValueError("expected smoke error")' });
  assert.match(text(pyError), /expected smoke error/);
  const afterError = await invoke(definition, ctx, { language: 'py', code: 'persistent_value' });
  assert.match(text(afterError), /41/);
  const jsError = await invoke(definition, ctx, { language: 'js', code: 'throw new Error("expected smoke error")' });
  assert.match(text(jsError), /expected smoke error/);
  const afterJsError = await invoke(definition, ctx, { language: 'js', code: 'persistentValue' });
  assert.match(text(afterJsError), /40/);

  const abortController = new AbortController();
  const interrupted = invoke(definition, ctx, { language: 'py', code: 'import time\ntime.sleep(30)', timeout: 30000 }, abortController.signal);
  setTimeout(() => abortController.abort(), 100);
  const aborted = await interrupted;
  assert.match(text(aborted), /terminated|lost|abort/i);
  const pyReset = await invoke(definition, ctx, { language: 'py', code: '"reset complete"', reset: true });
  assert.match(text(pyReset), /reset complete/);
  const stateLost = await invoke(definition, ctx, { language: 'py', code: 'persistent_value' });
  assert.match(text(stateLost), /NameError/);

  console.log(JSON.stringify({ scenario: 'persistent-python-js-eval', python: 'persistent globals + expression + sync tool bridge', javascript: 'persistent lexical + top-level await + async tool bridge', errorsPreserveState: true, abortInvalidatesKernel: true, resetClearsState: true, sessionCleanup: 'session_shutdown exercised in finally', sandbox: false }));
} finally {
  if (session) {
    await session.extensionRunner.emit({ type: 'session_shutdown', reason: 'quit' });
    session.dispose();
  }
  delete process.env.PI_CODING_AGENT_DIR;
  await rm(root, { recursive: true, force: true });
}
