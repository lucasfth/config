import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { prepareRuntime, repoDir, sourceDir } from './runtime.mjs';
import { DefaultResourceLoader, SettingsManager } from '@earendil-works/pi-coding-agent';

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
    const models = JSON.parse(await readFile(path.join(dir, 'models.json'), 'utf8'));
    assert.equal(models.providers['neo-proxy'].baseUrl, 'https://proxy.invalid/v1');
    await prepareRuntime({ agentDir: dir, env: { ...env, NEO_PROXY_URL: 'https://proxy.invalid' }, ompDir: path.join(dir, 'absent') });
    const normalized = JSON.parse(await readFile(path.join(dir, 'models.json'), 'utf8'));
    assert.equal(normalized.providers['neo-proxy'].baseUrl, 'https://proxy.invalid/v1');
  } finally { await rm(dir, { recursive: true, force: true }); }
});


test('runtime does not select OpenAI when the Neo endpoint is unavailable', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'pi-runtime-missing-'));
  try {
    const env = { ...process.env, NEO_PROXY_URL: '', NEO_PROXY_API_KEY: '', ECORAY_MIMER_IP: '' };
    await assert.rejects(prepareRuntime({ agentDir: dir, env, ompDir: path.join(dir, 'absent') }), /NEO_PROXY_URL/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
