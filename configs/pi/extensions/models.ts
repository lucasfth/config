import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { Model } from "@earendil-works/pi-ai";
import { pickModelOverlay } from './model-picker.ts';

const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
type ThinkingLevel = (typeof THINKING_LEVELS)[number];
type Role = { provider: string; modelId: string; thinkingLevel: ThinkingLevel };
const ROLE_NAME = /^[a-z][a-z0-9_-]*$/i;
type JsonObject = Record<string, unknown>;
type ModelChoice = Pick<Model<any>, "provider" | "id" | "name" | "contextWindow" | "reasoning">;

export type ModelCommandApi = {
  registerCommand(name: string, options: { description: string; handler: (args: string, ctx: ExtensionCommandContext) => Promise<void> }): void;
  getAll(): ModelChoice[];
  hasConfiguredAuth(model: ModelChoice): boolean;
  setModel(model: ModelChoice): Promise<boolean>;
  currentModel(): ModelChoice | undefined;
  getThinkingLevel(): string;
  setThinkingLevel(level: string): void;
  getSettings(): { defaultProvider?: string; defaultModel?: string };
  notify(message: string, type?: "info" | "warning" | "error"): void;
  select(title: string, options: string[]): Promise<string | undefined>;
  input(title: string, placeholder?: string): Promise<string | undefined>;
  agentDir(): string;
  pickModel?(title: string, includeRoles: boolean): Promise<string | undefined>;
};

function parseSelector(selector: string): { selector: string; thinkingLevel?: ThinkingLevel } {
  const value = selector.trim();
  const suffix = value.match(/:(off|minimal|low|medium|high|xhigh|max)$/)?.[1] as ThinkingLevel | undefined;
  return { selector: suffix ? value.slice(0, -(suffix.length + 1)) : value, thinkingLevel: suffix };
}

export function resolveModel(selector: string, models: ModelChoice[]): ModelChoice & { thinkingLevel?: ThinkingLevel } {
  const parsed = parseSelector(selector);
  const exact = models.filter(model => `${model.provider}/${model.id}` === parsed.selector);
  const matches = exact.length ? exact : models.filter(model => model.id === parsed.selector);
  if (matches.length === 0) throw new Error(`Unknown model "${parsed.selector}".`);
  if (matches.length > 1) throw new Error(`Model "${parsed.selector}" is ambiguous; use provider/model-id.`);
  return { ...matches[0], thinkingLevel: parsed.thinkingLevel };
}

function readJson(file: string): Promise<JsonObject> {
  return readFile(file, "utf8").then(text => {
    const data: unknown = JSON.parse(text);
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error(`${path.basename(file)} must contain a JSON object.`);
    return data as JsonObject;
  }).catch(error => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw new Error(`Cannot read ${path.basename(file)}: ${error instanceof Error ? error.message : String(error)}`);
  });
}

async function writeJsonAtomically(file: string, value: JsonObject): Promise<void> {
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await handle.sync();
  } catch (error) {
    await handle.close();
    await rm(temporary, { force: true });
    throw error;
  }
  await handle.close();
  try {
    await rename(temporary, file);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

async function runtimeFiles(api: ModelCommandApi) {
  const dir = api.agentDir();
  return {
    roles: path.join(dir, "roles.json"),
    modes: path.join(dir, "modes.json"),
    settings: path.join(dir, "settings.json"),
  };
}

async function loadRole(api: ModelCommandApi, roleName: string): Promise<Role | undefined> {
  const { roles } = await runtimeFiles(api);
  const data = await readJson(roles);
  const value = data[roleName];
  if (!value || typeof value !== "object" || !("provider" in value) || !("modelId" in value) || typeof value.provider !== "string" || typeof value.modelId !== "string") return undefined;
  const thinkingLevel = "thinkingLevel" in value && typeof value.thinkingLevel === "string" && THINKING_LEVELS.includes(value.thinkingLevel as ThinkingLevel) ? value.thinkingLevel as ThinkingLevel : "medium";
  return { provider: value.provider, modelId: value.modelId, thinkingLevel };
}
async function resolveSelection(api: ModelCommandApi, selector: string): Promise<ModelChoice & { thinkingLevel?: ThinkingLevel }> {
  const value = selector.trim();
  const roleSelector = value.match(/^@([^:]+)(?::(off|minimal|low|medium|high|xhigh|max))?$/) ?? value.match(/^([a-z][a-z0-9_-]*)(?::(off|minimal|low|medium|high|xhigh|max))?$/i);
  if (roleSelector) {
    const role = await loadRole(api, roleSelector[1]);
    if (role) {
      const model = resolveModel(`${role.provider}/${role.modelId}`, api.getAll());
      return { ...model, thinkingLevel: (roleSelector[2] as ThinkingLevel | undefined) ?? role.thinkingLevel };
    }
    if (value.startsWith("@")) throw new Error(`Unknown model role "${roleSelector[1]}".`);
  }
  return resolveModel(value, api.getAll());
}

function formatModel(model: ModelChoice, thinkingLevel?: string): string {
  return `${model.provider}/${model.id}${thinkingLevel ? `:${thinkingLevel}` : ""}`;
}

async function applySessionModel(api: ModelCommandApi, model: ModelChoice & { thinkingLevel?: ThinkingLevel }): Promise<void> {
  if (!api.hasConfiguredAuth(model)) throw new Error(`Authentication is not configured for ${model.provider}.`);
  if (!(await api.setModel(model))) throw new Error(`Authentication is not configured for ${model.provider}.`);
  if (model.thinkingLevel) api.setThinkingLevel(model.thinkingLevel);
  api.notify(`Session model: ${formatModel(model, model.thinkingLevel)}`, "info");
}
async function persistRole(api: ModelCommandApi, roleName: string, model: ModelChoice & { thinkingLevel?: ThinkingLevel }): Promise<void> {
  if (!ROLE_NAME.test(roleName)) throw new Error(`Invalid role name "${roleName}".`);
  if (!api.hasConfiguredAuth(model)) throw new Error(`Authentication is not configured for ${model.provider}.`);
  const files = await runtimeFiles(api);
  const role: Role = {
    provider: model.provider,
    modelId: model.id,
    thinkingLevel: model.thinkingLevel ?? api.getThinkingLevel() as ThinkingLevel,
  };
  const roles = await readJson(files.roles);
  roles[roleName] = role;
  const modes = await readJson(files.modes);
  const modeMap = modes.modes && typeof modes.modes === "object" && !Array.isArray(modes.modes) ? modes.modes : {};
  modes.modes = { ...modeMap, [roleName]: role };
  await writeJsonAtomically(files.roles, roles);
  await writeJsonAtomically(files.modes, modes);
  const settings = await readJson(files.settings);
  if (roleName === "default") {
    settings.defaultProvider = model.provider;
    settings.defaultModel = model.id;
    settings.defaultThinkingLevel = role.thinkingLevel;
  }
  if (roleName === 'task') {
    const subagents = settings.subagents && typeof settings.subagents === 'object' ? settings.subagents as JsonObject : {};
    const overrides = subagents.agentOverrides && typeof subagents.agentOverrides === 'object' ? subagents.agentOverrides as JsonObject : {};
    subagents.defaultModel = `${role.provider}/${role.modelId}`;
    for (const agent of ['task', 'scout', 'reviewer', 'security-reviewer', 'sonic']) {
      const previous = overrides[agent] && typeof overrides[agent] === 'object' ? overrides[agent] as JsonObject : {};
      overrides[agent] = { ...previous, model: subagents.defaultModel, thinking: role.thinkingLevel };
    }
    subagents.agentOverrides = overrides;
    settings.subagents = subagents;
  }
  if (roleName === 'summary') {
    const prune = settings.contextPrune && typeof settings.contextPrune === 'object' ? settings.contextPrune as JsonObject : {};
    settings.contextPrune = { ...prune, summarizerModel: `${role.provider}/${role.modelId}`, summarizerThinking: role.thinkingLevel };
  }
  if (roleName === 'default' || roleName === 'task' || roleName === 'summary') await writeJsonAtomically(files.settings, settings);
  api.notify(`Saved ${roleName} → ${formatModel(model, role.thinkingLevel)}${roleName === 'default' ? ' (future sessions)' : roleName === 'summary' ? ' (pruner applies on restart)' : ''}.`, 'info');
}
async function chooseModel(api: ModelCommandApi, title: string, includeRoles: boolean): Promise<string | undefined> {
  if (api.pickModel) return api.pickModel(title, includeRoles);
  const models = api.getAll();
  const currentSettings = api.getSettings();
  let query = "";
  for (;;) {
    const requested = await api.input(`${title} — filter models`, query);
    if (requested === undefined) return undefined;
    query = requested.trim();
    const normalized = query.toLocaleLowerCase();
    const currentModel = api.currentModel();
    const choices = models.filter(model => `${model.provider}/${model.id} ${model.name}`.toLocaleLowerCase().includes(normalized));
    choices.sort((left, right) => Number(right.provider === currentModel?.provider && right.id === currentModel?.id) - Number(left.provider === currentModel?.provider && left.id === currentModel?.id));
    const entries = choices.map(model => {
      const auth = api.hasConfiguredAuth(model) ? "ready" : "auth unavailable";
      const current = currentSettings.defaultProvider === model.provider && currentSettings.defaultModel === model.id ? " · default" : "";
      const selected = currentModel?.provider === model.provider && currentModel.id === model.id ? " · current" : "";
      return `${formatModel(model)} · ${model.contextWindow.toLocaleString()} tokens · ${auth}${current}${selected}`;
    });
    if (includeRoles) {
      const { roles } = await runtimeFiles(api);
      const saved = await readJson(roles);
      for (const [name, role] of Object.entries(saved)) {
        if (role && typeof role === "object" && "provider" in role && "modelId" in role) {
          const label = `@${name} → ${role.provider}/${role.modelId}`;
          if (!normalized || label.toLocaleLowerCase().includes(normalized)) entries.push(label);
        }
      }
    }
    if (entries.length === 0) {
      api.notify(`No models match "${query}".`, "warning");
      continue;
    }
    const selected = await api.select(`${title} — filter: ${query || "all"}`, entries);
    if (!selected) return undefined;
    const index = entries.indexOf(selected);
    if (includeRoles && index >= choices.length) return selected.split(" → ")[0];
    const model = choices[index];
    if (!model) continue;
    return formatModel(model);
  }
}

async function runSwitch(api: ModelCommandApi, args: string, ctx: ExtensionCommandContext): Promise<void> {
  try {
    const selector = args.trim() || await chooseModel(api, "Switch model for this session", false);
    if (!selector) return;
    const model = await resolveSelection(api, selector);
    await applySessionModel(api, model);
  } catch (error) {
    ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
  }
}

async function runModels(api: ModelCommandApi, args: string, ctx: ExtensionCommandContext): Promise<void> {
  try {
    const parts = args.trim().split(/\s+/).filter(Boolean);
    if (!parts[0] || parts[0] === "list" || parts[0] === "status") {
      const files = await runtimeFiles(api);
      const roles = await readJson(files.roles);
      const rows = Object.entries(roles).filter((entry): entry is [string, Role] => {
        const value = entry[1];
        return Boolean(value && typeof value === 'object' && 'provider' in value && 'modelId' in value);
      });
      const labels = rows.map(([name, value]) => `${name} → ${value.provider}/${value.modelId} · ${value.thinkingLevel ?? 'medium'}`);
      if (parts[0]) { ctx.ui.notify(labels.join('\n'), 'info'); return; }
      const choice = await api.select('Configure model roles', [...labels, 'Cancel']);
      if (!choice || choice === 'Cancel') return;
      const index = labels.indexOf(choice);
      if (index < 0) throw new Error('Unknown role selection.');
      const [name, previous] = rows[index];
      const selector = await chooseModel(api, `Assign model for ${name}`, false);
      if (!selector) return;
      const model = await resolveSelection(api, selector);
      if (!api.hasConfiguredAuth(model)) throw new Error(`Authentication is not configured for ${model.provider}.`);
      const options = model.reasoning ? [...THINKING_LEVELS] : ['off'];
      const thinking = await api.select(`Thinking for ${name}`, options);
      if (!thinking) return;
      await persistRole(api, name, { ...model, thinkingLevel: thinking as ThinkingLevel });
      return;
    }
    if (parts[0] === "role" && parts.length >= 3) {
      const roleName = parts[1].replace(/^@/, "");
      const model = await resolveSelection(api, parts.slice(2).join(" "));
      await persistRole(api, roleName, model);
      return;
    }
    if (parts[0] === "default" && parts.length >= 2) {
      const model = await resolveSelection(api, parts.slice(1).join(" "));
      await persistRole(api, "default", model);
      return;
    }
    ctx.ui.notify("Usage: /models [list|status|role <name> <provider/model[:thinking]>|default <provider/model[:thinking]>]", "warning");
  } catch (error) {
    ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
  }
}

export function registerModelCommands(api: ModelCommandApi): void {
  api.registerCommand("switch", {
    description: "Temporarily switch the session model; @role selects a configured role",
    handler: (args, ctx) => runSwitch(api, args, ctx),
  });
  for (const name of ["model", "models"]) {
    api.registerCommand(name, {
      description: "Configure saved model roles; /switch changes only this session",
      handler: (args, ctx) => runModels(api, args, ctx),
    });
  }
}

let activeContext: ExtensionCommandContext | undefined;

export default function modelsExtension(pi: ExtensionAPI): void {
  const api: ModelCommandApi = {
    registerCommand: (name, options) => pi.registerCommand(name, {
      ...options,
      handler: async (args, ctx) => {
        activeContext = ctx;
        try { await options.handler(args, ctx); }
        finally { activeContext = undefined; }
      },
    }),
    getAll: () => activeContext?.modelRegistry.getAll() ?? [],
    currentModel: () => activeContext?.model,
    hasConfiguredAuth: model => activeContext?.modelRegistry.hasConfiguredAuth(model as Model<any>) ?? false,
    setModel: model => pi.setModel(model as Model<any>),
    getThinkingLevel: () => pi.getThinkingLevel(),
    setThinkingLevel: level => pi.setThinkingLevel(level as ThinkingLevel),
    getSettings: () => pi.getSettings(),
    notify: (message, type) => activeContext?.ui.notify(message, type),
    select: (title, options) => activeContext?.ui.select(title, options) ?? Promise.resolve(undefined),
    input: (title, placeholder) => activeContext?.ui.input(title, placeholder) ?? Promise.resolve(undefined),
    pickModel: async (title, includeRoles) => {
      const ctx = activeContext;
      if (!ctx || ctx.mode !== 'tui') {
        const plainApi = { ...api, pickModel: undefined };
        return chooseModel(plainApi, title, includeRoles);
      }
      const available = ctx.modelRegistry.getAvailable();
      const choices = available.map(model => ({ value: `${model.provider}/${model.id}`, label: model.id, description: `${model.provider} · ${Math.round(model.contextWindow / 1000)}k context${ctx.model?.provider === model.provider && ctx.model.id === model.id ? ' · current' : ''}` }));
      if (includeRoles) {
        const roles = await readJson(path.join(api.agentDir(), 'roles.json'));
        for (const [name, value] of Object.entries(roles)) {
          if (value && typeof value === 'object' && 'provider' in value && 'modelId' in value) choices.unshift({ value: `@${name}`, label: `@${name}`, description: `${value.provider}/${value.modelId}` });
        }
      }
      return pickModelOverlay(ctx, title, choices);
    },
    agentDir: () => process.env.PI_CODING_AGENT_DIR ?? path.join(process.env.HOME ?? process.cwd(), ".local/share/huginn-pi/agent"),
  };
  registerModelCommands(api);
}
