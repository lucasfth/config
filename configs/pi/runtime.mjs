import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { chmod, copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { applySubagentRoles } from './subagent-roles.mjs';

export const sourceDir = path.dirname(fileURLToPath(import.meta.url));
export const repoDir = path.resolve(sourceDir, '../..');


// Pi-only workflows/browser boundaries; shared operational guides live in Volundr.
const localSkillOverrides = new Map([
  ['using-gimle-browser', 'configs/pi/skills/using-gimle-browser/SKILL.md'],
  ['huginn-retro', 'configs/pi/skills/huginn-retro/SKILL.md'],
]);

export function canonicalSkillPaths({ rootDir = repoDir, cwd = process.cwd() } = {}) {
  const sharedDir = path.join(rootDir, 'volundr/skills');
  if (!existsSync(sharedDir)) {
    throw new Error('Volundr skills are missing. Run git submodule update --init -- volundr in the config checkout.');
  }
  const projectSkills = new Set();
  let directory = cwd;
  for (;;) {
    const root = path.join(directory, '.pi/skills');
    if (existsSync(root)) for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (existsSync(path.join(root, entry.name, 'SKILL.md'))) projectSkills.add(entry.name);
    }
    const parent = path.dirname(directory);
    if (parent === directory || directory === rootDir || directory === os.homedir()) break;
    directory = parent;
  }
  const selected = new Map();
  for (const entry of readdirSync(sharedDir).sort()) {
    const file = path.join(sharedDir, entry, 'SKILL.md');
    if (!existsSync(file)) continue;
    const text = readFileSync(file, 'utf8');
    const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    const metadata = frontmatter && YAML.parse(frontmatter[1]);
    if (metadata?.name !== entry || !['active', 'archived'].includes(metadata?.metadata?.status)) {
      throw new Error(`Invalid Volundr skill metadata: ${file}`);
    }
    if (metadata.metadata.status === 'active') selected.set(entry, file);
  }
  for (const [name, relative] of localSkillOverrides) {
    const file = path.join(rootDir, relative);
    if (existsSync(file)) selected.set(name, file);
  }
  // Retire the shared/local Freyr browser guide only for Pi; OMP keeps its source.
  return [...selected].filter(([name]) => name !== 'using-freyr-browser' && !projectSkills.has(name)).map(([, file]) => file);
}
async function jsonFile(filename, fallback = {}) {
  try { return JSON.parse(await readFile(filename, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}


async function privateJson(filename, value) {
  await mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
  const temporary = `${filename}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  await rename(temporary, filename);
  await chmod(filename, 0o600);
}


function requiredProxyModels() {
  const existing = ['gpt-6.2-sol', 'gpt-6.2-astra', 'gpt-6.1-sol', 'gpt-6-luna', 'claude-opus-5-5', 'claude-haiku-5-5'];
  const additional = [
    'claude-sonnet-5-5', 'claude-fable-5-1', 'claude-fable-5-2',
    'gpt-6-chat-thinking',
    'grok-4.7', 'grok-4.7-build-fast', 'grok-4.6', 'grok-4.5', 'grok-3-mini', 'grok-3-mini-fast',
    'grok-composer-2.5-fast', 'grok-build-0.1', 'deepseek-flash', 'meta/muse-glimmer-30b',
    'nvidia/nemotron-3-super-120b-a12b', 'nvidia/nemotron-3-ultra-550b-a55b', 'mistralai/mistral-large',
  ];
  // Metadata follows Pi's bundled model catalogue; Neo does not provide limits.
  const groups = [
    [1000000, 128000, ['claude-sonnet-5-5', 'claude-fable-5-1', 'claude-fable-5-2']],
    [500000, 128000, ['grok-4.7', 'grok-4.6', 'grok-4.5']],
    [256000, 256000, ['grok-build-0.1']],
    [1000000, 384000, ['deepseek-flash']],
    [131072, 16384, ['meta/muse-glimmer-30b']],
  ];
  const metadata = new Map(groups.flatMap(([contextWindow, maxTokens, ids]) => ids.map(id =>
    [id, { reasoning: true, input: ['text', 'image'], contextWindow, maxTokens }])));
  metadata.set('nvidia/nemotron-3-super-120b-a12b', { reasoning: true, input: ['text'], contextWindow: 256000, maxTokens: 32000 });
  metadata.set('nvidia/nemotron-3-ultra-550b-a55b', { reasoning: true, input: ['text'], contextWindow: 202800, maxTokens: 182520 });
  metadata.set('mistralai/mistral-large', { reasoning: false, input: ['text'], contextWindow: 128000, maxTokens: 102400 });
  return [
    ...existing.map(id => ({ id, name: id, reasoning: true, input: ['text', 'image'],
      contextWindow: id.startsWith('claude-') ? 1000000 : 1050000, maxTokens: 128000 })),
    // Unknown IDs retain conservative defaults until their capabilities are established.
    ...additional.map(id => ({ id, name: id, ...(metadata.get(id) ?? { reasoning: false, input: ['text'], contextWindow: 32768, maxTokens: 4096 }) })),
  ];
}

async function discoverProxyModels(endpoint, env, fetchModels) {
  if (!fetchModels) return [];
  try {
    const url = new URL(endpoint.href);
    url.pathname = `${url.pathname.replace(/\/$/, '')}/models`;
    url.search = ''; url.hash = '';
    const response = await fetchModels(url.href, {
      headers: env.NEO_PROXY_API_KEY ? { Authorization: `Bearer ${env.NEO_PROXY_API_KEY}` } : {},
      signal: AbortSignal.timeout(3000), redirect: 'error',
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data.data)) throw new Error('invalid response');
    const ids = [...new Set(data.data.map(model => model?.id).filter(id => typeof id === 'string' && id.length > 0 && id.length <= 256))];
    const known = new Map(requiredProxyModels().map(model => [model.id, model]));
    const dataDir = path.join(sourceDir, 'node_modules/@earendil-works/pi-ai/dist/providers/data');
    for (const file of readdirSync(dataDir).filter(file => file.endsWith('.json')).sort()) {
      const providers = await jsonFile(path.join(dataDir, file));
      for (const group of Object.values(providers)) for (const model of Object.values(group)) {
        if (model?.type === 'chat' && !known.has(model.id)) {
          const { id, reasoning, input, contextWindow, maxTokens } = model;
          known.set(id, { id, name: id, reasoning, input, contextWindow, maxTokens });
        }
      }
    }
    return ids.filter(id => !/(?:image|imagine|video|audio|voice|tts|speech|transcri)/i.test(id))
      .map(id => known.get(id) ?? { id, name: id, reasoning: false, input: ['text'], contextWindow: 32768, maxTokens: 4096 });
  } catch (error) {
    console.warn(`pi-native: Neo model discovery unavailable; using cached catalogue (${error.name === 'TimeoutError' ? 'timeout' : 'request failed'}).`);
    return [];
  }
}

export async function prepareRuntime({ agentDir, env = process.env, fetchModels }) {
  agentDir = path.resolve(agentDir);
  const sourceRoles = await jsonFile(path.join(sourceDir, 'roles.json'));
  const roles = { ...sourceRoles, ...await jsonFile(path.join(agentDir, 'roles.json')) };
  const sourceSettings = await jsonFile(path.join(sourceDir, 'settings.json'));
  const previous = await jsonFile(path.join(agentDir, 'settings.json'));
  const endpoint = env.NEO_PROXY_URL;
  if (!endpoint) throw new Error('NEO_PROXY_URL is missing; configure the Neo endpoint before launching this Pi profile.');
  const normalizedEndpoint = new URL(endpoint);
  if (!['http:', 'https:'].includes(normalizedEndpoint.protocol)) throw new Error('NEO_PROXY_URL must be an HTTP(S) endpoint.');
  // nix_secrets stores the proxy origin; compatible clients need the API base.
  // Preserve explicit non-root paths instead of guessing alternate prefixes.
  if (normalizedEndpoint.pathname === '/') normalizedEndpoint.pathname = '/v1';
  await mkdir(agentDir, { recursive: true, mode: 0o700 });
  await chmod(agentDir, 0o700);
  // Let Herdr own its version-matched hook; Pi discovers agentDir/extensions on reload.
  if (env.HERDR_ENV === '1' && env.HERDR_SOCKET_PATH && env.HERDR_PANE_ID) {
    await mkdir(path.join(agentDir, 'extensions'), { recursive: true, mode: 0o700 });
    try {
      await promisify(execFile)(env.HERDR_BIN_PATH || 'herdr', ['integration', 'install', 'pi'], {
        env: { ...env, PI_CODING_AGENT_DIR: agentDir }, timeout: 5000,
      });
    } catch (error) {
      console.warn(`pi-native: Herdr state hook installation failed: ${error.message}`);
    }
  }

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
  const personalExtensions = ['context-policy.ts', 'compaction-policy.ts', 'hashline-host.ts', 'managed-tools.ts', 'user-shell.ts', 'eval.ts', 'code-intelligence.ts', 'code-search.ts', 'source-outline.ts', 'cache-report.ts', 'models.ts', 'muninn.ts', 'workflow.ts', 'visuals.ts', 'gimle.ts', 'history.ts', 'advisor.ts', 'image-attachments.ts', 'presentation.ts', 'herdr-presentation.ts', 'workers.ts', 'fleet.ts', 'auto-review.ts'];
  const promptNames = ['aar', 'retro', 'done', 'review', 'full-send', 'full-stop'];
  // Managed prompt paths follow this checkout; retain unrelated user templates.
  const customPrompts = (previous.prompts ?? []).filter(file => !promptNames.some(name => file.endsWith(`${path.sep}configs${path.sep}pi${path.sep}prompts${path.sep}${name}.md`)));
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
    skills: canonicalSkillPaths(),
    prompts: [...new Set([...(sourceSettings.prompts ?? []), ...customPrompts, ...promptNames.map(name => path.join(sourceDir, `prompts/${name}.md`))])],
    subagents: applySubagentRoles({
      ...sourceSettings.subagents, ...previous.subagents,
      agentScanDirs: [path.join(sourceDir, 'agents')],
      defaultExtensions: [path.join(sourceDir, 'extensions/hashline-host.ts'), path.join(sourceDir, 'extensions/code-intelligence.ts'), path.join(sourceDir, 'extensions/fleet.ts')],
    }, roles),
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
  const configuredModels = await jsonFile(path.join(agentDir, 'models.json'));
  const qwen = await jsonFile(path.join(sourceDir, 'qwen-model.json'));
  const requiredModels = requiredProxyModels();
  const requiredIds = new Set(requiredModels.map(model => model.id));
  const discovered = await discoverProxyModels(normalizedEndpoint, env, fetchModels);
  const models = [...new Map([
    ...requiredModels,
    ...discovered,
    // Required metadata is authoritative for known ids; a stale persisted duplicate must not win.
    // With a live catalogue, persisted entries for ids no longer served are stale relics and are
    // dropped; the persisted list is retained as the offline fallback when discovery is unavailable.
    ...(configuredModels.providers?.['neo-proxy']?.models ?? []).filter(model => !requiredIds.has(model.id) && (discovered.length === 0 || discovered.some(d => d.id === model.id))), qwen,
  ].map(model => [model.id, model])).values()];
  const providers = { ...configuredModels.providers, 'neo-proxy': {
    ...configuredModels.providers?.['neo-proxy'],
    baseUrl: normalizedEndpoint.href.replace(/\/$/, ''), api: 'openai-completions', apiKey: '$NEO_PROXY_API_KEY', models,
  } };
  const mimerEndpoint = env.MIMER_BASE_URL || (env.ECORAY_MIMER_IP ? `http://${env.ECORAY_MIMER_IP}:8080/v1` : providers.mimer?.baseUrl);
  if (mimerEndpoint) {
    const url = new URL(mimerEndpoint);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('MIMER_BASE_URL must be an HTTP(S) endpoint.');
    if (url.pathname === '/') url.pathname = '/v1';
    const keyFile = env.MIMER_QWEN_KEY_FILE || path.join(os.homedir(), '.local/share/huginn-pi/mimer-qwen.key');
    if (!/^\/[A-Za-z0-9_./-]+$/.test(keyFile)) throw new Error('MIMER_QWEN_KEY_FILE must be an absolute shell-safe path.');
    providers.mimer = { ...providers.mimer, baseUrl: url.href.replace(/\/$/, ''),
      api: 'openai-completions', apiKey: `!cat ${keyFile}`,
      models: [...(providers.mimer?.models ?? []).filter(model => model.id !== qwen.id), qwen] };
  }
  const gimlePrivate = await jsonFile(path.join(os.homedir(), '.local/share/gimle-qwen/client.json'));
  const gimleEndpoint = env.GIMLE_QWEN_BASE_URL || gimlePrivate.baseUrl;
  if (gimleEndpoint) {
    const url = new URL(gimleEndpoint);
    if (url.protocol !== 'http:' || !['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname) || url.username || url.password) {
      throw new Error('Gimle requires an authenticated loopback SSH endpoint.');
    }
    const keyFile = env.GIMLE_QWEN_KEY_FILE || gimlePrivate.keyFile;
    if (!keyFile || !/^\/[A-Za-z0-9_./-]+$/.test(keyFile)) throw new Error('GIMLE_QWEN_KEY_FILE must be an absolute shell-safe path.');
    providers.gimle = { baseUrl: url.href.replace(/\/$/, ''), api: 'openai-completions', apiKey: `!cat ${keyFile}`,
      models: [{ id: 'qwen3.5-9b-6bit', name: 'Gimle Qwen3.5 9B (6-bit MLX)', reasoning: false, input: ['text'],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 139264, maxTokens: 4096,
        compat: { supportsStore: false, supportsDeveloperRole: false, supportsReasoningEffort: false, maxTokensField: 'max_tokens' } },
        { id: 'qwen3.5-9b-4bit', name: 'Gimle Qwen3.5 9B (4-bit MLX)', reasoning: false, input: ['text'],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 139264, maxTokens: 4096,
        compat: { supportsStore: false, supportsDeveloperRole: false, supportsReasoningEffort: false, maxTokensField: 'max_tokens' } }] };
  }
  await privateJson(path.join(agentDir, 'models.json'), { ...configuredModels, providers });
  const sourceMcp = await jsonFile(path.join(sourceDir, 'mcp.json'));
  const existingMcp = await jsonFile(path.join(agentDir, 'mcp.json'));
  const mcpServers = { ...sourceMcp.mcpServers, ...existingMcp.mcpServers };
  // Fresh hosts need no legacy OMP runtime; endpoints come from private env.
  if (!mcpServers.muninn && env.MUNINN_MCP_URL) {
    mcpServers.muninn = { url: env.MUNINN_MCP_URL };
  }
  if (!mcpServers.company_library && env.COMPANY_LIBRARY_MCP_URL) {
    mcpServers.company_library = { url: env.COMPANY_LIBRARY_MCP_URL,
      headers: { Authorization: 'Bearer ${COMPANY_LIBRARY_MCP_TOKEN}' } };
  }
  const muninn = mcpServers.muninn;
  if (muninn?.url && !Object.keys(muninn.headers ?? {}).some(name => name.toLowerCase() === 'authorization')) {
    mcpServers.muninn = { ...muninn, headers: { ...muninn.headers, Authorization: 'Bearer ${MUNINN_MCP_TOKEN}' } };
  }
  const vercel = mcpServers.vercel;
  // Vercel advertises only openid on the resource; offline_access is needed for refresh tokens.
  if (vercel && /^https:\/\/mcp\.vercel\.com\/?$/.test(vercel.url ?? '') && !vercel.oauth?.scope) {
    mcpServers.vercel = { ...vercel, oauth: { ...vercel.oauth, scope: 'openid offline_access' } };
  }
  await privateJson(path.join(agentDir, 'mcp.json'), { mcpServers });
  const subagentConfig = path.join(agentDir, 'extensions/subagent/config.json');
  await privateJson(subagentConfig, {
    asyncByDefault: true, defaultSubagentContext: 'fresh', maxSubagentDepth: 1,
    toolDescriptionMode: 'compact',
    disabledFeatures: ['watchdog', 'panes', 'missions', 'preflight', 'lane-metadata', 'gates', 'workflow-scripts', 'external-machines', 'lane-management'],
    intercomBridge: { mode: 'always' },
    ...await jsonFile(subagentConfig),
    // Raven rows own the persistent display; retain the full on-demand inspector.
    fleetView: false, asyncWidget: false, inlineToolDisplay: 'summary',
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
