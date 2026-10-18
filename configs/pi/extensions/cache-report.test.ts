import assert from 'node:assert/strict';
import test from 'node:test';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import cacheReport, { cacheTelemetry, formatCacheReport, type CacheTelemetry } from './cache-report.ts';

const usage = { input: 100, output: 10, cacheRead: 0, cacheWrite: 0 };
const message = (timestamp: number) => ({ role: 'assistant' as const, provider: 'synthetic', model: 'test', responseId: `response-${timestamp}`, timestamp, usage });

test('raw telemetry distinguishes absent statistics from an explicit zero', () => {
  assert.deepEqual(cacheTelemetry({ usage: { prompt_tokens: 100 } }), {});
  assert.deepEqual(cacheTelemetry({ usage: { prompt_tokens_details: { cached_tokens: 0 } } }), { read: true });
  assert.deepEqual(cacheTelemetry({ response: { usage: { input_tokens_details: { cached_tokens: 80 } } } }), { read: true });
  assert.deepEqual(cacheTelemetry({ message: { usage: { cache_read_input_tokens: 50, cache_creation_input_tokens: 25 } } }), { read: true, write: true });
  assert.deepEqual(cacheTelemetry({ usage: { prompt_cache_hit_tokens: 9 } }), { read: true });
  assert.deepEqual(cacheTelemetry({ usage: { cached_tokens: -1, cache_creation_input_tokens: null } }), {});
  assert.deepEqual(cacheTelemetry(null), {});
});

test('report joins raw presence to existing per-message usage without inferring misses', () => {
  const first = message(1), second = message(2);
  const entries = [first, second].map(message => ({ type: 'message', message }));
  const telemetry = new Map<string, CacheTelemetry>([['synthetic/test/response-2', { read: true }]]);
  const report = formatCacheReport(entries, telemetry);
  assert.match(report, /read unknown/);
  assert.match(report, /read 0/);
  assert.match(report, /write unknown/);
  assert.match(report, /native.*showCacheMissNotices/);
  assert.doesNotMatch(report, /0%|re-billed|prefix changed/);
  assert.match(formatCacheReport([], telemetry), /No completed/);
});

test('report is limited to the latest 20 messages and positive normalized counters remain evidence', () => {
  const entries = Array.from({ length: 25 }, (_, i) => ({ type: 'message', message: { ...message(i), usage: { ...usage, cacheRead: 80, cacheWrite: 10 } } }));
  const report = formatCacheReport(entries, new Map());
  assert.equal(report.split('\n').filter(line => line.includes('synthetic/test')).length, 20);
  assert.match(report, /read 80.*write 10/);
});

test('command is passive, handles non-UI output, and resets telemetry on session replacement', async () => {
  const handlers = new Map<string, (...args: any[]) => any>();
  let command: any;
  cacheReport({ on: (name: string, handler: any) => handlers.set(name, handler), registerCommand: (name: string, value: any) => { assert.equal(name, 'cache-report'); command = value; } } as unknown as ExtensionAPI);
  const notices: string[] = [];
  const assistant = message(1);
  const ctx = { hasUI: true, sessionManager: { getBranch: () => [{ type: 'message', message: assistant }] }, ui: { notify: (value: string) => notices.push(value) } };
  handlers.get('message_start')?.({ message: assistant }, ctx);
  handlers.get('provider_stream_event')!({ provider: 'synthetic', model: 'test', data: { id: assistant.responseId, usage: { prompt_tokens_details: { cached_tokens: 0 } } } }, ctx);
  handlers.get('message_start')?.({ message: assistant }, ctx);
  handlers.get('message_end')?.({ message: assistant }, ctx);
  assert.equal(notices.length, 0, 'no automatic notifications duplicating native notices');
  await command.handler('', ctx);
  assert.match(notices.pop()!, /read 0/);
  const output: string[] = [];
  const original = console.log;
  console.log = value => { output.push(String(value)); };
  try { await command.handler('', { ...ctx, hasUI: false }); } finally { console.log = original; }
  assert.match(output[0], /read 0/);
  assert.equal(notices.length, 0);
  handlers.get('session_start')!({}, ctx);
  await command.handler('', ctx);
  assert.match(notices.pop()!, /read unknown/);
  handlers.get('session_shutdown')!({}, ctx);
  handlers.get('session_shutdown')!({}, ctx);
});

test('nested provider calls cannot supply cache evidence for the active assistant', async () => {
  const handlers = new Map<string, (...args: any[]) => any>();
  let command: any;
  cacheReport({ on: (name: string, handler: any) => handlers.set(name, handler), registerCommand: (_name: string, value: any) => { command = value; } } as unknown as ExtensionAPI);
  const notices: string[] = [];
  const assistant = message(1);
  const ctx = { hasUI: true, sessionManager: { getBranch: () => [{ type: 'message', message: assistant }] }, ui: { notify: (value: string) => notices.push(value) } };
  handlers.get('message_start')?.({ message: assistant }, ctx);
  handlers.get('provider_stream_event')!({ provider: 'synthetic', model: 'test', data: { id: 'nested-response', usage: { cached_tokens: 0 } } }, ctx);
  handlers.get('message_end')?.({ message: assistant }, ctx);
  await command.handler('', ctx);
  assert.match(notices.pop()!, /read unknown/);
});

test('raw telemetry without a response ID cannot establish an explicit zero for another message', async () => {
  const handlers = new Map<string, (...args: any[]) => any>();
  let command: any;
  cacheReport({ on: (name: string, handler: any) => handlers.set(name, handler), registerCommand: (_name: string, value: any) => { command = value; } } as unknown as ExtensionAPI);
  const notices: string[] = [];
  const assistant = message(1);
  const ctx = { hasUI: true, sessionManager: { getBranch: () => [{ type: 'message', message: assistant }] }, ui: { notify: (value: string) => notices.push(value) } };
  handlers.get('message_start')?.({ message: assistant }, ctx);
  handlers.get('provider_stream_event')!({ provider: 'synthetic', model: 'test', data: { usage: { cached_tokens: 0 } } }, ctx);
  handlers.get('message_end')?.({ message: assistant }, ctx);
  await command.handler('', ctx);
  assert.match(notices.pop()!, /read unknown/);
});

test('Anthropic start usage is attributable, ID-less delta usage stays conservative, and old evidence is evicted', async () => {
  const handlers = new Map<string, (...args: any[]) => any>();
  let command: any;
  cacheReport({ on: (name: string, handler: any) => handlers.set(name, handler), registerCommand: (_name: string, value: any) => { command = value; } } as unknown as ExtensionAPI);
  const notices: string[] = [];
  const assistant = message(1);
  const ctx = { hasUI: true, sessionManager: { getBranch: () => [{ type: 'message', message: assistant }] }, ui: { notify: (value: string) => notices.push(value) } };
  const stream = (data: unknown) => handlers.get('provider_stream_event')!({ provider: 'synthetic', model: 'test', data }, ctx);
  stream({ type: 'message_start', message: { id: assistant.responseId, usage: { cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } });
  stream({ type: 'message_delta', usage: { cache_read_input_tokens: 500 } });
  await command.handler('', ctx);
  assert.match(notices.pop()!, /read 0 · write 0/);
  // A different response with ID-less usage must not inherit the preceding stream identity.
  for (let i = 2; i <= 21; i++) stream({ id: `response-${i}`, usage: { cached_tokens: 0 } });
  await command.handler('', ctx);
  assert.match(notices.pop()!, /read unknown/);
});
