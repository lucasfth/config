import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  resolveModel,
  registerModelCommands,
  type ModelCommandApi,
} from "./models.ts";

const models = [
  { provider: "neo-proxy", id: "gpt-6-luna", name: "Luna", contextWindow: 1000, reasoning: true },
  { provider: "openai-codex", id: "gpt-6-luna", name: "Luna Codex", contextWindow: 2000, reasoning: true },
] as never[];

function api(overrides: Partial<ModelCommandApi> = {}): ModelCommandApi {
  return {
    registerCommand: () => {},
    getAll: () => models as never,
    currentModel: () => models[0] as never,
    hasConfiguredAuth: () => true,
    setModel: async () => true,
    getThinkingLevel: () => "medium",
    setThinkingLevel: () => {},
    getSettings: () => ({ defaultProvider: "neo-proxy", defaultModel: "gpt-6-luna" }),
    notify: () => {},
    select: async () => undefined,
    input: async () => undefined,
    agentDir: () => process.env.PI_CODING_AGENT_DIR!,
    ...overrides,
  };
}

test("resolveModel requires a provider-qualified selector when model ids collide", () => {
  assert.throws(() => resolveModel("gpt-6-luna", models as never), /ambiguous/i);
  assert.equal(resolveModel("neo-proxy/gpt-6-luna:high", models as never).thinkingLevel, "high");
  assert.throws(() => resolveModel("missing/model", models as never), /unknown/i);
  assert.equal(resolveModel("neo-proxy/gpt-6-luna:off", models as never).thinkingLevel, "off");
  assert.throws(() => resolveModel("gpt-6-luna:fast", models as never), /unknown/i);
});

test("/switch cancellation and unavailable auth leave active model unchanged", async () => {
  let changed = false;
  const messages: string[] = [];
  let command!: (args: string, ctx: never) => Promise<void>;
  const runtime = await mkdtemp(path.join(os.tmpdir(), "pi-models-switch-"));
  const oldDir = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = runtime;
  try {
    registerModelCommands(api({
      registerCommand: (_name, options) => { if (_name === "switch") command = options.handler as typeof command; },
      hasConfiguredAuth: () => false,
      setModel: async () => { changed = true; return true; },
      input: async () => undefined,
    }));
    await command("", { ui: { notify: (message: string) => messages.push(message) } } as never);
    await command("neo-proxy/gpt-6-luna", { ui: { notify: (message: string) => messages.push(message) } } as never);
    assert.equal(changed, false);
    assert.match(messages.join(" "), /Authentication is not configured/);
  } finally {
    if (oldDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = oldDir;
    await rm(runtime, { recursive: true, force: true });
  }
});

test("/models role assignment persists roles and modes without changing settings default", async () => {
  const runtime = await mkdtemp(path.join(os.tmpdir(), "pi-models-persist-"));
  const oldDir = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = runtime;
  try {
    await writeFile(path.join(runtime, "roles.json"), JSON.stringify({ default: { provider: "neo-proxy", modelId: "gpt-6-luna", thinkingLevel: "medium" }, task: { provider: "old", modelId: "keep", thinkingLevel: "low" } }));
    await writeFile(path.join(runtime, "modes.json"), JSON.stringify({ modes: { custom: { provider: "other", modelId: "keep", thinkingLevel: "low" } } }));
    await writeFile(path.join(runtime, "settings.json"), JSON.stringify({ defaultProvider: "neo-proxy", defaultModel: "gpt-6-luna", unrelated: true }));
    let command!: (args: string, ctx: never) => Promise<void>;
    registerModelCommands(api({
      registerCommand: (_name, options) => { if (_name === "models") command = options.handler as typeof command; },
    }));
    await command("role vision neo-proxy/gpt-6-luna:high", {} as never);
    const roles = JSON.parse(await readFile(path.join(runtime, "roles.json"), "utf8"));
    const modes = JSON.parse(await readFile(path.join(runtime, "modes.json"), "utf8"));
    const settings = JSON.parse(await readFile(path.join(runtime, "settings.json"), "utf8"));
    assert.deepEqual(roles.vision, { provider: "neo-proxy", modelId: "gpt-6-luna", thinkingLevel: "high" });
    assert.deepEqual(roles.task, { provider: "old", modelId: "keep", thinkingLevel: "low" });
    assert.deepEqual(modes.modes.custom, { provider: "other", modelId: "keep", thinkingLevel: "low" });
    assert.deepEqual(modes.modes.vision, roles.vision);
    assert.equal(settings.defaultModel, "gpt-6-luna");
    assert.equal(settings.unrelated, true);
    await command("default neo-proxy/gpt-6-luna:low", {} as never);
    const defaults = JSON.parse(await readFile(path.join(runtime, "settings.json"), "utf8"));
    assert.equal(defaults.defaultProvider, "neo-proxy");
    assert.equal(defaults.defaultModel, "gpt-6-luna");
    assert.equal(defaults.defaultThinkingLevel, "low");
    assert.equal(defaults.unrelated, true);
  } finally {
    if (oldDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = oldDir;
    await rm(runtime, { recursive: true, force: true });
  }
});



for (const roleCommand of ['model', 'models']) test(`/${roleCommand} opens role configuration before model selection and never switches the session`, async () => {
  const runtime = await mkdtemp(path.join(os.tmpdir(), 'pi-role-first-'));
  try {
    await writeFile(path.join(runtime, 'roles.json'), JSON.stringify({ default: { provider: 'neo-proxy', modelId: 'gpt-6-luna', thinkingLevel: 'medium' }, task: { provider: 'old', modelId: 'old-task', thinkingLevel: 'low' } }));
    await writeFile(path.join(runtime, 'settings.json'), JSON.stringify({ defaultProvider: 'neo-proxy', defaultModel: 'gpt-6-luna', subagents: { agentOverrides: { scout: { tools: ['read'] } } } }));
    let command!: (args: string, ctx: never) => Promise<void>;
    let switched = false;
    const menus: string[] = [];
    registerModelCommands(api({
      agentDir: () => runtime,
      registerCommand: (name, options) => { if (name === roleCommand) command = options.handler as typeof command; },
      setModel: async () => { switched = true; return true; },
      select: async (title, options) => {
        menus.push(title);
        if (title === 'Configure model roles') return options.find(option => option.startsWith('task '));
        if (title.startsWith('Thinking for task')) return 'high';
        return undefined;
      },
      pickModel: async () => 'neo-proxy/gpt-6-luna',
    }));
    await command('', { ui: { notify() {} } } as never);
    assert.equal(menus[0], 'Configure model roles');
    assert.equal(switched, false);
    const roles = JSON.parse(await readFile(path.join(runtime, 'roles.json'), 'utf8'));
    const settings = JSON.parse(await readFile(path.join(runtime, 'settings.json'), 'utf8'));
    assert.deepEqual(roles.task, { provider: 'neo-proxy', modelId: 'gpt-6-luna', thinkingLevel: 'high' });
    assert.equal(settings.subagents.defaultModel, 'neo-proxy/gpt-6-luna');
    assert.equal(settings.subagents.agentOverrides.scout.thinking, 'high');
    assert.deepEqual(settings.subagents.agentOverrides.scout.tools, ['read']);
    assert.equal(settings.defaultModel, 'gpt-6-luna');
  } finally { await rm(runtime, { recursive: true, force: true }); }
});
