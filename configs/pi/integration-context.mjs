import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createAgentSession, SessionManager, createCodemodeExtension, createToolSearchExtension, DefaultResourceLoader, SettingsManager } from '@earendil-works/pi-coding-agent';
import { prepareRuntime, repoDir } from './runtime.mjs';

const dir = await mkdtemp(path.join(os.tmpdir(), 'pi-context-proof-'));
let request, session;
const server = http.createServer(async (req, res) => {
  let body = '';
  for await (const part of req) body += part;
  request = JSON.parse(body);
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  for (const [delta, finish] of [[{ role: 'assistant', content: 'CONTEXT_INSPECTED' }, null], [{}, 'stop']]) {
    res.write(`data: ${JSON.stringify({ id: 'context-proof', object: 'chat.completion.chunk', created: 1, model: request.model, choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`);
  }
  res.end('data: [DONE]\n\n');
});
const listening = Promise.withResolvers();
server.listen(0, '127.0.0.1', listening.resolve);
await listening.promise;
try {
  process.env.PI_CODING_AGENT_DIR = dir;
  process.env.NEO_PROXY_API_KEY = 'synthetic';
  await prepareRuntime({ agentDir: dir, env: { ...process.env, NEO_PROXY_URL: `http://127.0.0.1:${server.address().port}/v1` }, ompDir: path.join(dir, 'absent') });
  const settings = JSON.parse(await readFile(path.join(dir, 'settings.json'), 'utf8'));
  settings.extensions = settings.extensions.filter(filename => !filename.endsWith('muninn.ts') && !filename.endsWith('advisor.ts'));
  await writeFile(path.join(dir, 'settings.json'), JSON.stringify(settings));
  await writeFile(path.join(dir, 'mcp.json'), '{"mcpServers":{}}');
  const settingsManager = SettingsManager.create(repoDir, dir, { projectTrusted: true });
  const resourceLoader = new DefaultResourceLoader({ cwd: repoDir, agentDir: dir, settingsManager, extensionFactories: [{ name: 'codemode', factory: createCodemodeExtension() }, { name: 'tool-search', factory: createToolSearchExtension() }] });
  await resourceLoader.reload();
  const made = await createAgentSession({ cwd: repoDir, agentDir: dir, sessionManager: SessionManager.inMemory(), settingsManager, resourceLoader });
  session = made.session;
  assert.deepEqual(made.extensionsResult.errors, []);
  await session.bindExtensions({ mode: 'print' });
  const active = session.getActiveToolNames();
  const tools = session.getAllTools();
  assert.ok(!tools.some(tool => ['gimle_browser', 'freyr_browser'].includes(tool.name)), 'Old browser tool names are not registered');
  for (const name of ['interactive_shell', 'intercom', 'eval', 'semantic_code_search', 'summarize_read', 'loki_browser']) {
    assert.ok(tools.some(tool => tool.name === name), `Capability registered: ${name}`);
    assert.ok(!active.includes(name), `Capability deferred: ${name}`);
  }
  for (const name of ['codemode', 'tool_search']) assert.ok(active.includes(name), `Discovery tool active: ${name}`);
  await session.prompt('Respond briefly without tools.');
  const advertised = request.tools?.map(tool => tool.function?.name ?? tool.name) ?? [];
  assert.ok(!advertised.includes('interactive_shell'));
  assert.ok(!advertised.includes('eval'));
  assert.ok(advertised.includes('skill_lookup'), 'Provider receives the skill lookup schema');
  const prompt = request.messages.filter(message=>message.role==='system'||message.role==='developer').map(message=>typeof message.content==='string'?message.content:JSON.stringify(message.content)).join('\n');
  const metadata = prompt.match(/<skills>[\s\S]*?<\/skills>/)?.[0] ?? '';
  const skills = resourceLoader.getSkills().skills.filter(skill => !skill.disableModelInvocation);
  for (const { name, description, filePath } of skills) {
    const cue = description.replace(/\s+/g, ' ').trim();
    assert.ok(metadata.split('\n').includes(`${name}: ${cue.length > 180 ? cue.slice(0, 179) + '…' : cue}`), `Missing routing cue: ${name}`);
    assert.ok(!metadata.includes(filePath), `Full skill path leaked into startup: ${name}`);
  }
  assert.ok(metadata.length > 0 && metadata.length < 35000);
  const schemaChars = JSON.stringify(request.tools ?? []).length;
  assert.ok(schemaChars < 50659, 'Direct schemas smaller than baseline');
  console.log(JSON.stringify({ systemPromptCharacters: prompt.length, skillMetadataCharacters: metadata.length, requestToolSchemaCharacters: schemaChars, skillCount: skills.length, scope: 'Provider request capture; characters, not tokenizer counts' }, null, 2));
  const searchTool=session.extensionRunner.getToolDefinition('tool_search');
  assert.ok(searchTool);
  const found=await searchTool.execute('discover-eval',{query:'persistent Python JavaScript eval interpreter',limit:1},undefined,undefined,session.extensionRunner.createToolContext('discover-eval',undefined));
  assert.ok(found.details.loaded.includes('eval'),'Deferred eval discovered through native tool_search');
  assert.ok(session.getActiveToolNames().includes('eval'),'Discovery activates deferred eval for next request');
  assert.ok(active.includes('skill_lookup'), 'Skill lookup is directly available');
  const skillTool = session.extensionRunner.getToolDefinition('skill_lookup');
  assert.ok(skillTool);
  for (const name of ['systematic-debugging', 'social-venue-list', 'verification-before-completion']) {
    const expected = skills.find(skill => skill.name === name);
    assert.ok(expected);
    const result = await skillTool.execute('lookup-skill', { name }, undefined, undefined, session.extensionRunner.createToolContext('lookup-skill', undefined));
    assert.ok(result.content[0].text.includes(expected.filePath));
    assert.ok(result.content[0].text.includes(expected.description));
  }
} finally {
  if (session) await session.extensionRunner.emit({ type: 'session_shutdown', reason: 'quit' });
  session?.dispose();
  server.closeAllConnections();
  const closed = Promise.withResolvers();
  server.close(closed.resolve);
  await closed.promise;
  await rm(dir, { recursive: true, force: true, maxRetries: 3 });
}
