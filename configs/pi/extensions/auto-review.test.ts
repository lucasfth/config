import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import autoReview, { snapshotWorkspace, stableWorkspaceSnapshot, workspaceDelta, diffReviewTask, parseReviewOutcome } from './auto-review.ts';

function initRepo(root: string) {
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--allow-empty', '-m', 'baseline'], { cwd: root });
}
function setup(cwd: string, testOptions?: { rpcTimeoutMs?: number; spawnTimeoutMs?: number }) {
  const bus = new EventEmitter(), callbacks = new Map<string, (...args: any[]) => any>(), requests: any[] = [], notices: string[] = [], transcriptEntries: any[] = [];
  const childMarker = process.env.PI_SUBAGENT_CHILD;
  delete process.env.PI_SUBAGENT_CHILD;
  const pi = { events: { on: (name: string, fn: (...args: any[]) => void) => { bus.on(name, fn); return () => bus.off(name, fn); }, emit: (name: string, payload: unknown) => bus.emit(name, payload) }, on(name: string, fn: (...args: any[]) => any) { callbacks.set(name, fn); }, sendMessage(data: any) { transcriptEntries.push({ type: 'custom_message', data }); notices.push(data.content); } } as unknown as ExtensionAPI;
  bus.on('subagents:rpc:v1:request', (request: any) => requests.push(request));
  const sessionFile = path.join(cwd, 'sessions', 'parent-session.jsonl');
  const ctx = { cwd, hasUI: true, sessionManager: { getEntries: () => [], getSessionFile: () => sessionFile }, ui: { notify: (message: string) => notices.push(message) } } as unknown as ExtensionContext;
  mkdirSync(path.join(cwd, 'sessions/subagent-artifacts'), { recursive: true });
  writeFileSync(sessionFile, '');
  const exclude = path.join(cwd, '.git/info/exclude');
  if (existsSync(path.dirname(exclude))) { try { writeFileSync(exclude, `${readFileSync(exclude, 'utf8')}\nsessions/\n`); } catch { writeFileSync(exclude, 'sessions/\n'); } }
  autoReview(pi, testOptions);
  return { bus, callbacks, requests, notices, transcriptEntries, ctx, childMarker };
}
const reply = (bus: EventEmitter, request: any, data: any) => bus.emit(`subagents:rpc:v1:reply:${request.requestId}`, { version: 1, requestId: request.requestId, success: true, data });

test('preexisting dirty tracked and untracked files make delta incomplete without leaking content', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'auto-review-dirty-'));
  try {
    initRepo(root); await mkdir(path.join(root, 'src')); await writeFile(path.join(root, 'src/a.ts'), 'committed');
    execFileSync('git', ['add', 'src/a.ts'], { cwd: root }); execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'file'], { cwd: root });
    await writeFile(path.join(root, 'src/a.ts'), 'PRIVATE tracked preexisting');
    await writeFile(path.join(root, 'private.ts'), 'PRIVATE untracked preexisting');
    const before = await stableWorkspaceSnapshot(root);
    await writeFile(path.join(root, 'src/a.ts'), 'PRIVATE tracked preexisting plus task');
    await writeFile(path.join(root, 'private.ts'), 'PRIVATE untracked preexisting plus task');
    await writeFile(path.join(root, 'new.ts'), 'new task file');
    const after = await stableWorkspaceSnapshot(root);
    assert.throws(() => workspaceDelta(before, after), /already had pre-task changes|untracked at baseline/);
    const prompt = diffReviewTask('safe delta', before.digest, 'task');
    assert.doesNotMatch(prompt, /PRIVATE/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('clean tracked edits produce task-only textual diff; no-change is not reviewed', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'auto-review-nochange-'));
  try {
    initRepo(root);
    const before = await stableWorkspaceSnapshot(root);
    assert.equal(workspaceDelta(before, await stableWorkspaceSnapshot(root)), undefined);
    await writeFile(path.join(root, 'tracked.ts'), 'before\n');
    execFileSync('git', ['add', 'tracked.ts'], { cwd: root });
    execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'tracked'], { cwd: root });
    const cleanBefore = await stableWorkspaceSnapshot(root, true);
    await writeFile(path.join(root, 'tracked.ts'), 'before\nafter\n');
    const cleanAfter = await stableWorkspaceSnapshot(root);
    const delta = workspaceDelta(cleanBefore, cleanAfter)!;
    assert.match(delta, /\+after/);
    assert.doesNotMatch(delta, /\+before/);
    const noChange = await mkdtemp(path.join(os.tmpdir(), 'auto-review-nochange-session-'));
    try {
      initRepo(noChange);
      const { callbacks, requests, transcriptEntries, ctx } = setup(noChange);
      await callbacks.get('before_agent_start')!({ messageType: 'user', prompt: 'explain a concept' }, ctx);
      await callbacks.get('agent_before_settle')!({ outcome: 'completed' }, ctx);
      assert.equal(requests.some(item => item.method === 'spawn'), false);
      assert.ok(transcriptEntries.some(entry => /no workspace changes detected/.test(entry.data.content)));
    } finally { await rm(noChange, { recursive: true, force: true }); }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('hook passes only clean tracked task diff to reviewer and records full report', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'auto-review-e2e-'));
  try {
    initRepo(root);
    await writeFile(path.join(root, 'feature.ts'), 'const value = 1;\n');
    execFileSync('git', ['add', 'feature.ts'], { cwd: root });
    execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'feature baseline'], { cwd: root });
    const { bus, callbacks, requests, notices, ctx, childMarker } = setup(root);
    delete process.env.PI_SUBAGENT_CHILD;
    await callbacks.get('before_agent_start')!({ messageType: 'user', prompt: 'change value safely' }, ctx);
    await writeFile(path.join(root, 'feature.ts'), 'const value = 2;\n');
    bus.on('subagents:rpc:v1:request', (request: any) => {
      if (request.method === 'ping') reply(bus, request, { events: { asyncComplete: 'subagent:async-complete' }, capabilities: { processTerminalProof: { version: 1 } } });
      if (request.method === 'status') reply(bus, request, { details: { runId: request.params.id }, text: `Run: ${request.params.id}\nState: complete` });
      if (request.method === 'spawn') queueMicrotask(async () => {
        const runId = 'review-run';
        const output = path.join(root, `sessions/subagent-artifacts/${runId}_reviewer_output.md`);
        await mkdir(path.dirname(output), { recursive: true });
        await writeFile(output, 'Reviewed changed value.\nAUTO_REVIEW_RESULT: CLEAN\n');
        bus.emit('subagent:async-complete', { id: runId, runId, state: 'complete', success: true, results: [{ agent: 'reviewer', success: true, artifactPath: output }] });
        reply(bus, request, { details: { runId: 'review-run' } });
      });
    });
    const result = await callbacks.get('agent_before_settle')!({ outcome: 'completed' }, ctx);
    const task = requests.find(request => request.method === 'spawn')?.params.task as string;
    assert.equal(requests.filter(request => request.method === 'spawn').length, 1, `childMarker=${childMarker} env=${process.env.PI_SUBAGENT_CHILD} notices=${JSON.stringify(notices)}`);
    assert.match(task, /-const value = 1/);
    assert.match(task, /\+const value = 2/);
    assert.doesNotMatch(task, /const unrelated =|PRIVATE/);
    assert.ok(result, JSON.stringify({ notices, requests }));
    if (childMarker !== undefined) process.env.PI_SUBAGENT_CHILD = childMarker; else delete process.env.PI_SUBAGENT_CHILD;
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('binary files fail closed during bounded workspace scan', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'auto-review-binary-'));
  try { initRepo(root); await writeFile(path.join(root, 'binary.dat'), Buffer.from([255, 0])); await assert.rejects(snapshotWorkspace(root), /non-UTF8 or binary/); }
  finally { await rm(root, { recursive: true, force: true }); }
});

test('reviewer runtime is excluded from child sessions using pi-subagents child env marker', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'auto-review-child-'));
  try {
    initRepo(root); await writeFile(path.join(root, 'change.ts'), 'changed');
    const { callbacks, requests, ctx, notices } = setup(root), previous = process.env.PI_SUBAGENT_CHILD;
    process.env.PI_SUBAGENT_CHILD = '1';
    try {
      await callbacks.get('before_agent_start')!({ messageType: 'user', prompt: 'child task' }, ctx);
      await callbacks.get('agent_before_settle')!({ outcome: 'completed' }, ctx);
      assert.equal(requests.some(item => item.method === 'spawn'), false);
    } finally { if (previous === undefined) delete process.env.PI_SUBAGENT_CHILD; else process.env.PI_SUBAGENT_CHILD = previous; }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('baseline/snapshot failures are recorded as transcript custom messages', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'auto-review-failure-'));
  try {
    const { callbacks, notices, ctx } = setup(root);
    await callbacks.get('before_agent_start')!({ messageType: 'user', prompt: 'task' }, ctx);
    assert.ok(notices.some(item => /Auto-review incomplete: baseline unavailable/.test(item)));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('malformed ping reply records incomplete transcript entry and does not spawn reviewer', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'auto-review-malformed-'));
  try {
    initRepo(root);
    await writeFile(path.join(root, 'file.ts'), 'const value = 1;\n');
    execFileSync('git', ['add', 'file.ts'], { cwd: root });
    execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'file'], { cwd: root });
    const { bus, callbacks, requests, transcriptEntries, ctx } = setup(root);
    await callbacks.get('before_agent_start')!({ messageType: 'user', prompt: 'edit value' }, ctx);
    await writeFile(path.join(root, 'file.ts'), 'const value = 2;\n');
    bus.on('subagents:rpc:v1:request', request => { if (request.method === 'ping') bus.emit(`subagents:rpc:v1:reply:${request.requestId}`, { version: 1, requestId: request.requestId, success: true, data: { events: {}, capabilities: {} } }); });
    await callbacks.get('agent_before_settle')!({ outcome: 'completed' }, ctx);
    assert.equal(requests.some(request => request.method === 'spawn'), false);
    assert.ok(transcriptEntries.some(entry => entry.type === 'custom_message' && /review failed/.test(entry.data.content)));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('installed pi-subagents runner sets child marker before child host initialization', async () => {
  const { readFile } = await import('node:fs/promises');
  const runnerPath = path.resolve('node_modules/pi-subagents/src/runs/background/subagent-runner.js');
  const source = await readFile(runnerPath, 'utf8');
  assert.ok(source.includes('process.env[SUBAGENT_CHILD_ENV] = "1"'));
  const configPath = path.resolve('node_modules/pi-subagents/src/runs/shared/child-runtime-config.js');
  const config = await readFile(configPath, 'utf8');
  assert.ok(config.includes('SUBAGENT_CHILD_ENV = "PI_SUBAGENT_CHILD"'));
});

test('spawn reply before completion event is correlated and reviewed', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'auto-review-late-complete-'));
  try {
    initRepo(root);
    await writeFile(path.join(root, 'late.ts'), 'const value = 1;\n');
    execFileSync('git', ['add', 'late.ts'], { cwd: root });
    execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'late'], { cwd: root });
    const { bus, callbacks, requests, ctx } = setup(root);
    await callbacks.get('before_agent_start')!({ messageType: 'user', prompt: 'change value' }, ctx);
    await writeFile(path.join(root, 'late.ts'), 'const value = 2;\n');

    let completion: (() => void) | undefined;
    bus.on('subagents:rpc:v1:request', request => {
      if (request.method === 'ping') reply(bus, request, { events: { asyncComplete: 'subagent:async-complete' }, capabilities: {} });
      if (request.method === 'spawn') { const output = path.join(root, `sessions/subagent-artifacts/late-run_reviewer_output.md`); completion = () => bus.emit('subagent:async-complete', { id: 'late-run', runId: 'late-run', state: 'complete', success: true, results: [{ agent: 'reviewer', success: true, artifactPath: output }] }); reply(bus, request, { details: { runId: 'late-run' } }); }
      if (request.method === 'status') reply(bus, request, { details: { runId: request.params.id }, text: 'State: complete' });
    });
    const settle = callbacks.get('agent_before_settle')!({ outcome: 'completed' }, ctx);
    while (!completion) await new Promise(resolve => setImmediate(resolve));
    const spawn = requests.find(request => request.method === 'spawn');
    const output = path.join(root, `sessions/subagent-artifacts/late-run_reviewer_output.md`);
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, 'Late event review.\nAUTO_REVIEW_RESULT: CLEAN\n');
    completion();
    const result = await settle;
    assert.equal(requests.filter(request => request.method === 'spawn').length, 1);
    assert.match(result.entries[0].content, /Late event review/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('spawn RPC timeout records transcript and never retries spawn', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'auto-review-rpc-timeout-'));
  try {
    initRepo(root);
    await writeFile(path.join(root, 'timeout.ts'), 'const value = 1;\n');
    execFileSync('git', ['add', 'timeout.ts'], { cwd: root });
    execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'timeout'], { cwd: root });
    const { bus, callbacks, requests, transcriptEntries, ctx } = setup(root, { spawnTimeoutMs: 30 });
    await callbacks.get('before_agent_start')!({ messageType: 'user', prompt: 'change value' }, ctx);
    await writeFile(path.join(root, 'timeout.ts'), 'const value = 2;\n');
    bus.on('subagents:rpc:v1:request', request => { if (request.method === 'ping') reply(bus, request, { events: { asyncComplete: 'subagent:async-complete' }, capabilities: {} }); });
    const settle = callbacks.get('agent_before_settle')!({ outcome: 'completed' }, ctx);
    await settle;
    assert.equal(requests.filter(request => request.method === 'spawn').length, 1);
    assert.ok(transcriptEntries.some(entry => /RPC spawn reply timed out/.test(entry.data.content)));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('preexisting untracked file with private sentinel fails closed through hooks without spawning', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'auto-review-untracked-private-'));
  const sentinel = 'PRIVATE_SENTINEL_DO_NOT_DISCLOSE';
  try {
    initRepo(root);
    await writeFile(path.join(root, 'already-untracked.ts'), sentinel);
    const { bus, callbacks, requests, transcriptEntries, ctx } = setup(root, { spawnTimeoutMs: 30 });
    await callbacks.get('before_agent_start')!({ messageType: 'user', prompt: 'add a comment' }, ctx);
    await writeFile(path.join(root, 'already-untracked.ts'), `${sentinel}\n// task addition\n`);
    await callbacks.get('agent_before_settle')!({ outcome: 'completed' }, ctx);
    assert.equal(requests.some(request => request.method === 'spawn'), false);
    assert.ok(transcriptEntries.some(entry => /untracked at baseline/.test(entry.data.content)));
    assert.ok(transcriptEntries.every(entry => !JSON.stringify(entry).includes(sentinel)));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('mismatched artifact path is rejected without reading external sentinel', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'auto-review-mismatch-'));
  const outside = path.join(root, 'sensitive.txt');
  try {
    initRepo(root);
    await writeFile(path.join(root, 'review.ts'), 'const value = 1;\\n');
    execFileSync('git', ['add', 'review.ts'], { cwd: root });
    execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'review'], { cwd: root });
    await writeFile(outside, 'PRIVATE_EXTERNAL_SENTINEL');
    const { bus, callbacks, requests, transcriptEntries, ctx } = setup(root);
    await callbacks.get('before_agent_start')!({ messageType: 'user', prompt: 'edit value' }, ctx);
    await writeFile(path.join(root, 'review.ts'), 'const value = 2;\\n');
    bus.on('subagents:rpc:v1:request', request => {
      if (request.method === 'ping') reply(bus, request, { events: { asyncComplete: 'subagent:async-complete' }, capabilities: {} });
      if (request.method === 'status') reply(bus, request, { details: { runId: request.params.id }, text: 'State: complete' });
      if (request.method === 'spawn') {
        bus.emit('subagent:async-complete', { id: 'bad-path', runId: 'bad-path', state: 'complete', success: true, results: [{ agent: 'reviewer', success: true, artifactPath: outside }] });
        reply(bus, request, { details: { runId: 'bad-path' } });
      }
    });
    await callbacks.get('agent_before_settle')!({ outcome: 'completed' }, ctx);
    assert.ok(transcriptEntries.some(entry => /review failed/.test(entry.data.content)));
    assert.ok(transcriptEntries.every(entry => !JSON.stringify(entry).includes('PRIVATE_EXTERNAL_SENTINEL')));
    assert.equal(requests.filter(request => request.method === 'spawn').length, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('symlink at preselected reviewer output is rejected', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'auto-review-symlink-'));
  try {
    initRepo(root);
    await writeFile(path.join(root, 'review.ts'), 'const value = 1;\\n');
    execFileSync('git', ['add', 'review.ts'], { cwd: root });
    execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'review'], { cwd: root });
    const { bus, callbacks, requests, transcriptEntries, ctx } = setup(root);
    await callbacks.get('before_agent_start')!({ messageType: 'user', prompt: 'edit value' }, ctx);
    await writeFile(path.join(root, 'review.ts'), 'const value = 2;\\n');
    bus.on('subagents:rpc:v1:request', request => {
      if (request.method === 'ping') reply(bus, request, { events: { asyncComplete: 'subagent:async-complete' }, capabilities: {} });
      if (request.method === 'status') reply(bus, request, { details: { runId: request.params.id }, text: 'State: complete' });
      if (request.method === 'spawn') {
        const output = request.params.output;
        void import('node:fs/promises').then(fs => fs.symlink(path.join(root, 'review.ts'), output));
        bus.emit('subagent:async-complete', { id: 'symlink', runId: 'symlink', state: 'complete', success: true, results: [{ agent: 'reviewer', success: true, artifactPath: output }] });
        reply(bus, request, { details: { runId: 'symlink' } });
      }
    });
    await callbacks.get('agent_before_settle')!({ outcome: 'completed' }, ctx);
    assert.ok(transcriptEntries.some(entry => /review failed/.test(entry.data.content)));
    assert.equal(requests.filter(request => request.method === 'spawn').length, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('findings continue parent once and bounded second review reaches clean', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'auto-review-rounds-'));
  try {
    initRepo(root);
    await writeFile(path.join(root, 'rounds.ts'), 'const value = 1;\n');
    execFileSync('git', ['add', 'rounds.ts'], { cwd: root });
    execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'rounds'], { cwd: root });
    const { bus, callbacks, requests, transcriptEntries, ctx } = setup(root);
    await mkdir(path.join(root, 'sessions/subagent-artifacts'), { recursive: true });
    await writeFile(path.join(root, 'sessions/subagent-artifacts/.keep'), 'fixture artifact directory');
    execFileSync('git', ['add', '-f', 'sessions/subagent-artifacts/.keep'], { cwd: root });
    execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'artifact directory'], { cwd: root });
    await callbacks.get('before_agent_start')!({ messageType: 'user', prompt: 'make value safe' }, ctx);
    await writeFile(path.join(root, 'rounds.ts'), 'const value = 2;\n');
    let runs = 0;
    bus.on('subagents:rpc:v1:request', request => {
      if (request.method === 'ping') reply(bus, request, { events: { asyncComplete: 'subagent:async-complete' }, capabilities: {} });
      if (request.method === 'status') reply(bus, request, { details: { runId: request.params.id }, text: 'State: complete' });
      if (request.method === 'spawn') {
        const runId = `round-${++runs}`;
        const report = runs === 1 ? 'Potential issue: validate value.\nAUTO_REVIEW_RESULT: FINDINGS\n' : 'Fixed value verified.\nAUTO_REVIEW_RESULT: CLEAN\n';
        const output = path.join(root, `sessions/subagent-artifacts/${runId}_reviewer_output.md`);
        void writeFile(output, report).then(() => {
          bus.emit('subagent:async-complete', { id: runId, runId, state: 'complete', success: true, results: [{ agent: 'reviewer', success: true, artifactPath: output }] });
          reply(bus, request, { details: { runId } });
        });
      }
    });
    const first = await callbacks.get('agent_before_settle')!({ outcome: 'completed' }, ctx);
    assert.ok(first, JSON.stringify({ transcriptEntries, requests, runs }));
    assert.equal(first.continue, true);
    assert.equal(first.entries[0].content.includes('1/2'), true);
    assert.match(first.entries[1].content, /untrusted leads/);
    await writeFile(path.join(root, 'rounds.ts'), 'const value = 2; // validated\n');
    await callbacks.get('before_agent_start')!({ messageType: 'user', prompt: 'continue after verifying finding' }, ctx);
    const second = await callbacks.get('agent_before_settle')!({ outcome: 'completed' }, ctx);
    assert.ok(second, JSON.stringify({ transcriptEntries, requests, runs }));
    assert.equal(second.continue, undefined);
    assert.match(second.entries[0].content, /Fixed value verified/);
    assert.equal(runs, 2);
    assert.ok(requests.filter(request => request.method === 'spawn').length === 2);
    assert.ok(transcriptEntries.every(entry => !entry.data.content.includes('reached the 2-round limit')));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('malformed reviewer outcome is incomplete and never claims clean', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'auto-review-invalid-result-'));
  try {
    initRepo(root);
    await writeFile(path.join(root, 'invalid.ts'), 'const value = 1;\\n');
    execFileSync('git', ['add', 'invalid.ts'], { cwd: root });
    execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'invalid'], { cwd: root });
    const { bus, callbacks, requests, transcriptEntries, ctx } = setup(root);
    await callbacks.get('before_agent_start')!({ messageType: 'user', prompt: 'edit value' }, ctx);
    await writeFile(path.join(root, 'invalid.ts'), 'const value = 2;\\n');
    bus.on('subagents:rpc:v1:request', request => {
      if (request.method === 'ping') reply(bus, request, { events: { asyncComplete: 'subagent:async-complete' }, capabilities: {} });
      if (request.method === 'status') reply(bus, request, { details: { runId: request.params.id }, text: 'State: complete' });
      if (request.method === 'spawn') {
        const runId = 'malformed-result';
        const output = path.join(root, `sessions/subagent-artifacts/${runId}_reviewer_output.md`);
        void writeFile(output, 'AUTO_REVIEW_RESULT: CLEAN\nAUTO_REVIEW_RESULT: FINDINGS\n').then(() => {
          bus.emit('subagent:async-complete', { id: runId, runId, state: 'complete', success: true, results: [{ agent: 'reviewer', success: true, artifactPath: output }] });
          reply(bus, request, { details: { runId } });
        });
      }
    });
    await callbacks.get('agent_before_settle')!({ outcome: 'completed' }, ctx);
    assert.ok(transcriptEntries.some(entry => /text after terminal result marker/.test(entry.data.content)));
    assert.equal(requests.filter(request => request.method === 'spawn').length, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('escaping artifact path does not read external sentinel', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'auto-review-escape-'));
  const outside = await mkdtemp(path.join(os.tmpdir(), 'auto-review-outside-'));
  const secret = path.join(outside, 'secret.txt');
  try {
    initRepo(root);
    await writeFile(secret, 'PRIVATE_OUTSIDE_SENTINEL');
    await writeFile(path.join(root, 'escape.ts'), 'const value = 1;\\n');
    execFileSync('git', ['add', 'escape.ts'], { cwd: root });
    execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'escape'], { cwd: root });
    const { bus, callbacks, requests, transcriptEntries, ctx } = setup(root);
    await callbacks.get('before_agent_start')!({ messageType: 'user', prompt: 'edit value' }, ctx);
    await writeFile(path.join(root, 'escape.ts'), 'const value = 2;\\n');
    bus.on('subagents:rpc:v1:request', request => {
      if (request.method === 'ping') reply(bus, request, { events: { asyncComplete: 'subagent:async-complete' }, capabilities: {} });
      if (request.method === 'status') reply(bus, request, { details: { runId: request.params.id }, text: 'State: complete' });
      if (request.method === 'spawn') {
        bus.emit('subagent:async-complete', { id: 'escape', runId: 'escape', state: 'complete', success: true, results: [{ agent: 'reviewer', success: true, artifactPath: secret }] });
        reply(bus, request, { details: { runId: 'escape' } });
      }
    });
    await callbacks.get('agent_before_settle')!({ outcome: 'completed' }, ctx);
    assert.ok(transcriptEntries.some(entry => /review failed/.test(entry.data.content)));
    assert.ok(transcriptEntries.every(entry => !JSON.stringify(entry).includes('PRIVATE_OUTSIDE_SENTINEL')));
    assert.equal(requests.filter(request => request.method === 'spawn').length, 1);
  } finally { await rm(root, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); }
});

test('review outcome parser accepts one final marker, permits only blank suffix, rejects fenced marker/prose', () => {
  assert.equal(parseReviewOutcome('Review complete.\nAUTO_REVIEW_RESULT: CLEAN\n \t\n').status, 'clean');
  assert.throws(() => parseReviewOutcome('Review complete.\n```markdown\nAUTO_REVIEW_RESULT: CLEAN\n```'), /text after terminal result marker/);
  assert.throws(() => parseReviewOutcome('AUTO_REVIEW_RESULT: CLEAN\nAUTO_REVIEW_RESULT: FINDINGS'), /text after terminal result marker/);
  assert.throws(() => parseReviewOutcome('AUTO_REVIEW_RESULT: CLEAN\nordinary trailing prose'), /text after terminal result marker/);
});
