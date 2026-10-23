import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { initTheme } from '@earendil-works/pi-coding-agent';
import { stripTerminalSequences, visibleWidth } from '@earendil-works/pi-tui';
import { theme } from '../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.js';
import { composerColors } from './presentation.ts';
import workers, { workerRows, renderWorkers } from './workers.ts';

const snapshot = (nodes: unknown[]) => ({ kind: 'pi-subagents.async-status-snapshot', version: 1, runs: nodes });
const tool = { id: 'run-a:0', kind: 'step', agent: 'scout', label: 'Map authentication', state: 'running', startedAt: 1000, activity: { currentTool: 'read', lastActivityAt: 2500 } };
const data = { fleet: { version: 1, entries: [{ key: 'opaque-key', asyncRunId: 'run-a', agent: 'scout', startedAt: 1000 }], totalActive: 1, omitted: 0 }, asyncSnapshot: snapshot([{ id: 'run-a', runId: 'run-a', kind: 'subagent', label: 'scout', state: 'running', children: [tool] }]) };

test('public async activity enriches only an unambiguous fleet row; foreground stays unknown', () => {
  const rows = workerRows(data, 3000);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].activity, 'tool');
  assert.match(rows[0].detail, /read/);
  const foreground = workerRows({ fleet: { version: 1, entries: [{ key: 'fg', agent: 'reviewer', startedAt: 1000 }], totalActive: 1 } }, 3000);
  assert.equal(foreground[0].activity, 'idle');
  assert.equal(foreground[0].detail, 'Running · activity unavailable');
});

test('materialized workflow identities suppress async duplicates without dropping foreground', () => {
  const rows = workerRows({ asyncSnapshot: snapshot([{ id: 'workflow', runId: 'workflow', kind: 'workflow', state: 'running', children: [
    { ...tool, id: 'task-1', runId: 'child-a', startedAt: 1800 },
    { ...tool, id: 'task-2', runId: 'child-b', startedAt: 1800 },
  ] }]), fleet: { version: 1, entries: [
    { key: 'opaque1', asyncRunId: 'workflow', agent: 'workflow', startedAt: 900 },
    { key: 'opaque2', asyncRunId: 'child-a', agent: 'scout', startedAt: 1804 },
    { key: 'opaque3', asyncRunId: 'child-b', agent: 'scout', startedAt: 1804 },
    { key: 'foreground', agent: 'scout', startedAt: 1800 },
    { key: 'not-in-snapshot', asyncRunId: 'child-c', agent: 'task', startedAt: 1900 },
  ] } }, 3000);
  assert.equal(rows.length, 4);
  assert.equal(rows.filter(row => row.agent === 'scout').length, 3);
  assert.ok(rows.some(row => row.key === 'foreground'));
  assert.ok(rows.some(row => row.key === 'not-in-snapshot'));
});

test('reported model and thinking appear for async and foreground, missing metadata stays unknown', () => {
  initTheme('dark', false);
  const rows = workerRows({ asyncSnapshot: snapshot([{ ...tool, label: 'Check identities', model: 'neo-proxy/gpt-6-luna', thinking: 'medium' }]),
    fleet: { version: 1, entries: [{ key: 'fg', agent: 'task', goal: 'Run worker tests', model: 'openai/gpt-test', effort: 'high', startedAt: 1000 }] } }, 3000);
  assert.equal(rows[0].model, 'neo-proxy/gpt-6-luna');
  assert.equal(rows[0].thinking, 'medium');
  assert.equal(rows[1].thinking, 'high');
  const rendered = stripTerminalSequences(renderWorkers(rows, theme, 's', 140, 3000).join('\n'));
  assert.match(rendered, /Check identities/);
  assert.match(rendered, /neo-proxy\/gpt-6-luna · medium/);
  assert.match(rendered, /openai\/gpt-test · high/);
  const missing = workerRows({ asyncSnapshot: snapshot([{ ...tool, label: 'task-1' }]) }, 3000);
  const unknown = stripTerminalSequences(renderWorkers(missing, theme, 's', 140, 3000).join('\n'));
  assert.match(unknown, /model pending/);
  assert.match(unknown, /task-1/, 'preserve supplied labels; never invent a task title');
});

test('quiet age is hidden until 20 seconds, no claim that an agent is stuck', () => {
  initTheme('dark', false);
  const rows = workerRows(data, 3000);
  assert.doesNotMatch(stripTerminalSequences(renderWorkers(rows, theme, 's', 160, 3000).join('\n')), /quiet|last activity/);
  assert.match(stripTerminalSequences(renderWorkers(rows, theme, 's', 160, 22500).join('\n')), /quiet 20s/);
  assert.doesNotMatch(stripTerminalSequences(renderWorkers(rows, theme, 's', 160, 22500).join('\n')), /stuck/);
  for (let width = 1; width <= 160; width++) {
    for (const line of renderWorkers(rows, theme, 's', width, 22500)) assert.ok(visibleWidth(line) <= width);
  }
});

test('completed rows expire after five seconds, active and failures remain', () => {
  initTheme('dark', false);
  const done = workerRows({ asyncSnapshot: snapshot([{ ...tool, state: 'complete', endedAt: 2800 }]) }, 3000);
  assert.equal(renderWorkers(done, theme, 's', 80, 3000).length, 2);
  assert.equal(renderWorkers(done, theme, 's', 80, 8000).length, 0);
  const failed = workerRows({ asyncSnapshot: snapshot([{ ...tool, state: 'failed', endedAt: 2800 }]) }, 3000);
  assert.equal(renderWorkers(failed, theme, 's', 80, 8000).length, 2);
});

test('real dark and light themes pulse in a fixed cell with shared activity targets', () => {
  for (const appearance of ['dark', 'light'] as const) {
    initTheme(appearance, false);
    const rows = workerRows(data, 3000);
    const a = renderWorkers(rows, theme, 'session', 80, 3000);
    const b = renderWorkers(rows, theme, 'session', 80, 3600);
    assert.notEqual(a.join(''), b.join(''));
    assert.deepEqual(a.map(visibleWidth), b.map(visibleWidth));
    assert.ok(a.join('').includes('\uedea'));
    assert.ok(a.join('').includes(theme.style('●', { fg: composerColors('session', appearance, 'tool').target })));
    for (let width = 1; width <= 90; width++) {
      for (const row of renderWorkers(rows, theme, 'session', width, 3000)) assert.ok(visibleWidth(row) <= width);
    }
    assert.equal(stripTerminalSequences(a.at(-1)!).split('\n').length, 1);
  }
});

test('queued, attention, failure and completion are static; stale runs stop pulsing', () => {
  initTheme('dark', false);
  for (const state of ['queued', 'paused', 'failed', 'complete', 'stopped']) {
    const rows = workerRows({ asyncSnapshot: snapshot([{ ...tool, state, endedAt: 2800 }]) }, 3000);
    const a = renderWorkers(rows, theme, 's', 100, 3000);
    const b = renderWorkers(rows, theme, 's', 100, 3600);
    // Waiting elapsed time may advance; the icon styling must not.
    assert.equal(a[1].split('scout')[0], b[1].split('scout')[0]);
    if (state === 'failed') assert.equal(rows[0].activity, 'error');
    if (state === 'queued' || state === 'paused') assert.equal(rows[0].activity, 'waiting');
  }
  const rows = workerRows(data, 3000);
  const a = renderWorkers(rows, theme, 's', 100, 3000, true);
  const b = renderWorkers(rows, theme, 's', 100, 3600, true);
  assert.equal(a[1].split('scout')[0], b[1].split('scout')[0]);
  assert.match(stripTerminalSequences(a.join('\n')), /Status unavailable/);
});

test('lifecycle mounts above prompt, correlates replies, polls only confirmed memory path and clears on switch', t => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'], now: 5000 });
  const bus = new EventEmitter();
  const callbacks = new Map<string, (event: unknown, ctx: ExtensionContext) => void>();
  const requests: Array<{ requestId: string; method: string; params?: unknown }> = [];
  const widgets = new Map<string, { render(width: number): string[]; dispose?(): void }>();
  let redraws = 0, dead = false;
  const ctx = { mode: 'tui', sessionManager: { getSessionId: () => 's' }, ui: { theme, setWidget(key: string, factory: unknown, options: { placement?: string } = {}) {
    assert.equal(dead, false, 'never call an obsolete context UI');
    widgets.get(key)?.dispose?.();
    if (typeof factory === 'function') {
      assert.equal(options.placement, 'aboveEditor');
      widgets.set(key, factory({ requestRender() { redraws++; } }));
    } else widgets.delete(key);
  } } } as unknown as ExtensionContext;
  workers({
    on: (name: string, fn: (event: unknown, ctx: ExtensionContext) => void) => callbacks.set(name, fn),
    events: { on: (name: string, fn: (event: unknown) => void) => { bus.on(name, fn); return () => { bus.off(name, fn); }; }, emit: (name: string, value: unknown) => bus.emit(name, value) },
  } as unknown as ExtensionAPI);
  bus.on('subagents:rpc:v1:request', request => { requests.push(request); });
  const reply = (request: typeof requests[number], data: unknown) => bus.emit(`subagents:rpc:v1:reply:${request.requestId}`, { version: 1, requestId: request.requestId, success: true, data });
  const emit = (name: string) => callbacks.get(name)?.({}, ctx);
  emit('session_start');
  const early = requests.at(-1)!;
  bus.emit('subagents:rpc:v1:ready', {});
  assert.notEqual(requests.at(-1)!.requestId, early.requestId, 'ready supersedes an unanswered startup ping');
  reply(early, { ...data, text: 'In-memory subagent status: 1 active child.' });
  assert.equal(widgets.size, 0, 'late superseded reply cannot mount');
  reply(requests.at(-1)!, { capabilities: { fleetStatus: { version: 1 }, statusProjection: { version: 1 } } });
  const status = requests.at(-1)!;
  bus.emit('subagents:rpc:v1:reply:wrong-id', { version: 1, success: true, data });
  assert.equal(widgets.size, 0);
  reply(status, { ...data, text: 'In-memory subagent status: 1 active child.' });
  assert.equal(widgets.size, 1);
  const first = widgets.get('huginn-workers')!.render(100).join('\n');
  t.mock.timers.tick(500);
  assert.ok(redraws > 0);
  const second = widgets.get('huginn-workers')!.render(100).join('\n');
  assert.notEqual(first, second);
  t.mock.timers.tick(1500);
  assert.equal(requests.at(-1)!.method, 'status');
  assert.equal(requests.at(-1)!.params, undefined, 'untargeted request only');
  reply(requests.at(-1)!, { ...data, text: 'Executor status fallback' });
  const count = requests.length;
  t.mock.timers.tick(5000);
  assert.equal(requests.length, count, 'no timed executor polling');
  emit('tool_execution_end');
  bus.emit(`subagents:rpc:v1:reply:${requests.at(-1)!.requestId}`, { version: 1, success: false });
  assert.match(stripTerminalSequences(widgets.get('huginn-workers')!.render(100).join('\n')), /Status unavailable/);
  emit('tool_execution_end');
  reply(requests.at(-1)!, { ...data, text: 'In-memory subagent status: 1 active child.' });
  emit('tool_execution_end');
  t.mock.timers.tick(3000);
  assert.match(stripTerminalSequences(widgets.get('huginn-workers')!.render(100).join('\n')), /Status unavailable/);
  emit('session_shutdown');
  assert.equal(widgets.size, 0);
  emit('session_shutdown');
  dead = true;
  const next = { ...ctx, mode: 'print' } as ExtensionContext;
  callbacks.get('session_start')!({}, next);
  t.mock.timers.tick(10000);
  assert.equal(requests.length, count + 3);
});
