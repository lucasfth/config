import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { spawn } from 'zigpty';
import headless from '@xterm/headless';
import { prepareRuntime, sourceDir, repoDir } from './runtime.mjs';

// Real host + public RPC bridge + real package projections. Only worker execution
// is synthetic: this probe never makes provider calls or starts child agents.
const dir = await mkdtemp(path.join(os.tmpdir(), 'pi-workers-proof-'));
const screen = new headless.Terminal({ cols: 110, rows: 40, allowProposedApi: true });
let pty, raw = '';
const samples = [];
try {
  const env = Object.fromEntries(['PATH', 'HOME', 'USER', 'SHELL', 'TMPDIR', 'LANG'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
  Object.assign(env, { PI_CODING_AGENT_DIR: dir, NEO_PROXY_URL: 'http://127.0.0.1:9/v1', NEO_PROXY_API_KEY: 'fixture', PI_OFFLINE: '1', TERM: 'xterm-256color', COLORTERM: 'truecolor' });
  await prepareRuntime({ agentDir: dir, env, ompDir: path.join(dir, 'absent') });
  const settings = JSON.parse(await readFile(path.join(dir, 'settings.json'), 'utf8'));
  assert.ok(settings.extensions.some(file => file.endsWith('/workers.ts')), 'generated profile includes worker extension');
  const config = JSON.parse(await readFile(path.join(dir, 'extensions/subagent/config.json'), 'utf8'));
  assert.equal(config.fleetView, false); assert.equal(config.asyncWidget, false);
  assert.equal(config.inlineToolDisplay, 'summary');
  const probe = path.join(dir, 'workers-probe.ts');
  await writeFile(probe, `import { appendFileSync } from 'node:fs';
import { registerSubagentRpcBridge } from ${JSON.stringify(path.join(sourceDir, 'node_modules/pi-subagents/src/extension/rpc.js'))};
export default pi => {
  let bridge, state, ctx;
  pi.events.on('subagents:rpc:v1:request', request => {
    appendFileSync(${JSON.stringify(path.join(dir, 'rpc.log'))}, JSON.stringify({ request }) + '\\n');
    pi.events.on('subagents:rpc:v1:reply:' + request.requestId, reply => appendFileSync(${JSON.stringify(path.join(dir, 'rpc.log'))}, JSON.stringify({ reply }) + '\\n'));
  });
  pi.on('session_start', (_, context) => {
    ctx = context;
    const sessionId = ctx.sessionManager.getSessionId();
    state = { currentSessionId: sessionId, statusProjectionSessionId: sessionId, foregroundControls: new Map(), asyncJobs: new Map(), fleetJobs: new Map() };
    bridge = registerSubagentRpcBridge({ events: pi.events, getContext: () => ctx, state, execute: () => { process.stdout.write('\x1b]777;unexpected-executor-poll\x07'); throw new Error('Unexpected executor polling'); } });
    bridge.emitReady();
    process.stdout.write('\x1b]777;workers-ready\x07');
  });
  pi.registerCommand('workers-fixture', { description: 'Synthetic worker lifecycle', handler: async (mode) => {
    const now = Date.now(), old = state.asyncJobs.get('fixture');
    const startedAt = old?.startedAt ?? now;
    if (mode === 'clear') { state.asyncJobs.clear(); state.foregroundControls.clear(); }
    else if (mode === 'parallel') {
      state.asyncJobs.clear();
      const sessionId = ctx.sessionManager.getSessionId(), tokens = { input: 0, output: 0, total: 0 };
      state.asyncJobs.set('workflow', { asyncId: 'workflow', sessionId, mode: 'workflow', status: 'running', startedAt: now - 1000, updatedAt: now, totalTokens: tokens, agents: ['scout','scout'],
        steps: ['a','b'].map((key, index) => ({ agent: 'scout', index, label: 'task-' + index, workflowKey: key, runId: key, status: 'running', startedAt: now - 900 })) });
      for (const id of ['a','b']) state.asyncJobs.set(id, { asyncId: id, sessionId, mode: 'single', status: 'running', startedAt: now - 100, updatedAt: now, totalTokens: tokens, agents: ['scout'], parentWorkflowRunId: 'workflow', workflowKey: id,
        steps: [{ agent: 'scout', index: 0, model: 'neo-proxy/gpt-6-luna', thinking: 'medium', status: 'running', startedAt: now - 95, currentTool: 'read' }] });
      state.foregroundControls.set('fg', { runId: 'fg', sessionId, mode: 'single', currentAgent: 'reviewer', startedAt: now - 100 });
    } else {
      const status = mode === 'done' ? 'complete' : mode === 'fail' ? 'failed' : 'running';
      const activityState = mode === 'wait' ? 'needs_attention' : undefined;
      state.asyncJobs.set('fixture', { asyncId: 'fixture', asyncDir: '/tmp/fixture', sessionId: ctx.sessionManager.getSessionId(), mode: 'single', agents: ['scout'], status, startedAt, updatedAt: now,
        totalTokens: { input: 0, output: 0, total: 0 }, steps: [{ agent: 'scout', label: 'Map authentication', model: 'neo-proxy/gpt-6-luna', thinking: 'medium', index: 0, status, startedAt, endedAt: status !== 'running' ? now : undefined,
          activityState, currentTool: mode === 'tool' ? 'read' : undefined, lastActivityAt: now }] });
    }
    pi.events.emit('subagent:child-status', {});
  } });
  pi.on('session_shutdown', () => { bridge?.dispose(); ctx = undefined; });
};`);
  settings.extensions = [path.join(sourceDir, 'extensions/presentation.ts'), path.join(sourceDir, 'extensions/workers.ts'), probe];
  settings.packages = []; settings.skills = []; settings.theme = 'omp-dark';
  await writeFile(path.join(dir, 'settings.json'), JSON.stringify(settings));
  await writeFile(path.join(dir, 'mcp.json'), '{"mcpServers":{}}');
  pty = spawn(process.execPath, [path.join(sourceDir, 'host-entry.mjs'), '--offline', '--no-mcp', '--no-session', '--no-context-files', '--approve'], { cwd: repoDir, env, cols: 110, rows: 40 });
  pty.onData(chunk => {
    const value = String(chunk); raw += value;
    screen.write(value, () => {
      const view = screen.buffer.active;
      const lines = Array.from({ length: 40 }, (_, y) => view.getLine(view.viewportY + y)?.translateToString(true) ?? '');
      const y = lines.findIndex(line => line.includes('\uedea'));
      if (y >= 0) {
        const x = lines[y].indexOf('\uedea'), row = view.getLine(view.viewportY + y);
        samples.push({ line: lines[y], y, width: row.getCell(x).getWidth(), crow: row.getCell(x).getFgColor(), status: row.getCell(x + 2).getFgColor(), lines });
      }
    });
    if (value.includes('\x1b[c')) pty.write('\x1b[?62;c');
    if (value.includes('\x1b[6n')) pty.write('\x1b[1;1R');
    if (value.includes('\x1b[16t')) pty.write('\x1b[6;20;16t');
  });
  await pty.waitFor('workers-ready', { timeout: 15000 });
  await delay(200);
  pty.write('/workers-fixture tool');
  await delay(100);
  pty.write('\r');
  await pty.waitFor('Tool: read', { timeout: 10000 });
  await delay(1400);
  const tool = samples.filter(sample => sample.line.includes('Tool: read'));
  assert.ok(new Set(tool.map(sample => sample.crow)).size >= 2, 'real TUI paints crow colour animation');
  assert.ok(tool.every(sample => sample.width === 1), 'crow occupies one xterm cell');
  assert.ok(tool.every(sample => sample.status === 0xfab387), 'status matches dark composer tool colour');
  assert.ok(tool.some(sample => sample.line.includes('neo-proxy/gpt-6-luna · medium')), 'reported model and reasoning rendered in actual host');
  assert.ok(tool.every(sample => !sample.line.includes('last activity') && !sample.line.includes('quiet')), 'recent activity stays uncluttered');
  assert.ok(tool.some(sample => sample.lines.slice(sample.y + 1).some(line => line.startsWith('╭'))), 'worker row above composer');
  pty.write('/workers-fixture wait\r');
  await pty.waitFor('Needs attention', { timeout: 10000 });
  await delay(500);
  assert.equal(samples.at(-1).status, 0xf9e2af);
  pty.write('/workers-fixture fail\r');
  await pty.waitFor('failed', { timeout: 10000 });
  await delay(300);
  assert.equal(samples.at(-1).status, 0xf38ba8);
  pty.write('/workers-fixture done\r');
  await pty.waitFor('complete', { timeout: 10000 });
  await delay(400);
  const done = samples.at(-1);
  assert.ok(done.line.includes('✓'));
  await delay(5500);
  const view = screen.buffer.active;
  const final = Array.from({ length: 40 }, (_, y) => view.getLine(view.viewportY + y)?.translateToString(true) ?? '');
  assert.ok(!final.some(line => line.includes('\uedea')), 'completed row expires without clearing upstream snapshot');
  pty.write('/workers-fixture parallel\r');
  await pty.waitFor('Workers · 3 active', { timeout: 10000 });
  await delay(400);
  const parallel = Array.from({ length: 40 }, (_, y) => view.getLine(view.viewportY + y)?.translateToString(true) ?? '');
  assert.equal(parallel.filter(line => line.includes('\uedea')).length, 3, 'two materialized async workers plus foreground, no workflow or duplicate rows');
  pty.write('/workers-fixture clear\r');
  await delay(500);
  const cleared = Array.from({ length: 40 }, (_, y) => view.getLine(view.viewportY + y)?.translateToString(true) ?? '');
  assert.ok(!cleared.some(line => line.includes('\uedea')), 'empty snapshot unmounts widget');
  assert.ok(!raw.includes('unexpected-executor-poll'), 'no executor fallback invoked');
  await writeFile('/tmp/pi-workers-proof.ansi', raw);
  await writeFile('/tmp/pi-workers-proof.json', JSON.stringify({ samples: [tool[0], tool.at(-1), done], autoHidden: final, parallel, cleared }, null, 2));
  const exit = new Promise(resolve => pty.onExit(resolve));
  const kill = setTimeout(() => pty.kill(), 5000);
  pty.write('/quit\r');
  const result = await exit; clearTimeout(kill);
  assert.equal(result.exitCode, 0);
  console.log(JSON.stringify({ crowCellWidth: 1, pulseColours: new Set(tool.map(sample => sample.crow)).size, toolColour: 'fab387', waitingColour: 'f9e2af', errorColour: 'f38ba8', completedAutoHide: true, mixedParallelRows: 3, exitCode: result.exitCode, evidence: '/tmp/pi-workers-proof.json' }));
} finally {
  await writeFile('/tmp/pi-workers-proof-debug.ansi', raw);
  const view = screen.buffer.active;
  await writeFile('/tmp/pi-workers-rpc-proof.jsonl', await readFile(path.join(dir, 'rpc.log'), 'utf8').catch(() => 'no RPC log'));
  if (pty?.exitCode !== 0) console.error(Array.from({length:40}, (_, y) => view.getLine(view.viewportY+y)?.translateToString(true) ?? '').join('\n'));
  if (pty?.exitCode === null) pty.kill();
  screen.dispose();
  await rm(dir, { recursive: true, force: true, maxRetries: 3 });
}
