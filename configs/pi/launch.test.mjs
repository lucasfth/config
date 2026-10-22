import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
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
    await prepareRuntime({ agentDir: dir, env: { ...env, NEO_PROXY_URL: 'https://proxy.invalid' }, ompDir: path.join(dir, 'absent') });
    const normalized = JSON.parse(await readFile(path.join(dir, 'models.json'), 'utf8'));
    assert.equal(normalized.providers['neo-proxy'].baseUrl, 'https://proxy.invalid/v1');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('Mimer uses the OpenAI v1 base path and keeps the Qwen compatibility alias', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'pi-mimer-runtime-'));
  try {
    await prepareRuntime({
      agentDir: dir,
      env: { NEO_PROXY_URL: 'https://proxy.invalid/v1', ECORAY_MIMER_IP: 'mimer.invalid' },
      ompDir: path.join(dir, 'absent'),
    });
    const { providers } = JSON.parse(await readFile(path.join(dir, 'models.json'), 'utf8'));
    assert.equal(providers.mimer.baseUrl, 'http://mimer.invalid:8080/v1');
    assert.equal(providers.mimer.api, 'openai-completions');
    assert.equal(providers.mimer.models[0].id, 'Qwen3.8-27B-UD-Q6_K_L.gguf');
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
