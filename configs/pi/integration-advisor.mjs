import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createAgentSession, SessionManager, initTheme } from '@earendil-works/pi-coding-agent';
import { prepareRuntime } from './runtime.mjs';

// Exercise the actual file extension + pinned advisor + Pi 1.3.0 against a
// deterministic local provider. No real credentials, services or model calls.
const root = await mkdtemp(path.join(os.tmpdir(), 'huginn-advisor-'));
const calls = [];
let releaseReview;
const firstReviewGate = new Promise(resolve => { releaseReview = resolve; });
let reviews = 0;
let activeReviews = 0;
let pendingAdvice = false;
let session;
const previousDir = process.env.PI_CODING_AGENT_DIR;
const previousKey = process.env.NEO_PROXY_API_KEY;
const errors = [];
const server = http.createServer(async (request, response) => {
  try {
    let body = '';
    for await (const chunk of request) body += chunk;
    const payload = JSON.parse(body);
    calls.push(payload);
    const advisor = payload.model === 'claude-haiku-5-5';
    const toolReply = payload.messages.at(-1)?.role === 'tool';
    let delta = { role: 'assistant', content: 'PRIMARY_FINISHED' };
    let finish = 'stop';
    if (advisor) {
      activeReviews++;
      if (!toolReply) {
        reviews++;
        if (reviews === 1) await firstReviewGate;
        const args = reviews === 1
          ? { issueId: 'routine-risk', evidence: 'fixture concern', severity: 'concern', note: 'ROUTINE_FINDING_FOR_NEXT_PROMPT' }
          : { issueId: 'serious-risk', evidence: `fixture evidence ${reviews}`, severity: 'blocker', note: `SERIOUS_UNRESOLVED_FINDING_${reviews}` };
        pendingAdvice = true;
        delta = { role: 'assistant', tool_calls: [{ index: 0, id: `advise-${reviews}`, type: 'function', function: { name: 'advise', arguments: JSON.stringify(args) } }] };
        finish = 'tool_calls';
      } else {
        pendingAdvice = false;
        delta = { role: 'assistant', content: 'Review complete.' };
      }
    }
    const chunk = { id: 'advisor-proof', object: 'chat.completion.chunk', created: 1, model: payload.model, choices: [{ index: 0, delta, finish_reason: null }] };
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    response.write(`data: ${JSON.stringify(chunk)}\n\n`);
    response.write(`data: ${JSON.stringify({ ...chunk, choices: [{ index: 0, delta: {}, finish_reason: finish }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } })}\n\n`);
    response.end('data: [DONE]\n\n');
    if (advisor) activeReviews--;
  } catch (error) {
    errors.push(error);
    response.destroy(error);
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
async function until(check, description) {
  const deadline = Date.now() + 5000;
  while (!check()) {
    assert.ok(Date.now() < deadline, `Timed out: ${description}`);
    await delay(10);
  }
}
const primaryCalls = () => calls.filter(call => call.model !== 'claude-haiku-5-5');
try {
  initTheme('dark', false);
  process.env.PI_CODING_AGENT_DIR = root;
  process.env.NEO_PROXY_API_KEY = 'synthetic-local-only';
  await prepareRuntime({ agentDir: root, env: { ...process.env, NEO_PROXY_URL: `http://127.0.0.1:${server.address().port}/v1`, ECORAY_MIMER_IP: '' }, ompDir: path.join(root, 'absent') });
  const settings = JSON.parse(await readFile(path.join(root, 'settings.json'), 'utf8'));
  settings.skills = [];
  settings.extensions = settings.extensions.filter(filename => filename.endsWith('/advisor.ts'));
  assert.equal(settings.extensions.length, 1);
  await writeFile(path.join(root, 'settings.json'), JSON.stringify(settings));
  await writeFile(path.join(root, 'mcp.json'), JSON.stringify({ mcpServers: {} }));
  const result = await createAgentSession({ cwd: root, agentDir: root, tools: [], sessionManager: SessionManager.inMemory(root) });
  session = result.session;
  assert.deepEqual(result.extensionsResult.errors, []);
  await session.bindExtensions({ mode: 'print', onError: error => errors.push(error) });

  // The primary must return even though the advisor response is still blocked.
  let finished = false;
  const initial = session.prompt('Finish the first task.').then(() => { finished = true; });
  await until(() => finished, 'primary finishes without waiting for advisor');
  await initial;
  await until(() => reviews === 1, 'background review starts');
  assert.equal(activeReviews, 1);
  assert.equal(primaryCalls().length, 1);
  releaseReview();
  await until(() => session.messages.some(message => message.role === 'custom' && message.customType === 'advisory'), 'routine finding appended while idle');
  await until(() => !activeReviews && !pendingAdvice, 'routine review completes');
  assert.equal(primaryCalls().length, 1, 'Routine advice must not restart the primary');
  assert.ok(session.sessionManager.buildSessionContext().messages.some(message => message.role === 'custom' && String(message.content).includes('ROUTINE_FINDING_FOR_NEXT_PROMPT')), 'Idle advice must be persisted, not lost');

  await session.prompt('Continue with the second task.');
  const secondPrompt = primaryCalls()[1];
  assert.ok(JSON.stringify(secondPrompt.messages).includes('ROUTINE_FINDING_FOR_NEXT_PROMPT'), 'The actual next provider request must contain deferred advice');
  await until(() => primaryCalls().length >= 3 && reviews >= 3 && !activeReviews && !pendingAdvice && !session.isStreaming, 'blocker correction and follow-up review finish');
  assert.equal(primaryCalls().length, 3, 'A blocker may request ONE correction, not an advisory-only feedback loop');
  assert.ok(JSON.stringify(primaryCalls()[2].messages).includes('SERIOUS_UNRESOLVED_FINDING_2'));
  // A quiet window detects deferred custom-run restarts, not performance.
  await delay(150);
  assert.equal(primaryCalls().length, 3);

  await session.prompt('Proceed despite the unresolved issue.');
  await until(() => primaryCalls().length >= 5 && reviews >= 5 && !activeReviews && !pendingAdvice && !session.isStreaming, 'new user activity permits renewed serious warning');
  assert.equal(primaryCalls().length, 5, 'New user activity must allow another blocker correction');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ scenario: 'advisor-supervision', noCatchUpWait: true, idleAdviceInNextProviderRequest: true, boundedBlockerFollowUps: true, repeatedBlockerAfterUserActivity: true, primaryCalls: primaryCalls().length, reviews, scope: 'real Pi session + deterministic loopback; not live advisor judgment/UI proof' }));
} finally {
  releaseReview();
  if (session) await session.extensionRunner.emit({ type: 'session_shutdown', reason: 'quit' });
  session?.dispose();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  if (previousDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = previousDir;
  if (previousKey === undefined) delete process.env.NEO_PROXY_API_KEY;
  else process.env.NEO_PROXY_API_KEY = previousKey;
  await rm(root, { recursive: true, force: true });
}
