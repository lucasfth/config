import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { prepareRuntime } from './runtime.mjs';
import { registerModelCommands } from './extensions/models.ts';
import { discoverAgents } from './node_modules/pi-subagents/src/agents/agents.js';
import { resolveEffectiveSubagentModel } from './node_modules/pi-subagents/src/runs/shared/model-resolution.js';

const routes = {
  task: 'task', scout: 'task', reviewer: 'task', 'security-reviewer': 'task',
  sonic: 'smol', smol: 'smol', vision: 'vision', designer: 'designer', tiny: 'tiny', slow: 'slow',
};
const roles = Object.fromEntries([...new Set(Object.values(routes))].map((name, index) => [name, {
  provider: 'fixture', modelId: `${name}-model`, thinkingLevel: index % 2 ? 'off' : 'high',
}]));
const parent = { provider: 'parent', id: 'session-model' };

async function fixture(run) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'pi-subagent-roles-'));
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = dir;
  try {
    await writeFile(path.join(dir, 'roles.json'), JSON.stringify(roles));
    await writeFile(path.join(dir, 'settings.json'), JSON.stringify({ subagents: {
      agentOverrides: { sonic: { tools: ['read'] }, custom: { model: 'custom/keep' } },
    } }));
    const prepare = () => prepareRuntime({ agentDir: dir, env: { NEO_PROXY_URL: 'https://proxy.invalid/v1' } });
    await prepare();
    const agents = () => new Map(discoverAgents(dir, 'both', 'fixture').agents.map(agent => [agent.name, agent]));
    await run({ dir, agents, prepare });
  } finally {
    if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previous;
    await rm(dir, { recursive: true, force: true });
  }
}

test('prepared role defaults reach real subagent discovery without inheriting the session model', async () => {
  await fixture(async ({ dir, agents, prepare }) => {
    for (let pass = 0; pass < 2; pass++) {
      const discovered = agents();
      for (const [name, roleName] of Object.entries(routes)) {
        const agent = discovered.get(name);
        assert.ok(agent, `missing ${name} agent`);
        const role = roles[roleName];
        const expected = `${role.provider}/${role.modelId}`;
        assert.equal(agent.model, expected, `${name} follows ${roleName}`);
        assert.equal(agent.thinking, role.thinkingLevel, `${name} thinking follows ${roleName}`);
        assert.equal(resolveEffectiveSubagentModel(undefined, agent.model, parent), expected);
        assert.equal(resolveEffectiveSubagentModel('override/recovery-model:low', agent.model, parent), 'override/recovery-model:low');
        assert.equal(resolveEffectiveSubagentModel('inherit', agent.model, parent), 'parent/session-model');
        assert.throws(() => resolveEffectiveSubagentModel('missing/unavailable', agent.model, parent, [
          { provider: role.provider, id: role.modelId, fullId: expected },
        ]), /Unknown subagent model/, 'an unavailable explicit model must not silently fall back');
      }
      assert.deepEqual(discovered.get('sonic').tools, ['read']);
      const settings = JSON.parse(await readFile(path.join(dir, 'settings.json'), 'utf8'));
      assert.equal(settings.subagents.defaultModel, 'fixture/task-model');
      assert.equal(settings.subagents.agentOverrides.custom.model, 'custom/keep');
      await prepare();
    }
  });
});

test('/model role changes refresh only matching routes for the next discovery, then survive preparation', async () => {
  await fixture(async ({ dir, agents, prepare }) => {
    let command;
    registerModelCommands({
      registerCommand: (name, options) => { if (name === 'model') command = options.handler; },
      agentDir: () => dir,
      getAll: () => Object.keys(roles).map(name => ({ provider: 'replacement', id: `${name}-chosen`, reasoning: true })),
      hasConfiguredAuth: () => true,
      getThinkingLevel: () => 'medium',
      setModel: () => { throw new Error('role assignment must not switch the parent'); },
      notify() {},
    });
    for (const roleName of Object.keys(roles)) {
      const before = agents(); // Exercise the package's cached discovery before a settings change.
      const errors = [];
      await command(`role ${roleName} replacement/${roleName}-chosen:low`, { ui: { notify: message => errors.push(message) } });
      assert.deepEqual(errors, []);
      const after = agents();
      for (const [name, mappedRole] of Object.entries(routes)) {
        const changed = mappedRole === roleName;
        assert.equal(after.get(name).model, changed ? `replacement/${roleName}-chosen` : before.get(name).model, name);
        assert.equal(after.get(name).thinking, changed ? 'low' : before.get(name).thinking, name);
        assert.equal(resolveEffectiveSubagentModel('override/recovery:off', after.get(name).model, parent), 'override/recovery:off');
      }
      await prepare();
      for (const name of Object.keys(routes)) assert.equal(agents().get(name).model, after.get(name).model);
    }
  });
});

test('real SDK /model command updates registered subagent list defaults without a model request', async () => {
  await fixture(async ({ dir }) => {
    const { createAgentSession, SessionManager } = await import('@earendil-works/pi-coding-agent');
    const settingsFile = path.join(dir, 'settings.json');
    const settings = JSON.parse(await readFile(settingsFile, 'utf8'));
    const sourceDir = path.dirname(fileURLToPath(import.meta.url));
    settings.extensions = [path.join(sourceDir, 'extensions/models.ts'), path.join(sourceDir, 'node_modules/pi-subagents/bundle/index.js')];
    settings.packages = []; settings.skills = [];
    await writeFile(settingsFile, JSON.stringify(settings));
    await writeFile(path.join(dir, 'mcp.json'), '{"mcpServers":{}}');
    // Synthetic local auth enables selection; no provider request or child is launched.
    await writeFile(path.join(dir, 'auth.json'), JSON.stringify({ 'neo-proxy': { type: 'api_key', key: 'fixture' } }));
    const made = await createAgentSession({ cwd: dir, agentDir: dir, sessionManager: SessionManager.inMemory() });
    const session = made.session;
    try {
      assert.deepEqual(made.extensionsResult.errors, []);
      await session.bindExtensions({ mode: 'print' });
      const initial = session.model;
      const tool = session.extensionRunner.getToolDefinition('subagent');
      assert.ok(tool, 'actual package subagent tool is registered');
      const list = () => tool.execute('roles-list', { action: 'list' }, undefined, undefined, session.extensionRunner.createToolContext('roles-list', undefined));
      const before = await list();
      assert.ok(!before.isError, JSON.stringify(before));
      assert.match(JSON.stringify(before), /vision/);
      await session.prompt('/model role vision neo-proxy/claude-opus-5-5:low');
      const after = await list();
      assert.ok(!after.isError, JSON.stringify(after));
      const discovered = new Map(discoverAgents(dir, 'user', 'neo-proxy').agents.map(agent => [agent.name, agent]));
      assert.equal(discovered.get('vision').model, 'neo-proxy/claude-opus-5-5');
      assert.equal(discovered.get('vision').thinking, 'low');
      assert.equal(discovered.get('smol').model, 'fixture/smol-model');
      assert.equal(session.model.id, initial.id);
      assert.equal(session.model.provider, initial.provider);
      assert.equal(session.messages.filter(message => message.role === 'assistant').length, 0);
    } finally { session.dispose(); }
  });
});
