import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { prepareRuntime, repoDir, sourceDir } from './runtime.mjs';
import { KeybindingsManager } from './node_modules/@earendil-works/pi-coding-agent/dist/core/keybindings.js';

test('runtime preserves model role choices and private MCP credentials on repeated preparation', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'pi-runtime-test-'));
  try {
    const env = { ...process.env, PI_CODING_AGENT_DIR: dir, NEO_PROXY_URL: 'https://proxy.invalid/v1', NEO_PROXY_API_KEY: 'synthetic-key' };
    await prepareRuntime({ agentDir: dir, env, ompDir: path.join(dir, 'absent') });
    const roles = JSON.parse(await readFile(path.join(dir, 'roles.json'), 'utf8'));
    roles.default = { provider: 'neo-proxy', modelId: 'claude-opus-5-5', thinkingLevel: 'high' };
    await writeFile(path.join(dir, 'roles.json'), JSON.stringify(roles));
    await writeFile(path.join(dir, 'mcp.json'), JSON.stringify({ mcpServers: { custom: { url: 'https://custom.invalid/mcp', headers: { Authorization: 'Bearer synthetic' } } } }));
    await prepareRuntime({ agentDir: dir, env, ompDir: path.join(dir, 'absent') });
    const settings = JSON.parse(await readFile(path.join(dir, 'settings.json'), 'utf8'));
    const mcp = JSON.parse(await readFile(path.join(dir, 'mcp.json'), 'utf8'));
    assert.equal(settings.defaultProvider, 'neo-proxy');
    assert.equal(settings.defaultModel, 'claude-opus-5-5');
    assert.equal(mcp.mcpServers.custom.headers.Authorization, 'Bearer synthetic');
    assert.equal(settings.terminal.showImages, true);
    for (const name of ['source-outline.ts', 'cache-report.ts']) assert.ok(settings.extensions.includes(path.join(sourceDir, 'extensions', name)));
    assert.equal(settings.showCacheMissNotices, undefined, 'native cache notices retain their existing default');
    const models = JSON.parse(await readFile(path.join(dir, 'models.json'), 'utf8'));
    assert.equal(models.providers['neo-proxy'].baseUrl, 'https://proxy.invalid/v1');
    assert.ok(models.providers['neo-proxy'].models.some(model => model.id === 'gpt-6.1-sol'),
      'the explicit Pi model catalogue exposes Sol through the proxy');
    await prepareRuntime({ agentDir: dir, env: { ...env, NEO_PROXY_URL: 'https://proxy.invalid' }, ompDir: path.join(dir, 'absent') });
    const normalized = JSON.parse(await readFile(path.join(dir, 'models.json'), 'utf8'));
    assert.equal(normalized.providers['neo-proxy'].baseUrl, 'https://proxy.invalid/v1');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('Neo catalogue includes proxy chat models without advertising media endpoints', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'pi-neo-catalogue-'));
  try {
    await prepareRuntime({ agentDir: dir, env: { NEO_PROXY_URL: 'https://proxy.invalid/v1' } });
    const { providers } = JSON.parse(await readFile(path.join(dir, 'models.json'), 'utf8'));
    const ids = providers['neo-proxy'].models.map(model => model.id);
    for (const id of ['claude-sonnet-5-5', 'grok-4.7', 'deepseek-flash', 'mistralai/mistral-large']) assert.ok(ids.includes(id), id);
    for (const id of ['gpt-image-2', 'grok-imagine-video', 'grok-tts']) assert.ok(!ids.includes(id), id);
    const sonnet = providers['neo-proxy'].models.find(model => model.id === 'claude-sonnet-5-5');
    assert.deepEqual({ input: sonnet.input, contextWindow: sonnet.contextWindow, maxTokens: sonnet.maxTokens, reasoning: sonnet.reasoning },
      { input: ['text', 'image'], contextWindow: 1000000, maxTokens: 128000, reasoning: true });
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('Neo discovery adds chat models, filters media, preserves overrides and survives outages', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'pi-neo-discovery-'));
  const env = { NEO_PROXY_URL: 'https://proxy.invalid/v1', NEO_PROXY_API_KEY: 'test-key' };
  let request;
  const fetchModels = async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ data: [{ id: 'new-chat-model' }, { id: 'claude-sonnet-5-5' }, { id: 'grok-imagine-video' }, { id: 'grok-tts' }] }) };
  };
  try {
    await prepareRuntime({ agentDir: dir, env, fetchModels });
    const file = path.join(dir, 'models.json');
    const config = JSON.parse(await readFile(file, 'utf8'));
    let models = config.providers['neo-proxy'].models;
    assert.equal(request.url, 'https://proxy.invalid/v1/models');
    assert.equal(request.options.headers.Authorization, 'Bearer test-key');
    assert.ok(models.some(model => model.id === 'new-chat-model'));
    assert.ok(!models.some(model => model.id === 'grok-imagine-video' || model.id === 'grok-tts'));
    models.find(model => model.id === 'new-chat-model').contextWindow = 12345;
    await writeFile(file, JSON.stringify(config));
    await prepareRuntime({ agentDir: dir, env, fetchModels: async () => { throw new Error('offline'); } });
    models = JSON.parse(await readFile(file, 'utf8')).providers['neo-proxy'].models;
    assert.equal(models.find(model => model.id === 'new-chat-model').contextWindow, 12345);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('launcher discovers Neo models from a loopback server', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'pi-neo-launch-'));
  const requests = [];
  const server = createServer((req, res) => {
    requests.push({ path: req.url, authorization: req.headers.authorization });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ data: [{ id: 'loopback-new-chat' }] }));
  });
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const env = { ...process.env, PI_CODING_AGENT_DIR: dir, NEO_PROXY_URL: `http://127.0.0.1:${server.address().port}`, NEO_PROXY_API_KEY: 'test-key' };
    const child = spawn(process.execPath, [path.join(sourceDir, 'launch.mjs'), '--help'], { env, stdio: 'ignore' });
    const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); });
    assert.equal(code, 0);
    assert.deepEqual(requests, [{ path: '/v1/models', authorization: 'Bearer test-key' }]);
    const config = JSON.parse(await readFile(path.join(dir, 'models.json'), 'utf8'));
    assert.ok(config.providers['neo-proxy'].models.some(model => model.id === 'loopback-new-chat'));
  } finally { await new Promise(resolve => server.close(resolve)); await rm(dir, { recursive: true, force: true }); }
});

test('required metadata wins and offline fallback keeps persisted entries during discovery outage', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'pi-runtime-stale-'));
  try {
    const env = { NEO_PROXY_URL: 'https://proxy.invalid/v1', NEO_PROXY_API_KEY: 'test-key' };
    await prepareRuntime({ agentDir: dir, env });
    const file = path.join(dir, 'models.json');
    const config = JSON.parse(await readFile(file, 'utf8'));
    const configIds = ['gpt-6.2-sol', 'gpt-6.2-astra'];
    const stale = id => ({ id, name: id, reasoning: false, input: ['text'], contextWindow: 32768, maxTokens: 4096 });
    config.providers['neo-proxy'].models = config.providers['neo-proxy'].models
      .filter(model => !configIds.includes(model.id) && model.id !== 'gpt-6.1-terra')
      .concat(configIds.map(stale), stale('gpt-6.1-terra'));
    await writeFile(file, JSON.stringify(config));
    await prepareRuntime({ agentDir: dir, env });
    const models = JSON.parse(await readFile(file, 'utf8')).providers['neo-proxy'].models;
    for (const id of configIds) {
      const model = models.find(entry => entry.id === id);
      assert.deepEqual({ contextWindow: model.contextWindow, maxTokens: model.maxTokens, reasoning: model.reasoning },
        { contextWindow: 1050000, maxTokens: 128000, reasoning: true });
    }
    assert.ok(models.some(model => model.id === 'gpt-6.1-terra' && model.contextWindow === 32768),
      'persisted non-required entry is retained as the offline fallback while discovery is unavailable');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('persisted entries for retired models are dropped once discovery returns a live catalogue', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'pi-runtime-live-drop-'));
  try {
    const env = { NEO_PROXY_URL: 'https://proxy.invalid/v1', NEO_PROXY_API_KEY: 'test-key' };
    const fetchModels = async () => ({ ok: true, json: async () => ({ data: [{ id: 'gpt-6-luna' }] }) });
    await prepareRuntime({ agentDir: dir, env, fetchModels });
    const file = path.join(dir, 'models.json');
    const config = JSON.parse(await readFile(file, 'utf8'));
    config.providers['neo-proxy'].models.push({ id: 'gpt-6.1-terra', name: 'gpt-6.1-terra', reasoning: false, input: ['text'], contextWindow: 32768, maxTokens: 4096 });
    await writeFile(file, JSON.stringify(config));
    await prepareRuntime({ agentDir: dir, env, fetchModels });
    const ids = JSON.parse(await readFile(file, 'utf8')).providers['neo-proxy'].models.map(model => model.id);
    assert.ok(!ids.includes('gpt-6.1-terra'), 'stale persisted entry must be dropped when discovery succeeds');
    assert.ok(ids.includes('gpt-6-luna'));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('Mimer uses the OpenAI v1 base path and keeps the Qwen compatibility alias', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'pi-mimer-runtime-'));
  try {
    await prepareRuntime({
      agentDir: dir,
      env: { NEO_PROXY_URL: 'https://proxy.invalid/v1', ECORAY_MIMER_IP: 'mimer.invalid', MIMER_QWEN_KEY_FILE: '/private/mimer-key' },
      ompDir: path.join(dir, 'absent'),
    });
    const { providers } = JSON.parse(await readFile(path.join(dir, 'models.json'), 'utf8'));
    assert.equal(providers.mimer.baseUrl, 'http://mimer.invalid:8080/v1');
    assert.equal(providers.mimer.api, 'openai-completions');
    assert.equal(providers.mimer.apiKey, '!cat /private/mimer-key');
    assert.equal(providers.mimer.models[0].id, 'Qwen3.8-27B-UD-Q6_K_L.gguf');
    const qwen = providers.mimer.models[0];
    assert.equal(qwen.reasoning, true);
    assert.equal(qwen.contextWindow, 262144);
    assert.equal(qwen.maxTokens, 16384);
    assert.equal(qwen.compat.thinkingFormat, 'qwen-chat-template');
    assert.equal(qwen.compat.maxTokensField, 'max_tokens');
    assert.equal(qwen.compat.supportsReasoningEffort, false);
    assert.deepEqual(providers['neo-proxy'].models.find(model => model.id === qwen.id), qwen);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('Mimer rejects unsafe credential paths', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'pi-mimer-key-test-'));
  try {
    await assert.rejects(prepareRuntime({ agentDir: dir, env: { NEO_PROXY_URL: 'https://proxy.invalid', ECORAY_MIMER_IP: 'mimer.invalid', MIMER_QWEN_KEY_FILE: '/tmp/x;id' } }), /MIMER_QWEN_KEY_FILE/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});


test('runtime does not select OpenAI when the Neo endpoint is unavailable', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'pi-runtime-missing-'));
  try {
    const env = { ...process.env, NEO_PROXY_URL: '', NEO_PROXY_API_KEY: '', ECORAY_MIMER_IP: '' };
    await assert.rejects(prepareRuntime({ agentDir: dir, env, ompDir: path.join(dir, 'absent') }), /NEO_PROXY_URL/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('prepared keybinding map recognizes Command-V while retaining custom shortcuts', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'pi-paste-keys-'));
  try {
    await writeFile(path.join(dir, 'keybindings.json'), JSON.stringify({ 'app.session.new': 'ctrl+alt+n', 'app.clipboard.pasteImage': ['alt+v'] }));
    await prepareRuntime({ agentDir: dir, env: { NEO_PROXY_URL: 'https://proxy.invalid/v1' }, ompDir: path.join(dir, 'absent') });
    const keys = KeybindingsManager.create(dir);
    assert.ok(keys.matches('\x1b[118;9u', 'app.clipboard.pasteImage'), 'Kitty-encoded Command-V resolves to clipboard paste; terminal forwarding is verified separately');
    assert.ok(keys.matches('\x16', 'app.clipboard.pasteImage'), 'Ctrl-V remains available');
    assert.ok(keys.matches('\x1bv', 'app.clipboard.pasteImage'), 'Explicit extra clipboard shortcut survives');
    assert.ok(keys.matches('\x1b[110;7u', 'app.session.new'), 'Unrelated user shortcuts survive');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('Webflow defaults reach the generated profile without replacing private choices or OAuth credentials', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'pi-webflow-mcp-'));
  const options = { agentDir: dir, env: { NEO_PROXY_URL: 'https://proxy.invalid/v1' } };
  const auth = '{"synthetic-webflow":{"tokens":{"access_token":"keep","refresh_token":"keep-refresh"}}}\n';
  try {
    await writeFile(path.join(dir, 'mcp-auth.json'), auth);
    for (let attempt = 0; attempt < 2; attempt++) {
      await prepareRuntime(options);
      const { webflow } = JSON.parse(await readFile(path.join(dir, 'mcp.json'), 'utf8')).mcpServers;
      assert.equal(webflow.type, 'http');
      assert.equal(webflow.url, 'https://mcp.webflow.com/mcp');
      assert.equal(webflow.exposure, 'codemode');
      assert.equal(webflow.headers, undefined, 'OAuth discovery needs no hardcoded bearer credential');
      assert.equal(await readFile(path.join(dir, 'mcp-auth.json'), 'utf8'), auth);
    }
    const custom = { url: 'https://custom.invalid/mcp', enabled: false };
    await writeFile(path.join(dir, 'mcp.json'), JSON.stringify({ mcpServers: { webflow: custom } }));
    await prepareRuntime(options);
    assert.deepEqual(JSON.parse(await readFile(path.join(dir, 'mcp.json'), 'utf8')).mcpServers.webflow, custom);
    assert.equal(await readFile(path.join(dir, 'mcp-auth.json'), 'utf8'), auth);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('Vercel requests refreshable OAuth without replacing credentials or explicit server choices', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'pi-vercel-oauth-'));
  const env = { NEO_PROXY_URL: 'https://proxy.invalid/v1' };
  const options = { agentDir: dir, env, ompDir: path.join(dir, 'absent') };
  try {
    const auth = '{"synthetic":{"tokens":{"access_token":"keep","refresh_token":"keep-refresh"}}}\n';
    await writeFile(path.join(dir, 'mcp-auth.json'), auth);
    await writeFile(path.join(dir, 'mcp.json'), JSON.stringify({ mcpServers: {
      vercel: { type: 'http', url: 'https://mcp.vercel.com/', oauth: { callbackUrl: 'http://localhost:4321/callback' } },
    } }));
    for (let attempt = 0; attempt < 2; attempt++) {
      await prepareRuntime(options);
      const mcp = JSON.parse(await readFile(path.join(dir, 'mcp.json'), 'utf8'));
      assert.equal(mcp.mcpServers.vercel.oauth.scope, 'openid offline_access');
      assert.equal(mcp.mcpServers.vercel.oauth.callbackUrl, 'http://localhost:4321/callback');
      assert.equal(await readFile(path.join(dir, 'mcp-auth.json'), 'utf8'), auth);
    }
    for (const server of [
      { url: 'https://mcp.vercel.com', oauth: { scope: 'openid profile' } },
      { url: 'https://custom.invalid/mcp' },
    ]) {
      await writeFile(path.join(dir, 'mcp.json'), JSON.stringify({ mcpServers: { vercel: server } }));
      await prepareRuntime(options);
      const mcp = JSON.parse(await readFile(path.join(dir, 'mcp.json'), 'utf8'));
      assert.deepEqual(mcp.mcpServers.vercel, server);
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('Muninn bearer configuration upgrades existing entries without persisting the token', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'pi-muninn-auth-'));
  const options = { agentDir: dir, env: { NEO_PROXY_URL: 'https://proxy.invalid/v1', MUNINN_MCP_TOKEN: 'synthetic-secret' }, ompDir: path.join(dir, 'absent') };
  try {
    await writeFile(path.join(dir, 'mcp.json'), JSON.stringify({ mcpServers: {
      muninn: { url: 'https://vault.invalid/mcp', headers: { 'X-Custom': 'keep' } },
    } }));
    for (let attempt = 0; attempt < 2; attempt++) {
      await prepareRuntime(options);
      const text = await readFile(path.join(dir, 'mcp.json'), 'utf8');
      const { muninn } = JSON.parse(text).mcpServers;
      assert.equal(muninn.url, 'https://vault.invalid/mcp');
      assert.equal(muninn.headers['X-Custom'], 'keep');
      assert.equal(muninn.headers.Authorization, 'Bearer ${MUNINN_MCP_TOKEN}');
      assert.ok(!text.includes('synthetic-secret'));
    }
    const custom = { url: 'https://vault.invalid/mcp', headers: { Authorization: 'Bearer ${CUSTOM_VAULT_TOKEN}' } };
    await writeFile(path.join(dir, 'mcp.json'), JSON.stringify({ mcpServers: { muninn: custom } }));
    await prepareRuntime(options);
    assert.deepEqual(JSON.parse(await readFile(path.join(dir, 'mcp.json'), 'utf8')).mcpServers.muninn, custom);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('fresh hosts configure private MCP endpoints from environment without copying tokens', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'pi-private-endpoints-'));
  try {
    const env = { ...process.env, NEO_PROXY_URL: 'https://proxy.invalid',
      MUNINN_MCP_URL: 'http://127.0.0.1:8765/mcp', MUNINN_MCP_TOKEN: 'synthetic-vault-secret',
      COMPANY_LIBRARY_MCP_URL: 'https://library.invalid/mcp', COMPANY_LIBRARY_MCP_TOKEN: 'synthetic-library-secret' };
    await prepareRuntime({ agentDir: dir, env, ompDir: path.join(dir, 'absent') });
    const text = await readFile(path.join(dir, 'mcp.json'), 'utf8');
    const { mcpServers } = JSON.parse(text);
    assert.equal(mcpServers.muninn.url, env.MUNINN_MCP_URL);
    assert.equal(mcpServers.muninn.headers.Authorization, 'Bearer ${MUNINN_MCP_TOKEN}');
    assert.equal(mcpServers.company_library.url, env.COMPANY_LIBRARY_MCP_URL);
    assert.equal(mcpServers.company_library.headers.Authorization, 'Bearer ${COMPANY_LIBRARY_MCP_TOKEN}');
    assert.ok(!text.includes('synthetic-vault-secret') && !text.includes('synthetic-library-secret'));
    mcpServers.muninn.url = 'https://custom.invalid/mcp';
    await writeFile(path.join(dir, 'mcp.json'), JSON.stringify({ mcpServers }));
    await prepareRuntime({ agentDir: dir, env, ompDir: path.join(dir, 'absent') });
    assert.equal(JSON.parse(await readFile(path.join(dir, 'mcp.json'), 'utf8')).mcpServers.muninn.url, 'https://custom.invalid/mcp');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('native preparation ignores malformed legacy files and preserves private catalogue extensions', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'pi-no-omp-'));
  const env = { NEO_PROXY_URL: 'https://proxy.invalid', MIMER_BASE_URL: 'http://mimer.invalid:8080/' };
  try {
    const extra = { id: 'private-model', reasoning: false, input: ['text'], contextWindow: 8192, maxTokens: 1024 };
    await writeFile(path.join(dir, 'models.json'), JSON.stringify({ providers: { 'neo-proxy': { models: [extra, { id: 'Qwen3.8-27B-UD-Q6_K_L.gguf', reasoning: false }] }, mimer: { baseUrl: 'http://saved.invalid:8080', models: [extra] }, custom: { baseUrl: 'https://custom.invalid/v1', models: [extra] } } }));
    // Put poison legacy files in a separate location; native MCP state stays valid.
    const legacy = path.join(dir, 'legacy');
    await mkdir(legacy);
    for (const name of ['models.yml', 'models.db', 'mcp.json']) await writeFile(path.join(legacy, name), 'INVALID LEGACY FILE');
    await writeFile(path.join(dir, 'mcp.json'), JSON.stringify({ mcpServers: { custom: { url: 'https://custom.invalid/mcp' } } }));
    for (let i = 0; i < 2; i++) await prepareRuntime({ agentDir: dir, env, ompDir: legacy });
    const { providers } = JSON.parse(await readFile(path.join(dir, 'models.json'), 'utf8'));
    assert.equal(providers.mimer.baseUrl, 'http://mimer.invalid:8080/v1');
    assert.equal(providers['neo-proxy'].models.filter(m => m.id === 'Qwen3.8-27B-UD-Q6_K_L.gguf').length, 1);
    assert.deepEqual(providers['neo-proxy'].models.find(m => m.id === extra.id), extra);
    assert.deepEqual(providers.mimer.models.find(m => m.id === extra.id), extra);
    await prepareRuntime({ agentDir: dir, env: { NEO_PROXY_URL: env.NEO_PROXY_URL } });
    assert.equal(JSON.parse(await readFile(path.join(dir, 'models.json'), 'utf8')).providers.mimer.baseUrl, 'http://mimer.invalid:8080/v1');
    assert.equal(providers.custom.baseUrl, 'https://custom.invalid/v1');
    assert.equal(JSON.parse(await readFile(path.join(dir, 'mcp.json'), 'utf8')).mcpServers.custom.url, 'https://custom.invalid/mcp');
    await assert.rejects(prepareRuntime({ agentDir: dir, env: { NEO_PROXY_URL: 'https://proxy.invalid', MIMER_BASE_URL: 'file:///bad' } }), /MIMER_BASE_URL/);
    await assert.rejects(prepareRuntime({ agentDir: dir, env: { NEO_PROXY_URL: '' }, ompDir: legacy }), /NEO_PROXY_URL/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('optional Gimle provider uses private loopback access without changing roles', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'pi-gimle-'));
  try {
    const env = { NEO_PROXY_URL: 'https://proxy.invalid', GIMLE_QWEN_BASE_URL: 'http://127.0.0.1:18789/v1', GIMLE_QWEN_KEY_FILE: '/private/gimle-key' };
    const { roles } = await prepareRuntime({ agentDir: dir, env });
    const { providers } = JSON.parse(await readFile(path.join(dir, 'models.json'), 'utf8'));
    assert.equal(providers.gimle.baseUrl, env.GIMLE_QWEN_BASE_URL);
    assert.equal(providers.gimle.models[0].id, 'qwen3.5-9b-6bit');
    assert.equal(providers.gimle.models[0].contextWindow, 139264);
    assert.equal(providers.gimle.models[1].id, 'qwen3.5-9b-4bit');
    assert.equal(providers.gimle.models[1].contextWindow, 139264);
    assert.equal(providers.gimle.models[2].id, 'qwen3.5-9b-8bit');
    assert.equal(providers.gimle.models[2].contextWindow, 139264);
    assert.equal(providers.gimle.apiKey, '!cat /private/gimle-key');
    assert.notEqual(roles.default.provider, 'gimle');
    await assert.rejects(prepareRuntime({ agentDir: dir, env: { ...env, GIMLE_QWEN_BASE_URL: 'http://public.invalid/v1' } }), /loopback/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
