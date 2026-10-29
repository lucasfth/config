// Actual startup hook, installed skill loader and MCP transport; fixture provider.
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createAgentSession, SessionManager, DefaultResourceLoader, SettingsManager } from '@earendil-works/pi-coding-agent';
import { prepareRuntime, repoDir } from './runtime.mjs';

const dir = await mkdtemp(path.join(os.tmpdir(), 'pi-learning-proof-'));
const requests = [], reads = [];
const previous = { ...process.env };
const server = http.createServer(async (req, res) => {
  try {
    let raw = '';
    for await (const part of req) raw += part;
    const body = JSON.parse(raw);
    if (req.url === '/mcp') {
      let result = {};
      if (body.method === 'initialize') result = { protocolVersion: '2024-11-05', capabilities: {}, serverInfo: { name: 'fixture', version: '1' } };
      if (body.method === 'tools/call') {
        const { name, arguments: args } = body.params;
        let value;
        if (name === 'vault_read') {
          reads.push(args.filename);
          value = { content: args.filename.startsWith('tech/learning/') ? 'OBSOLETE_STARTUP_LESSON' : 'Required fixture guidance' };
        } else if (name === 'vault_list') value = { files: [] };
        else throw new Error('Unexpected fixture MCP operation');
        result = { content: [{ type: 'text', text: JSON.stringify(value) }] };
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }));
      return;
    }
    requests.push(body);
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    for (const [delta, finish] of [[{ role: 'assistant', content: 'CONTEXT_CAPTURED' }, null], [{}, 'stop']]) {
      res.write(`data: ${JSON.stringify({ id: 'learning-proof', object: 'chat.completion.chunk', created: 1, model: body.model, choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`);
    }
    res.end('data: [DONE]\n\n');
  } catch (error) { res.writeHead(500); res.end(String(error)); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let session;
try {
  process.env.PI_CODING_AGENT_DIR = dir;
  process.env.NEO_PROXY_API_KEY = 'synthetic';
  process.env.MUNINN_MCP_TOKEN = 'synthetic-muninn';
  const endpoint = `http://127.0.0.1:${server.address().port}`;
  await prepareRuntime({ agentDir: dir, env: { ...process.env, NEO_PROXY_URL: endpoint + '/v1' }, ompDir: path.join(dir, 'absent') });
  const settings = JSON.parse(await readFile(path.join(dir, 'settings.json'), 'utf8'));
  settings.extensions = settings.extensions.filter(filename => filename.endsWith('/muninn.ts'));
  assert.equal(settings.extensions.length, 1);
  settings.packages = [];
  await writeFile(path.join(dir, 'settings.json'), JSON.stringify(settings));
  await writeFile(path.join(dir, 'mcp.json'), JSON.stringify({ mcpServers: { muninn: { url: endpoint + '/mcp' } } }));
  for (let run = 0; run < 2; run++) {
    const settingsManager = SettingsManager.create(repoDir, dir, { projectTrusted: true });
    const resourceLoader = new DefaultResourceLoader({ cwd: repoDir, agentDir: dir, settingsManager, noPromptTemplates: true });
    await resourceLoader.reload();
    const made = await createAgentSession({ cwd: repoDir, agentDir: dir, sessionManager: SessionManager.inMemory(), settingsManager, resourceLoader });
    session = made.session;
    assert.deepEqual(made.extensionsResult.errors, []);
    await session.bindExtensions({ mode: 'print' });
    await session.prompt('Respond briefly without tools.');
    const captured = JSON.stringify(requests.at(-1).messages);
    assert.ok(captured.includes('Volundr procedural learning'));
    assert.ok(captured.includes('verification-before-completion'));
    assert.ok(captured.includes('Required fixture guidance'));
    assert.ok(!captured.includes('OBSOLETE_STARTUP_LESSON'));
    const receipt = session.sessionManager.getEntries().find(entry => entry.type === 'custom' && entry.customType === 'skill-learning-startup');
    assert.ok(receipt, 'durable startup learning receipt missing');
    assert.equal(receipt.data.behaviorProven, false);
    assert.equal(receipt.data.installed.length, 4);
    assert.equal(receipt.data.missing.length, 0);
    const audit = receipt.data.installed.find(item => item.name === 'improvement-loop-audit');
    assert.ok(audit?.sha256?.length === 64);
    const count = reads.length;
    await session.prompt('Again, briefly.');
    assert.equal(reads.length, count);
    session.dispose(); session = undefined;
  }
  assert.ok(!reads.some(filename => filename.startsWith('tech/learning/') || filename.startsWith('dreams/')));
  assert.equal(requests.length, 4);
  console.log(JSON.stringify({ freshSessions: 2, providerRequests: 4, requiredGuidancePreserved: true,
    installedSkillCataloguePresent: true, obsoleteSupplementReads: 0, oncePerSession: true,
    scope: 'Actual startup hook, native resource loader and fixture MCP/provider; proves context delivery, not model compliance or live deployment.' }, null, 2));
} finally {
  session?.dispose();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  await rm(dir, { recursive: true, force: true, maxRetries: 3 });
  for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
  Object.assign(process.env, previous);
}
