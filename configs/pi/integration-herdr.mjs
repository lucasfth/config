import assert from 'node:assert/strict';
import net from 'node:net';
import { spawn as spawnProcess } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { spawn } from 'zigpty';
import { prepareRuntime, repoDir, sourceDir } from './runtime.mjs';

// Real Herdr installer + real interactive Pi; only the Herdr socket is a fixture.
const dir = await mkdtemp(path.join(os.tmpdir(), 'pi-herdr-proof-'));
const socketPath = path.join(dir, 'herdr.sock');
const reports = [];
const server = net.createServer(socket => {
  let buffer = '';
  socket.on('data', data => {
    buffer += data;
    for (;;) {
      const end = buffer.indexOf('\n');
      if (end < 0) break;
      const request = JSON.parse(buffer.slice(0, end));
      buffer = buffer.slice(end + 1);
      reports.push(request);
      socket.write(JSON.stringify({ id: request.id, result: {} }) + '\n');
    }
  });
});
await new Promise(resolve => server.listen(socketPath, resolve));
let pty;
const waitFor = async predicate => {
  for (let i = 0; i < 150; i++) {
    if (predicate()) return;
    await delay(100);
  }
  assert.fail(`Herdr reports did not reach expected state: ${JSON.stringify(reports)}`);
};
try {
  const env = { ...process.env, PI_CODING_AGENT_DIR: dir, NEO_PROXY_URL: 'http://127.0.0.1:9/v1',
    NEO_PROXY_API_KEY: 'synthetic', HERDR_ENV: '1', HERDR_SOCKET_PATH: socketPath, HERDR_PANE_ID: 'w1:p1',
    PI_OFFLINE: '1', PI_TELEMETRY: '0', TERM: 'xterm-256color' };
  await prepareRuntime({ agentDir: dir, env, ompDir: path.join(dir, 'absent') });
  const hook = await readFile(path.join(dir, 'extensions/herdr-agent-state.ts'), 'utf8');
  assert.match(hook, /HERDR_INTEGRATION_ID=pi/);
  // Reproduce an existing session: install the hook only after Pi has started.
  await rm(path.join(dir, 'extensions/herdr-agent-state.ts'));
  const probe = path.join(dir, 'probe.ts');
  await writeFile(probe, `export default pi => {
    pi.on('session_start', async () => {
      const { writeFile } = await import('node:fs/promises');
      await writeFile(${JSON.stringify(path.join(dir, 'started'))}, 'ready');
    });
    pi.registerCommand('herdr-exit-probe', { handler: async (_, ctx) => ctx.shutdown() });
    pi.registerCommand('herdr-probe', { handler: async (_, ctx) => {
      pi.events.emit('herdr:blocked', { active: true, label: 'Fixture approval' });
      await new Promise(resolve => setTimeout(resolve, 300));
      pi.events.emit('herdr:blocked', { active: false });
    }});
    pi.registerCommand('herdr-title-probe', { handler: async () => {
      pi.setSessionName('Sidebar identity probe');
      const { writeFile } = await import('node:fs/promises');
      await writeFile(${JSON.stringify(path.join(dir, 'renamed'))}, 'ready');
    }});
  };`);
  const settings = JSON.parse(await readFile(path.join(dir, 'settings.json'), 'utf8'));
  Object.assign(settings, { extensions: [probe], skills: [], packages: [], retry: { enabled: false } });
  await writeFile(path.join(dir, 'settings.json'), JSON.stringify(settings));
  await writeFile(path.join(dir, 'mcp.json'), '{"mcpServers":{}}');
  pty = spawn(process.execPath, [path.join(sourceDir, 'host-entry.mjs'), '--offline', '--no-mcp',
    '--no-context-files', '--approve'], { cwd: repoDir, env, cols: 100, rows: 30 });
  pty.onData(data => {
    const text = String(data);
    if (text.includes('\x1b[c')) pty.write('\x1b[?62;c');
    if (text.includes('\x1b[6n')) pty.write('\x1b[1;1R');
    if (text.includes('\x1b[16t')) pty.write('\x1b[6;20;16t');
  });
  const states = () => reports.filter(report => report.method === 'pane.report_agent').map(report => report.params.state);
  for (let i = 0; i < 150; i++) {
    if (await readFile(path.join(dir, 'started'), 'utf8').catch(() => '') === 'ready') break;
    await delay(100);
  }
  assert.equal(await readFile(path.join(dir, 'started'), 'utf8'), 'ready');
  assert.equal(reports.length, 0);
  await writeFile(path.join(dir, 'extensions/herdr-agent-state.ts'), hook);
  settings.extensions.push(path.join(sourceDir, 'extensions/herdr-presentation.ts'));
  await writeFile(path.join(dir, 'settings.json'), JSON.stringify(settings));
  pty.write('/reload\r');
  await waitFor(() => states().includes('idle'));
  pty.write('/herdr-probe\r');
  await waitFor(() => states().includes('blocked') && states().at(-1) === 'idle');
  // An unavailable loopback provider exercises real start/error settlement without a model service.
  pty.write('Herdr lifecycle probe\r');
  await waitFor(() => states().includes('working') && states().at(-1) === 'idle');
  await waitFor(() => reports.some(report => report.method === 'pane.report_metadata'
    && report.params.display_agent === 'huginn' && report.params.tokens.agent_profile === 'huginn'));
  pty.write('/herdr-title-probe\r');
  for (let i = 0; i < 150; i++) {
    if (await readFile(path.join(dir, 'renamed'), 'utf8').catch(() => '') === 'ready') break;
    await delay(100);
  }
  assert.equal(await readFile(path.join(dir, 'renamed'), 'utf8'), 'ready');
  pty.write('Herdr renamed title probe\r');
  await waitFor(() => reports.some(report => report.method === 'pane.report_metadata'
    && report.params.title === 'Sidebar identity probe'));
  assert.ok(reports.some(report => report.method === 'pane.report_agent_session' && path.isAbsolute(report.params.agent_session_path)));
  assert.ok(reports.every(report => report.params.agent === 'pi' && report.params.pane_id === 'w1:p1'));
  const exit = new Promise(resolve => pty.onExit(resolve));
  const timer = setTimeout(() => pty.kill(), 5000);
  pty.write('/quit\r');
  const result = await exit;
  clearTimeout(timer);
  assert.equal(result.exitCode, 0);
  assert.ok(reports.some(report => report.method === 'pane.report_metadata'
    && report.params.clear_display_agent && report.params.tokens.agent_profile === null));
  console.log(JSON.stringify({ states: states(), sessionRef: true, realHerdrHook: true,
    huginnIdentity: true, renamedTitle: true, cleanup: true, exitCode: result.exitCode }));
  // Real headless CLI lifecycle with redirected stdout and an unavailable fixture provider.
  for (const mode of ['print', 'json']) {
    const before = reports.length;
    const child = spawnProcess(process.execPath, [path.join(sourceDir, 'host-entry.mjs'),
      '--offline', '--no-mcp', '--no-context-files', '--approve',
      ...(mode === 'print' ? ['-p'] : ['--mode', 'json']), 'Herdr headless lifecycle probe'], {
      cwd: repoDir, env, stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', data => { stderr += data; });
    const timer = setTimeout(() => child.kill(), 15_000);
    const code = await new Promise((resolve, reject) => {
      child.on('error', reject);
      child.on('exit', resolve);
    }).finally(() => clearTimeout(timer));
    assert.equal(code, mode === 'print' ? 1 : 0, stderr); // Print propagates the synthetic provider failure.
    const metadata = reports.slice(before).filter(report => report.method === 'pane.report_metadata');
    assert.ok(metadata.some(report => report.params.display_agent === 'huginn'), `${mode} identity missing`);
    assert.ok(metadata.every(report => report.params.applies_to_source === 'herdr:pi'));
    assert.ok(metadata.some(report => report.params.clear_display_agent), `${mode} cleanup missing`);
    const lifecycle = reports.slice(before).filter(report => report.method === 'pane.report_agent');
    assert.deepEqual(lifecycle.map(report => report.params.state), ['idle', 'working', 'idle']);
    assert.ok(lifecycle.every(report => path.isAbsolute(report.params.agent_session_path)));
    assert.equal(reports.at(-1).method, 'pane.release_agent');
    console.log(JSON.stringify({ mode, huginnIdentity: true, states: lifecycle.map(r => r.params.state),
      sessionRef: true, redirectedStdout: true, cleanup: true }));
  }
} finally {
  if (pty?.exitCode === null) pty.kill();
  await new Promise(resolve => server.close(resolve));
  await rm(dir, { recursive: true, force: true });
}
