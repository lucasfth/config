// Explicitly approved, tool-free native Pi comparison. Not a live-profile test.
// The selected skill is preloaded equally in both variants: this measures content
// behavior, NOT autonomous skill selection. No retries or model fallback.
import assert from 'node:assert/strict';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager } from '@earendil-works/pi-coding-agent';
import { prepareRuntime } from './runtime.mjs';
import { privateEvaluationOutput, writePrivateEvaluation } from './private-evaluation-output.mjs';

const [suitePath, baselinePath, candidatePath, output] = process.argv.slice(2);
assert.ok(output, 'suite, baseline SKILL.md, candidate SKILL.md, private output directory required');
const hash = data => createHash('sha256').update(data).digest('hex');
const suite = JSON.parse(await readFile(suitePath, 'utf8'));
assert.ok(suite.cases.length <= 8 && suite.trials === 1, 'At most 16 single-turn requests');
const upstream = process.env.NEO_PROXY_URL;
assert.ok(upstream, 'Configured provider endpoint required');
const agentDir = await mkdtemp(path.join(os.tmpdir(), 'aar-pi-eval-'));
await privateEvaluationOutput(output);
let requestCount = 0;
const server = http.createServer(async (req, res) => {
  if (++requestCount > 16) { res.writeHead(429); res.end('Evaluation request budget exhausted'); return; }
  try {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const payload = JSON.parse(raw);
    payload.max_tokens = 1200;
    payload.max_completion_tokens = 1200;
    raw = JSON.stringify(payload);
    const headers = { 'Content-Type': 'application/json', ...(req.headers.authorization ? { Authorization: req.headers.authorization } : {}) };
    const target = new URL(req.url.replace(/^\//, ''), upstream.replace(/\/?$/, '/'));
    const response = await fetch(target, { method: 'POST', headers, body: raw, signal: AbortSignal.timeout(120000) });
    res.writeHead(response.status, { 'Content-Type': response.headers.get('content-type') || 'application/json' });
    for await (const chunk of response.body) res.write(chunk);
    res.end();
  } catch { res.writeHead(502); res.end('Evaluation transport failed'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
try {
  await prepareRuntime({ agentDir, env: { ...process.env, NEO_PROXY_URL: `http://127.0.0.1:${server.address().port}` }, ompDir: path.join(agentDir, 'absent') });
  const settings = SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false }, defaultProvider: 'neo-proxy', defaultModel: 'gpt-6-luna' });
  const runtime = await ModelRuntime.create({ authPath: path.join(agentDir, 'auth.json'), modelsPath: path.join(agentDir, 'models.json') });
  await runtime.setRuntimeApiKey('neo-proxy', process.env.NEO_PROXY_API_KEY);
  const traces = [];
  for (const variant of ['baseline', 'candidate']) {
    const skill = await readFile(variant === 'baseline' ? baselinePath : candidatePath, 'utf8');
    for (const task of suite.cases) {
      const loader = new DefaultResourceLoader({ cwd: agentDir, agentDir, settingsManager: settings, noExtensions: true,
        noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
        appendSystemPrompt: [`Preloaded procedure for this isolated evaluation (apply only if relevant):\n${skill}`] });
      await loader.reload();
      const made = await createAgentSession({ cwd: agentDir, agentDir, modelRuntime: runtime, resourceLoader: loader,
        settingsManager: settings, sessionManager: SessionManager.inMemory(), tools: [], thinkingLevel: 'off' });
      const session = made.session;
      const start = performance.now(), countBefore = requestCount;
      try {
        assert.equal(session.getActiveToolNames().length, 0);
        const contract = Object.fromEntries(Object.entries(task.expected).map(([key, value]) => [key, suite.value_contract?.[key] ?? typeof value]));
        await session.prompt(task.prompt + '\nReturn JSON only: {"claims":{...}}. Required claim keys and value types: ' +
          JSON.stringify(contract) + '. Fill values from the scenario; do not infer unstated success. No extra explanation.');
        const message = session.messages.filter(m => m.role === 'assistant').at(-1);
        if (!message || message.stopReason === 'error') {
          await writePrivateEvaluation(output, 'hugi-failure.json', JSON.stringify({ messages: session.messages, requests: requestCount }, null, 2));
          throw new Error('Provider did not complete evaluation; see private failure artifact');
        }
        assert.equal(requestCount - countBefore, 1, 'Exactly one request per case');
        const raw = session.getLastAssistantText();
        let claims; try { claims = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, '').trim()).claims; } catch { claims = {}; }
        const artifact = `hugi-${variant}-${task.id}.json`;
        const content = JSON.stringify({ claims: claims ?? {}, raw, messages: session.messages, systemPrompt: session.systemPrompt }, null, 2) + '\n';
        await writePrivateEvaluation(output, artifact, content);
        traces.push({ harness: 'hugi', variant, case: task.id, trial: 1, model: session.model.id, provider: session.model.provider,
          harness_revision: 'native-pi-sdk-1.4.0-source-evaluation', skill_sha256: hash(skill), elapsed_seconds: (performance.now()-start)/1000,
          input_tokens: message.usage?.input ?? 0, output_tokens: message.usage?.output ?? 0,
          artifact, artifact_sha256: hash(content), capture: 'native' });
        await writePrivateEvaluation(output, 'traces-hugi.json', JSON.stringify(traces, null, 2) + '\n');
        console.log(JSON.stringify({ harness: 'hugi', variant, case: task.id, requests: requestCount }));
      } finally { session.dispose(); }
    }
  }
} finally {
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  console.log(JSON.stringify({ totalRequests: requestCount, scratchProfile: agentDir, preloadedSkillOnly: true, liveProfileModified: false }));
}
