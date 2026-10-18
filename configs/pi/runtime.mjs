import { readdirSync, existsSync } from 'node:fs';
import { chmod, copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

export const sourceDir = path.dirname(fileURLToPath(import.meta.url));
export const repoDir = path.resolve(sourceDir, '../..');


const canonicalSkillsDir = path.join(repoDir, '.omp/skills');

function canonicalSkillPaths() {
  const projectSkills = new Set();
  let directory = process.cwd();
  for (;;) {
    const root = path.join(directory, '.pi/skills');
    if (existsSync(root)) for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (existsSync(path.join(root, entry.name, 'SKILL.md'))) projectSkills.add(entry.name);
    }
    const parent = path.dirname(directory);
    if (parent === directory || directory === repoDir || directory === os.homedir()) break;
    directory = parent;
  }
  return readdirSync(canonicalSkillsDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name !== 'using-freyr-browser' && !projectSkills.has(entry.name) && existsSync(path.join(canonicalSkillsDir, entry.name, 'SKILL.md')))
    .map(entry => path.join(canonicalSkillsDir, entry.name, 'SKILL.md'));
}
async function jsonFile(filename, fallback = {}) {
  try { return JSON.parse(await readFile(filename, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}

async function yamlFile(filename) {
  try { return YAML.parse(await readFile(filename, 'utf8')) ?? {}; }
  catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
}

async function privateJson(filename, value) {
  await mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
  const temporary = `${filename}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  await rename(temporary, filename);
  await chmod(filename, 0o600);
}

function cachedProxyModels(ompDir) {
  let db;
  try {
    db = new DatabaseSync(path.join(ompDir, 'models.db'), { readOnly: true });
    const rows = db.prepare('SELECT models FROM model_cache WHERE provider_id LIKE ? ORDER BY updated_at').all('neo-proxy:%');
    const models = new Map();
    for (const row of rows) for (const model of JSON.parse(row.models)) {
      if (model.type && model.type !== 'chat') continue;
      if (!model.id || !model.contextWindow || !model.maxTokens) continue;
      const { id, name, reasoning, input, contextWindow, maxTokens, cost, compat, thinkingLevelMap } = model;
      models.set(id, { id, name: name || id, reasoning: Boolean(reasoning), input: input || ['text'], contextWindow, maxTokens,
        ...(cost ? { cost } : {}), ...(compat ? { compat } : {}), ...(thinkingLevelMap ? { thinkingLevelMap } : {}) });
    }
    return [...models.values()];
  } catch (error) {
    if (error.code === 'ERR_SQLITE_ERROR' || error.code === 'ENOENT') return [];
    throw error;
  } finally { db?.close(); }
}

function requiredProxyModels() {
  return ['gpt-6.1-sol', 'gpt-6-luna', 'claude-opus-5-5', 'claude-haiku-5-5'].map(id => ({
    id, name: id, reasoning: true, input: ['text', 'image'],
    contextWindow: id.startsWith('claude-') ? 1000000 : 1050000, maxTokens: 128000,
  }));
}

export async function prepareRuntime({ agentDir, env = process.env, ompDir = path.join(os.homedir(), '.omp/agent') }) {
  agentDir = path.resolve(agentDir);
  const sourceRoles = await jsonFile(path.join(sourceDir, 'roles.json'));
  const roles = { ...sourceRoles, ...await jsonFile(path.join(agentDir, 'roles.json')) };
  const sourceSettings = await jsonFile(path.join(sourceDir, 'settings.json'));
  const previous = await jsonFile(path.join(agentDir, 'settings.json'));
  const ompModels = await yamlFile(path.join(ompDir, 'models.yml'));
  const neo = ompModels.providers?.['neo-proxy'] ?? {};
  const endpoint = env.NEO_PROXY_URL || neo.baseUrl;
  if (!endpoint) throw new Error('NEO_PROXY_URL is missing; configure the Neo endpoint before launching this Pi profile.');
  const normalizedEndpoint = new URL(endpoint);
  if (!['http:', 'https:'].includes(normalizedEndpoint.protocol)) throw new Error('NEO_PROXY_URL must be an HTTP(S) endpoint.');
  // nix_secrets stores the proxy origin; compatible clients need the API base.
  // Preserve explicit non-root paths instead of guessing alternate prefixes.
  if (normalizedEndpoint.pathname === '/') normalizedEndpoint.pathname = '/v1';
  await mkdir(agentDir, { recursive: true, mode: 0o700 });
  await chmod(agentDir, 0o700);

  const moduleDir = path.join(sourceDir, 'node_modules');
  const themesDir = path.join(agentDir, 'themes');
  for (const appearance of ['light', 'dark']) {
    const palette = await jsonFile(path.join(moduleDir, '@earendil-works/pi-coding-agent/dist/modes/interactive/theme', `${appearance}.json`));
    palette.name = `omp-${appearance}`;
    palette.colors.userMessageBg = appearance === 'dark' ? '#11111b' : '#e6e9ef';
    palette.colors.customMessageBg = '';
    palette.colors.toolPendingBg = appearance === 'dark' ? '#11111b' : '#eff1f5';
    palette.colors.toolSuccessBg = palette.colors.toolPendingBg;
    palette.colors.toolErrorBg = palette.colors.toolPendingBg;
    palette.colors.border = appearance === 'dark' ? '#89dceb' : '#179299';
    palette.colors.accent = appearance === 'dark' ? '#89dceb' : '#179299';
    palette.colors.mdCode = appearance === 'dark' ? '#a6e3a1' : '#40a02b';
    await privateJson(path.join(themesDir, `omp-${appearance}.json`), palette);
  }
  const packageNames = ['pi-subagents', 'pi-intercom', 'pi-interactive-shell', 'pi-lsp-adapter', 'pi-web-access', 'pi-hashline-edit', 'pi-btw', 'pi-condense'];
  const packages = packageNames.map(name => ({ source: path.join(moduleDir, name), extensions: [], skills: name === 'pi-subagents' || name === 'pi-interactive-shell' ? undefined : [], prompts: [] }));
  const personalExtensions = ['context-policy.ts', 'compaction-policy.ts', 'hashline-host.ts', 'managed-tools.ts', 'user-shell.ts', 'eval.ts', 'code-intelligence.ts', 'code-search.ts', 'models.ts', 'muninn.ts', 'workflow.ts', 'visuals.ts', 'freyr.ts', 'history.ts', 'advisor.ts', 'image-attachments.ts', 'presentation.ts'];
  const settings = {
    ...sourceSettings, ...previous,
    defaultProvider: roles.default.provider, defaultModel: roles.default.modelId, defaultThinkingLevel: roles.default.thinkingLevel,
    quietStartup: sourceSettings.quietStartup,
    theme: 'omp-light/omp-dark',
    tuiMode: sourceSettings.tuiMode,
    enabledModels: sourceSettings.enabledModels,
    defaultTools: sourceSettings.defaultTools,
    codemode: sourceSettings.codemode,
    compaction: { ...previous.compaction, ...sourceSettings.compaction, modelOverrides: { ...previous.compaction?.modelOverrides, ...sourceSettings.compaction.modelOverrides } },
    contextPrune: { ...previous.contextPrune, ...sourceSettings.contextPrune, summarizerModel: `${roles.summary.provider}/${roles.summary.modelId}`, summarizerThinking: roles.summary.thinkingLevel },
    packages,
    extensions: personalExtensions.map(name => path.join(sourceDir, 'extensions', name)),
    skills: [
      ...canonicalSkillPaths(),
      path.join(sourceDir, 'skills', 'using-freyr-browser', 'SKILL.md'),
    ],
    subagents: {
      ...sourceSettings.subagents, ...previous.subagents,
      agentScanDirs: [path.join(sourceDir, 'agents')],
      defaultExtensions: [path.join(sourceDir, 'extensions/hashline-host.ts'), path.join(sourceDir, 'extensions/code-intelligence.ts')],
      agentOverrides: {
        ...previous.subagents?.agentOverrides,
        ...Object.fromEntries(['task', 'scout', 'reviewer', 'security-reviewer', 'sonic'].map(name => [name, {
          ...previous.subagents?.agentOverrides?.[name],
          model: `${roles.task.provider}/${roles.task.modelId}`, thinking: roles.task.thinkingLevel,
        }])),
      },
    },
  };
  await privateJson(path.join(agentDir, 'settings.json'), settings);
  await privateJson(path.join(agentDir, 'roles.json'), roles);
  await privateJson(path.join(agentDir, 'modes.json'), { modes: roles });
  const keybindings = await jsonFile(path.join(agentDir, 'keybindings.json'));
  const clipboardKeys = keybindings['app.clipboard.pasteImage'];
  await privateJson(path.join(agentDir, 'keybindings.json'), {
    ...keybindings,
    'app.clipboard.pasteImage': [...new Set(['ctrl+v', 'super+v', ...(Array.isArray(clipboardKeys) ? clipboardKeys : typeof clipboardKeys === 'string' ? [clipboardKeys] : [])])],
  });
  const cached = cachedProxyModels(ompDir);
  const models = cached.length ? cached : requiredProxyModels();
  const configuredModels = await jsonFile(path.join(agentDir, 'models.json'));
  const providers = { ...configuredModels.providers, 'neo-proxy': {
    baseUrl: normalizedEndpoint.href.replace(/\/$/, ''), api: 'openai-completions', apiKey: '$NEO_PROXY_API_KEY', models,
  } };
  const local = ompModels.providers?.mimer;
  if (local?.baseUrl || env.ECORAY_MIMER_IP) {
    providers.mimer = {
      baseUrl: env.ECORAY_MIMER_IP ? `http://${env.ECORAY_MIMER_IP}:8080` : local.baseUrl,
      api: 'openai-completions', apiKey: 'local',
      models: local?.models?.length ? local.models : [{ id: sourceRoles.slow.modelId, name: 'Mimer local', reasoning: true, input: ['text'], contextWindow: 262144, maxTokens: 16384 }],
    };
  }
  await privateJson(path.join(agentDir, 'models.json'), { ...configuredModels, providers });
  const sourceMcp = await jsonFile(path.join(repoDir, '.omp/agent/mcp.json'));
  const generatedMcp = await jsonFile(path.join(ompDir, 'mcp.json'));
  const existingMcp = await jsonFile(path.join(agentDir, 'mcp.json'));
  await privateJson(path.join(agentDir, 'mcp.json'), { mcpServers: {
    ...sourceMcp.mcpServers, ...generatedMcp.mcpServers, ...existingMcp.mcpServers,
  } });
  const subagentConfig = path.join(agentDir, 'extensions/subagent/config.json');
  await privateJson(subagentConfig, {
    asyncByDefault: true, defaultSubagentContext: 'fresh', maxSubagentDepth: 1,
    toolDescriptionMode: 'compact',
    disabledFeatures: ['watchdog', 'panes', 'missions', 'preflight', 'lane-metadata', 'gates', 'workflow-scripts', 'external-machines', 'lane-management'],
    intercomBridge: { mode: 'always' },
    ...await jsonFile(subagentConfig),
  });
  await privateJson(path.join(agentDir, 'web-search.json'), {
    provider: 'exa', searchRouting: { providers: ['exa'], fallbackOn: ['unsupported', 'transient', 'quota', 'network', 'invalid-response'] },
    ...await jsonFile(path.join(agentDir, 'web-search.json')),
    allowBrowserCookies: false,
    workflow: 'none', autoOpenBrowser: false,
    commands: { curator: { enabled: false }, 'google-account': { enabled: false } },
    webSearch: { enabled: true, allowedProviders: ['exa'] },
    fetchRouting: { providers: ['http'], allowRemoteHostedProviders: false },
  });
  const priorLsp = await jsonFile(path.join(agentDir, 'lsp.json'));
  await privateJson(path.join(agentDir, 'lsp.json'), {
    ...priorLsp, installMode: 'off', warmup: false,
    servers: { vtsls: { command: [process.execPath, path.join(moduleDir, 'typescript-language-server/lib/cli.mjs'), '--stdio'], install: { type: 'system' } }, ...priorLsp.servers },
  });
  // Instructions are profile-specific; OMP tool syntax must not leak into Pi's system prompt.
  await copyFile(path.join(sourceDir, 'instructions.md'), path.join(agentDir, 'AGENTS.md'));
  await chmod(path.join(agentDir, 'AGENTS.md'), 0o600);
  return { agentDir, modelCount: models.length, settings, roles };
}
