// Explicit native streaming cache acceptance; run identically before/after model-service restart.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { streamSimple } from './node_modules/@earendil-works/pi-ai/dist/api/openai-completions.js';
const config = JSON.parse(await readFile(path.join(os.homedir(), '.local/share/gimle-qwen/client.json'), 'utf8'));
const apiKey = (await readFile(config.keyFile, 'utf8')).trim();
const model = { id: 'qwen3.5-9b-6bit', provider: 'gimle', api: 'openai-completions', baseUrl: config.baseUrl,
  reasoning: false, input: ['text'], contextWindow: 139264, maxTokens: 4096, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  compat: { supportsStore: false, supportsDeveloperRole: false, supportsReasoningEffort: false, maxTokensField: 'max_tokens' } };
const messages = [{ role: 'system', content: 'Use only the supplied fixture. Return the receipt code exactly.', timestamp: 0 },
  { role: 'user', content: [{ type: 'text', text: 'Archive item: reference 00482; closed; no action.\n'.repeat(1000) + '\nReceipt code: GIMLE_CACHE_731. Reply only with that code.' }], timestamp: 1 }];
const start = performance.now();
let first = null;
const stream = streamSimple(model, { messages }, { apiKey, temperature: 0, maxTokens: 64, signal: AbortSignal.timeout(180000) });
for await (const event of stream) if (first === null && event.type === 'text_delta') first = (performance.now() - start) / 1000;
const result = await stream.result();
assert.equal(result.stopReason, 'stop', result.errorMessage);
const text = result.content.filter(p => p.type === 'text').map(p => p.text).join('');
assert.match(text, /GIMLE_CACHE_731/);
const receipt = { firstTokenSeconds: first, elapsedSeconds: (performance.now() - start) / 1000, text, usage: result.usage };
console.log(JSON.stringify(receipt));
if (process.argv[2]) await writeFile(process.argv[2], JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 });
