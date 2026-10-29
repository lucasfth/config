import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import http from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createAssistantMessageEventStream, InMemoryCredentialStore, InMemoryModelsStore } from '@earendil-works/pi-ai';
import { createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager } from '@earendil-works/pi-coding-agent';
import { createFleetExtension, FleetReporter } from './extensions/fleet.ts';
import { prepareRuntime, sourceDir } from './runtime.mjs';

const token = 'synthetic-fleet-test-token-not-a-real-secret';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, description) {
  const deadline = Date.now() + 4000;
  while (!check() && Date.now() < deadline) await sleep(5);
  assert.ok(check(), description);
}
async function receiver(handler) {
  const rows = [];
  const server = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    const row = JSON.parse(body);
    rows.push({ row, authorization: req.headers.authorization });
    if (handler) handler(req, res, row); else { res.writeHead(204); res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { rows, server, endpoint: `http://127.0.0.1:${server.address().port}/api/admin/fleet/report`,
    async close() { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } };
}
const timing = { heartbeatMs: 100, coalesceMs: 10, timeoutMs: 100 };

async function nativeSession(root, configPath, sessionManager = SessionManager.inMemory(root), outcome = 'stop', retry = { enabled: false }) {
  const runtime = await ModelRuntime.create({ modelsPath: null, credentials: new InMemoryCredentialStore(), modelsStore: new InMemoryModelsStore(), refreshOnCreate: false });
  runtime.hasConfiguredAuth = () => true; // scripted stream only, never provider auth/traffic
  const model = runtime.getModels().find(model => model.api === 'openai-completions');
  const settings = SettingsManager.inMemory({ packages: [], extensions: [], skills: [], prompts: [], retry, compaction: { enabled: false }, cacheWarming: 'off' });
  const loader = new DefaultResourceLoader({ cwd: root, agentDir: root, settingsManager: settings,
    noExtensions: true, noSkills: true, noThemes: true, noPromptTemplates: true, noContextFiles: true,
    extensionFactories: [createFleetExtension({ configPath, allowTestLoopback: true, timing })],
    systemPromptOverride: () => 'Synthetic lifecycle proof only.', appendSystemPromptOverride: () => [],
  });
  await loader.reload();
  const made = await createAgentSession({ cwd: root, agentDir: root, modelRuntime: runtime, model, thinkingLevel: 'off',
    resourceLoader: loader, settingsManager: settings, sessionManager, tools: ['read'] });
  assert.equal(made.extensionsResult.errors.length, 0);
  let turn = 0;
  made.session.agent.streamFunction = () => {
    const stream = createAssistantMessageEventStream();
    const first = turn++ === 0;
    const message = { role: 'assistant', api: model.api, provider: model.provider, model: model.id, timestamp: Date.now(),
      content: outcome !== 'stop' ? [] : first ? [{ type: 'toolCall', id: 'synthetic-call', name: 'read', arguments: { path: 'private-canary.txt' } }] : [{ type: 'text', text: 'PRIVATE_OUTPUT_CANARY' }],
      usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { total: 0 } }, stopReason: outcome !== 'stop' ? outcome : first ? 'toolUse' : 'stop' };
    setTimeout(() => {
      stream.push(outcome === 'stop' ? { type: 'done', reason: message.stopReason, message } : { type: 'error', reason: outcome, error: { ...message, errorMessage: 'PRIVATE_ERROR_CANARY' } });
      stream.end(message);
    }, 35);
    return stream;
  };
  const errors = [];
  await made.session.bindExtensions({ mode: 'print', onError: error => errors.push(error) });
  return { session: made.session, errors, model };
}

test('native SDK prompt/tool/settlement, explicit label, heartbeat, reload and shutdown produce private wire v1', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'fleet-sdk-'));
  const rx = await receiver();
  let session;
  try {
    const configPath = path.join(root, 'fleet.json');
    await writeFile(configPath, JSON.stringify({ endpoint: rx.endpoint, hostId: 'gimle', token }), { mode: 0o600 });
    await writeFile(path.join(root, 'private-canary.txt'), 'PRIVATE_FILE_CANARY');
    const made = await nativeSession(root, configPath);
    session = made.session;
    await until(() => rx.rows.length > 0, 'session_start reaches actual HTTP receiver');
    const expectedId = createHash('sha256').update(session.sessionManager.getSessionId()).digest('hex').slice(0, 32);
    assert.equal(rx.rows[0].row.label, `Pi session ${expectedId.slice(0, 8)}`);
    await session.prompt('/fleet-name Admin feature');
    await session.prompt('PRIVATE_PROMPT_CANARY');
    await until(() => rx.rows.some(({ row }) => row.lastToolCompletedAt && row.state === 'idle'), 'actual completed tool and settled signal');
    assert.ok(rx.rows.some(({ row }) => row.state === 'working'));
    assert.equal(rx.rows.at(-1).row.label, 'Admin feature');
    const count = rx.rows.length;
    await until(() => rx.rows.length > count, 'heartbeat while idle');
    assert.equal(rx.rows.at(-1).row.lastToolCompletedAt, rx.rows[count - 1].row.lastToolCompletedAt);
    const oldStart = rx.rows[0].row.startedAt;
    await session.reload();
    await until(() => rx.rows.some(({ row }) => row.startedAt !== oldStart), 'reload creates new reporter');
    const oldCount = rx.rows.filter(({ row }) => row.startedAt === oldStart).length;
    assert.equal(rx.rows.filter(({ row }) => row.startedAt === oldStart).at(-1).row.state, 'ended');
    await sleep(230);
    assert.equal(rx.rows.filter(({ row }) => row.startedAt === oldStart).length, oldCount, 'no old heartbeat after reload');
    assert.equal(rx.rows.at(-1).row.label, 'Admin feature', 'explicit label reconstructed from native custom entry');
    await session.extensionRunner.emit({ type: 'session_shutdown', reason: 'quit' });
    assert.equal(rx.rows.at(-1).row.state, 'ended');
    const finalCount = rx.rows.length;
    await sleep(220);
    assert.equal(rx.rows.length, finalCount, 'shutdown removes all timers');
    const previous = new Map();
    for (const { row, authorization } of rx.rows) {
      assert.equal(authorization, `Bearer ${token}`);
      assert.deepEqual(Object.keys(row).sort(), ['schemaVersion', 'hostId', 'sessionId', 'label', 'state', 'observedAt', 'lastToolCompletedAt', 'startedAt', 'sequence'].sort());
      assert.equal(row.schemaVersion, 1); assert.equal(row.hostId, 'gimle'); assert.equal(row.sessionId, expectedId);
      assert.equal(new Date(row.observedAt).toISOString(), row.observedAt);
      assert.ok(row.startedAt <= row.observedAt);
      assert.ok(!row.lastToolCompletedAt || row.lastToolCompletedAt <= row.observedAt);
      assert.ok(row.sequence > (previous.get(row.startedAt) ?? -1)); previous.set(row.startedAt, row.sequence);
    }
    const wire = JSON.stringify(rx.rows.map(({ row }) => row));
    for (const canary of [root, session.sessionManager.getSessionId(), token, 'PRIVATE_PROMPT_CANARY', 'PRIVATE_OUTPUT_CANARY', 'PRIVATE_FILE_CANARY', 'private-canary.txt', 'synthetic-call']) assert.ok(!wire.includes(canary), canary);
    assert.equal(made.errors.length, 0);
  } finally { await session?.extensionRunner.emit({ type: 'session_shutdown', reason: 'quit' }); session?.dispose(); await rx.close(); await rm(root, { recursive: true, force: true }); }
});

test('unconfigured and unreachable receivers never fail native agent work; failures remain locally honest', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'fleet-offline-'));
  try {
    const configPath = path.join(root, 'fleet.json');
    for (const configured of [false, true]) {
      if (configured) await writeFile(configPath, JSON.stringify({ endpoint: 'http://127.0.0.1:1/api/admin/fleet/report', hostId: 'macbook', token }), { mode: 0o600 });
      const { session, errors } = await nativeSession(root, configPath);
      try {
        await session.prompt('PRIVATE_PROMPT_CANARY'); // read fails too: completed envelope still supported
        await session.prompt('/fleet-status');
        assert.equal(session.getLastAssistantText(), 'PRIVATE_OUTPUT_CANARY');
        assert.equal(errors.length, 0);
      } finally { await session.extensionRunner.emit({ type: 'session_shutdown', reason: 'quit' }); session.dispose(); }
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('reporter coalesces bursts with one in-flight request, times out, cancels, never forwards redirect credentials', async () => {
  let active = 0, maxActive = 0;
  const rx = await receiver((_req, res) => { active++; maxActive = Math.max(maxActive, active); res.on('close', () => active--); });
  const reporter = new FleetReporter({ endpoint: rx.endpoint, hostId: 'gimle', token }, 'synthetic-native-id', undefined, { heartbeatMs: 1000, coalesceMs: 80, timeoutMs: 50 });
  try {
    await until(() => rx.rows.length === 1, 'first receipt');
    for (let i = 0; i < 1000; i++) reporter.update({ toolCompleted: true });
    await until(() => rx.rows.length === 2, 'only latest snapshot after burst');
    await until(() => reporter.status.startsWith('unavailable'), 'timeout diagnostics');
    assert.equal(maxActive, 1);
    const before = Date.now(); await reporter.close();
    assert.ok(Date.now() - before < 1000, 'bounded close');
    const count = rx.rows.length; await sleep(150); assert.equal(rx.rows.length, count);
  } finally { await reporter.close(); await rx.close(); }
  const target = await receiver();
  const redirect = await receiver((_req, res) => { res.writeHead(307, { Location: target.endpoint }); res.end(); });
  const redirectReporter = new FleetReporter({ endpoint: redirect.endpoint, hostId: 'gimle', token }, 'synthetic-native-id', undefined, timing);
  try { await until(() => redirectReporter.status.startsWith('unavailable'), 'redirect rejected'); assert.equal(target.rows.length, 0); }
  finally { await redirectReporter.close(); await redirect.close(); await target.close(); }
});

test('fresh runtime registers fleet for personal and native child launches without touching private config', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'fleet-runtime-'));
  try {
    const privateFile = path.join(root, 'fleet.json');
    await writeFile(privateFile, 'operator-owned-private-content', { mode: 0o600 });
    const { settings } = await prepareRuntime({ agentDir: root, ompDir: path.join(root, 'absent'), env: { NEO_PROXY_URL: 'https://proxy.invalid' } });
    assert.ok(settings.extensions.includes(path.join(sourceDir, 'extensions/fleet.ts')));
    assert.ok(settings.subagents.defaultExtensions.includes(path.join(sourceDir, 'extensions/fleet.ts')));
    const { readFile } = await import('node:fs/promises');
    assert.equal(await readFile(privateFile, 'utf8'), 'operator-owned-private-content');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('native error/abort and failed-tool envelopes report observation without exporting error content', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'fleet-outcomes-'));
  const rx = await receiver();
  try {
    const configPath = path.join(root, 'fleet.json');
    await writeFile(configPath, JSON.stringify({ endpoint: rx.endpoint, hostId: 'macbook', token }), { mode: 0o600 });
    for (const outcome of ['error', 'aborted', 'stop']) {
      const { session, errors } = await nativeSession(root, configPath, SessionManager.inMemory(root), outcome);
      try {
        const id = createHash('sha256').update(session.sessionManager.getSessionId()).digest('hex').slice(0, 32);
        await session.prompt('PRIVATE_PROMPT_CANARY');
        const state = outcome === 'error' ? 'error' : outcome === 'aborted' ? 'unknown' : 'idle';
        await until(() => rx.rows.some(({ row }) => row.sessionId === id && row.state === state && (outcome !== 'stop' || row.lastToolCompletedAt)), `native ${outcome} observation`);
        assert.equal(errors.length, 0);
      } finally { await session.extensionRunner.emit({ type: 'session_shutdown', reason: 'quit' }); session.dispose(); }
    }
    assert.ok(!JSON.stringify(rx.rows).includes('PRIVATE_ERROR_CANARY'));
    assert.ok(!JSON.stringify(rx.rows).includes('private-canary.txt'));
  } finally { await rx.close(); await rm(root, { recursive: true, force: true }); }
});

test('native retry recovery stays idle, terminal error stays error, cancellation during backoff wins over prior error', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'fleet-retry-'));
  const rx = await receiver();
  try {
    const configPath = path.join(root, 'fleet.json');
    await writeFile(configPath, JSON.stringify({ endpoint: rx.endpoint, hostId: 'gimle', token }), { mode: 0o600 });
    for (const scenario of ['recovered', 'terminal', 'cancelled']) {
      const { session, model, errors } = await nativeSession(root, configPath, SessionManager.inMemory(root), 'stop', { enabled: true, maxRetries: 1, baseDelayMs: 40, maxDelayMs: 40 });
      let calls = 0;
      const events = [];
      session.subscribe(event => {
        if (['agent_start', 'auto_retry_start', 'agent_settled'].includes(event.type)) events.push(event);
        if (scenario === 'cancelled' && event.type === 'auto_retry_start') setTimeout(() => { void session.abort(); }, 5);
      });
      session.agent.streamFunction = () => {
        const stream = createAssistantMessageEventStream();
        const failed = ++calls === 1 || scenario === 'terminal';
        const message = { role: 'assistant', api: model.api, provider: model.provider, model: model.id, timestamp: Date.now(),
          content: failed ? [] : [{ type: 'text', text: 'synthetic recovered' }],
          usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { total: 0 } },
          stopReason: failed ? 'error' : 'stop', ...(failed ? { errorMessage: '503 Service unavailable' } : {}) };
        setTimeout(() => { stream.push(failed ? { type: 'error', reason: 'error', error: message } : { type: 'done', reason: 'stop', message }); stream.end(message); }, 5);
        return stream;
      };
      try {
        await session.prompt('synthetic retry test');
        const id = createHash('sha256').update(session.sessionManager.getSessionId()).digest('hex').slice(0, 32);
        const count = rx.rows.length;
        await until(() => rx.rows.length > count && rx.rows.at(-1).row.sessionId === id, 'fresh settled receipt after prompt');
        assert.equal(rx.rows.at(-1).row.state, scenario === 'recovered' ? 'idle' : scenario === 'cancelled' ? 'unknown' : 'error', scenario);
        assert.equal(calls, scenario === 'cancelled' ? 1 : 2);
        assert.ok(events.some(event => event.type === 'auto_retry_start'));
        assert.equal(events.filter(event => event.type === 'agent_start').length, scenario === 'cancelled' ? 1 : 2);
        assert.equal(events.findLast(event => event.type === 'agent_settled').aborted, scenario === 'cancelled');
        assert.equal(errors.length, 0);
      } finally { await session.extensionRunner.emit({ type: 'session_shutdown', reason: 'quit' }); session.dispose(); }
    }
  } finally { await rx.close(); await rm(root, { recursive: true, force: true }); }
});

test('native tree navigation reconstructs earlier/default labels without resetting reporter ordering', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'fleet-tree-'));
  const rx = await receiver();
  let session;
  try {
    const configPath = path.join(root, 'fleet.json');
    await writeFile(configPath, JSON.stringify({ endpoint: rx.endpoint, hostId: 'gimle', token }), { mode: 0o600 });
    const manager = SessionManager.inMemory(root);
    const beforeLabel = manager.appendCustomEntry('synthetic-anchor', {});
    const made = await nativeSession(root, configPath, manager);
    session = made.session;
    await until(() => rx.rows.length > 0, 'initial registration');
    const initial = rx.rows[0].row;
    await session.prompt('/fleet-name First branch');
    const firstId = manager.getLeafId();
    await session.prompt('/fleet-name Second branch');
    await until(() => rx.rows.at(-1).row.label === 'Second branch', 'second label received');
    for (const [target, label] of [[firstId, 'First branch'], [beforeLabel, initial.label]]) {
      const previous = rx.rows.at(-1).row;
      await session.navigateTree(target, { summarize: false });
      const count = rx.rows.length;
      await until(() => rx.rows.length > count, 'new receipt after actual tree navigation');
      const latest = rx.rows.at(-1).row;
      assert.equal(latest.label, label);
      assert.equal(latest.startedAt, initial.startedAt);
      assert.equal(latest.sessionId, initial.sessionId);
      assert.ok(latest.sequence > previous.sequence);
      assert.ok(!rx.rows.some(({ row }) => row.state === 'ended'));
      const heartbeatCount = rx.rows.length;
      await until(() => rx.rows.length > heartbeatCount, 'next heartbeat retains reconstructed branch label');
      assert.equal(rx.rows.at(-1).row.label, label);
      assert.equal(rx.rows.at(-1).row.startedAt, initial.startedAt);
      assert.deepEqual(manager.getBranch().filter(entry => entry.type === 'custom' && entry.customType === 'fleet-label').map(entry => entry.data.label), label === initial.label ? [] : ['First branch']);
    }
    assert.equal(made.errors.length, 0);
  } finally { await session?.extensionRunner.emit({ type: 'session_shutdown', reason: 'quit' }); session?.dispose(); await rx.close(); await rm(root, { recursive: true, force: true }); }
});

test('202/409/429/503 handling stays bounded and never queues retries without another observation', async () => {
  for (const status of [202, 409, 429, 503]) {
    const rx = await receiver((_req, res) => { res.writeHead(status); res.end('PRIVATE_RECEIVER_ERROR_CANARY'); });
    const reporter = new FleetReporter({ endpoint: rx.endpoint, hostId: 'gimle', token }, `synthetic-status-${status}`, undefined, { heartbeatMs: 10_000, coalesceMs: 10, timeoutMs: 500 });
    try {
      await until(() => reporter.status !== 'configured; awaiting receipt', 'HTTP status observed');
      assert.equal(reporter.status, status === 202 ? 'receiver acknowledged; not task success' : 'unavailable: receiver rejected report');
      await sleep(70);
      assert.equal(rx.rows.length, 1, 'no failure retry queue');
      reporter.update({ state: 'working' });
      await until(() => rx.rows.length === 2, 'later independent observation sends latest snapshot');
      assert.equal(rx.rows[1].row.state, 'working');
      assert.equal(rx.rows[1].row.sequence, 1);
      assert.ok(!reporter.status.includes('PRIVATE_'));
    } finally { await reporter.close(); await rx.close(); }
  }
});
