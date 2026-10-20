// Fresh native SDK sessions, actual Muninn hook/MCP client, synthetic model only.
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createAgentSession, SessionManager, DefaultResourceLoader, SettingsManager } from '@earendil-works/pi-coding-agent';
import { prepareRuntime, repoDir } from './runtime.mjs';

const dir = await mkdtemp(path.join(os.tmpdir(), 'pi-learning-proof-'));
const requests = [], reads = [];
const approved = 'APPROVED_STARTUP_FIXTURE_LESSON';
const candidate = 'UNAPPROVED_STARTUP_FIXTURE_CANDIDATE';
const payload = entries => '---\ntype: agent-config\n---\n# Fixture\n\n```json\n' + JSON.stringify({ schema: 1, scope: 'general', entries }) + '\n```';
const approvedNote = payload([{
  id: 'fixture', text: approved, approved_by: 'Lucas', approved_at: '2026-10-20',
  approval_reference: 'Synthetic fixture approval, not real guidance',
  source: { path: 'projects/fixture/repo/main/2026-10-01.md', sha256: 'a'.repeat(64) },
}, { id: 'unapproved', text: candidate, status: 'candidate' }]);
let activeNote = approvedNote;
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
          if (args.filename === 'tech/learning/general.md') value = { content: activeNote };
          else if (args.filename.startsWith('tech/learning/')) value = { content: '' };
          else value = { content: 'Required fixture guidance' };
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
    for (const [delta, finish] of [[{ role: 'assistant', content: 'LEARNING_INSPECTED' }, null], [{}, 'stop']]) {
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
  const endpoint = `http://127.0.0.1:${server.address().port}`;
  await prepareRuntime({ agentDir: dir, env: { ...process.env, NEO_PROXY_URL: endpoint + '/v1' }, ompDir: path.join(dir, 'absent') });
  const settings = JSON.parse(await readFile(path.join(dir, 'settings.json'), 'utf8'));
  settings.extensions = settings.extensions.filter(filename => filename.endsWith('/muninn.ts'));
  assert.equal(settings.extensions.length, 1);
  settings.packages = [];
  await writeFile(path.join(dir, 'settings.json'), JSON.stringify(settings));
  await writeFile(path.join(dir, 'mcp.json'), JSON.stringify({ mcpServers: { muninn: { url: endpoint + '/mcp' } } }));
  for (const note of [approvedNote, payload([{ status: 'candidate', text: candidate }])]) {
    activeNote = note;
    const settingsManager = SettingsManager.create(repoDir, dir, { projectTrusted: true });
    const resourceLoader = new DefaultResourceLoader({ cwd: repoDir, agentDir: dir, settingsManager, noSkills: true, noPromptTemplates: true });
    await resourceLoader.reload();
    const made = await createAgentSession({ cwd: repoDir, agentDir: dir, sessionManager: SessionManager.inMemory(), settingsManager, resourceLoader });
    session = made.session;
    assert.deepEqual(made.extensionsResult.errors, []);
    await session.bindExtensions({ mode: 'print' });
    await session.prompt('Respond briefly without tools.');
    const captured = JSON.stringify(requests.at(-1).messages);
    assert.equal(captured.includes(approved), note === approvedNote);
    assert.ok(!captured.includes(candidate));
    assert.ok(captured.includes('Required fixture guidance'));
    // A second prompt in the same session must not repeat vault reads/injection.
    const count = reads.length;
    await session.prompt('Again, briefly.');
    assert.equal(reads.length, count);
    session.dispose(); session = undefined;
  }
  assert.ok(!reads.some(filename => filename.startsWith('dreams/')));
  console.log(JSON.stringify({ freshSessions: 2, providerRequests: requests.length, approvedLessonInFirstSession: true, candidateAbsentBothSessions: true, oncePerSession: true, scope: 'Actual before_agent_start hook and MCP transport; fixture model/vault only. No live guidance or cron.' }, null, 2));
} finally {
  session?.dispose();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  await rm(dir, { recursive: true, force: true, maxRetries: 3 });
}
