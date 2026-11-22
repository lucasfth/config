// Actual startup hook, installed skill loader and MCP transport; fixture provider.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import http from 'node:http';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createAgentSession, SessionManager, DefaultResourceLoader, SettingsManager } from '@earendil-works/pi-coding-agent';
import { prepareRuntime, repoDir } from './runtime.mjs';

const dir = await mkdtemp(path.join(os.tmpdir(), 'pi-learning-proof-'));
const requests = [], reads = [];
const personalNote = 'life/010-Lucas.md';
const profileCanary = 'PERSONAL_FIXTURE_FROM_MCP';
const venueQuery = 'recent places I want to eat';
const venueNote = 'social/venues/fixture-venue.md';
const venueCanary = 'VENUE_FIXTURE_FROM_MCP';
const explicitPrompt = 'which reataturant i recently added that i want to visit';
const searches = [];
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
          value = { content: args.filename === venueNote ? `---\ncreated: 2026-11-19\nstatus: to-visit\n---\n${venueCanary}` : args.filename === personalNote ? profileCanary : args.filename === 'projects/fixture-migration.md' ? 'MIGRATION_FIXTURE_FROM_MCP' : args.filename.startsWith('tech/learning/') ? 'OBSOLETE_STARTUP_LESSON' : 'Required fixture guidance' };
        } else if (name === 'vault_list') value = { files: [] };
        else if (name === 'vault_search') {
          searches.push(args);
          value = { results: args.query.includes('prior migration') ? [{ path: 'personal-notes/private.md' }, { path: 'projects/fixture-migration.md' }] : [{ path: venueNote, title: 'Fixture venues' }] };
        }
        else throw new Error('Unexpected fixture MCP operation');
        result = { content: [{ type: 'text', text: JSON.stringify(value) }] };
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }));
      return;
    }
    requests.push(body);
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const lastMessage = body.messages.at(-1);
    const input = JSON.stringify(lastMessage.content);
    const tool = lastMessage.role === 'user' && body.messages.filter(message => message.role === 'user').slice(-2).some(message => JSON.stringify(message.content).includes(explicitPrompt))
      ? { name: 'read', args: { path: venueNote } }
      : lastMessage.role === 'user' && input.includes('What do you know about me?')
      ? { name: 'memory_recall', args: { paths: [personalNote] } }
      : lastMessage.role === 'user' && input.includes(venueQuery)
        ? { name: 'memory_search', args: { query: venueQuery } }
        : lastMessage.role === 'tool' && input.includes(venueNote) && !input.includes(venueCanary)
          ? { name: 'memory_recall', args: { paths: [venueNote] } } : undefined;
    const delta = tool ? { role: 'assistant', tool_calls: [{ index: 0, id: `learning-${requests.length}`, type: 'function', function: { name: tool.name, arguments: JSON.stringify(tool.args) } }] } : { role: 'assistant', content: lastMessage.content.includes(profileCanary) ? profileCanary : 'CONTEXT_CAPTURED' };
    for (const [chunk, finish] of [[delta, null], [{}, tool ? 'tool_calls' : 'stop']]) {
      res.write(`data: ${JSON.stringify({ id: 'learning-proof', object: 'chat.completion.chunk', created: 1, model: body.model, choices: [{ index: 0, delta: chunk, finish_reason: finish }] })}\n\n`);
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
    assert.ok(requests.at(-1).tools.some(tool => tool.function?.name === 'memory_recall'), 'Provider receives memory_recall directly');
    assert.ok(requests.at(-1).tools.some(tool => tool.function?.name === 'memory_search'), 'Provider receives memory_search directly');
    assert.ok(captured.includes('Volundr procedural learning'));
    assert.ok(captured.includes('verification-before-completion'));
    assert.ok(captured.includes('Required fixture guidance'));
    assert.ok(!captured.includes('OBSOLETE_STARTUP_LESSON'));
    assert.ok(!captured.includes(profileCanary));
    assert.equal(reads.filter(name => name === personalNote).length, run);
    const receipt = session.sessionManager.getEntries().find(entry => entry.type === 'custom' && entry.customType === 'skill-learning-startup');
    assert.ok(receipt, 'durable startup learning receipt missing');
    assert.equal(receipt.data.schema, 2);
    assert.equal(receipt.data.catalogue, 'available');
    assert.equal(receipt.data.behaviorProven, false);
    const owners = ['knowledge-maintenance', 'improvement-loop-audit', 'writing-skills', 'volundr-shared-skills'];
    const catalogue = resourceLoader.getSkills().skills;
    const expected = await Promise.all(owners.map(async name => {
      const skill = catalogue.find(item => item.name === name);
      assert.ok(skill, `native loader catalogue is missing ${name}`);
      return { name, sha256: createHash('sha256').update(await readFile(skill.filePath)).digest('hex') };
    }));
    assert.deepEqual(receipt.data.installed, expected);
    assert.deepEqual(receipt.data.notListed, []);
    assert.deepEqual(receipt.data.unreadable, []);
    const count = reads.length;
    await session.prompt('Again, briefly.');
    assert.equal(reads.length, count);
    await session.prompt('What do you know about me?');
    assert.deepEqual(reads.slice(count), [personalNote], JSON.stringify(requests.slice(-3).map(request => ({ lastRole: request.messages.at(-1).role, toolResult: request.messages.at(-1).role === 'tool' ? request.messages.at(-1).content : undefined, recallAdvertised: request.tools?.some(tool => tool.function?.name === 'memory_recall') }))));
    assert.ok(requests.at(-1).messages.some(message => message.role === 'tool' && message.content.includes(profileCanary)));
    const beforeTopicSearch = searches.length;
    await session.prompt(`Tell me about ${venueQuery}.`);
    assert.deepEqual(searches.slice(beforeTopicSearch), [{ query: venueQuery, limit: 5, rerank: false }]);
    assert.deepEqual(reads.slice(count), [personalNote, venueNote]);
    assert.ok(requests.at(-1).messages.some(message => message.role === 'tool' && message.content.includes(venueCanary)));
    const workPrompt = 'What did we decide about the prior migration of Loki to Gimle?';
    const searchCount = searches.length;
    const readCount = reads.length;
    await session.prompt(workPrompt);
    assert.deepEqual(searches.slice(searchCount).map(args => args.query), [workPrompt]);
    assert.deepEqual(reads.slice(readCount), ['projects/fixture-migration.md']);
    assert.ok(JSON.stringify(requests.at(-1).messages).includes('MIGRATION_FIXTURE_FROM_MCP'));
    const beforeVenue = requests.length;
    const beforeSearch = searches.length;
    const beforeRead = reads.length;
    await session.prompt(explicitPrompt);
    assert.deepEqual(searches.slice(beforeSearch), [{ query: explicitPrompt, limit: 5, rerank: false, include_private: false }]);
    assert.deepEqual(reads.slice(beforeRead), [venueNote]);
    assert.equal(requests.length, beforeVenue + 2, JSON.stringify(requests.slice(beforeVenue).map(r => r.messages.slice(-4).map(m => ({role: m.role, tail: String(m.content).slice(0, 140)})))));
    assert.ok(JSON.stringify(requests[beforeVenue].messages).includes(venueCanary));
    const evidence = JSON.stringify(requests[beforeVenue].messages.findLast(message => JSON.stringify(message.content).includes('## Muninn memory evidence')));
    assert.match(evidence, /fixture-venue\.md.*2026-11-19/);
    assert.deepEqual(requests[beforeVenue].tools.map(tool => tool.function.name).sort(), ['memory_recall', 'memory_search']);
    const refusedRead = requests[beforeVenue + 1].messages.at(-1);
    assert.equal(refusedRead.role, 'tool');
    // Pi refuses a tool omitted from the active set before dispatching the hook.
    assert.equal(refusedRead.content, 'Tool read not found');
    assert.doesNotMatch(refusedRead.content, /File not found|ENOENT|VENUE_FIXTURE_FROM_MCP/);
    const beforeCoding = searches.length;
    await session.prompt('What does src/parser.ts do?');
    assert.equal(searches.length, beforeCoding, 'Repository question does not prefetch memory');
    for (const name of ['bash', 'read']) assert.ok(requests.at(-1).tools.some(tool => tool.function?.name === name), `${name} restored after memory turn`);
    session.dispose(); session = undefined;
  }
  assert.ok(!reads.some(filename => filename.startsWith('tech/learning/') || filename.startsWith('dreams/')));
  assert.equal(requests.length, 22);
  console.log(JSON.stringify({ freshSessions: 2, providerRequests: 22, memoryEvidenceBeforeInference: true, localVaultReadRefused: true, requiredGuidancePreserved: true,
    installedSkillCataloguePresent: true, receiptMatchesNativeCatalogue: true, obsoleteSupplementReads: 0, oncePerSession: true, personalRecallThroughMcp: true, topicSearchAndReadThroughMcp: true, workEvidenceBeforeInference: true,
    scope: 'Actual Pi tool loop and fixture MCP/provider; proves routing is reachable, not independent live-model selection.' }, null, 2));
} finally {
  session?.dispose();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  await rm(dir, { recursive: true, force: true, maxRetries: 3 });
  for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
  Object.assign(process.env, previous);
}
