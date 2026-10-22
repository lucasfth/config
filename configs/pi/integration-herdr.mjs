import assert from 'node:assert/strict';
import net from 'node:net';
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
    pi.registerCommand('herdr-probe', { handler: async (_, ctx) => {
      pi.events.emit('herdr:blocked', { active: true, label: 'Fixture approval' });
      await new Promise(resolve => setTimeout(resolve, 300));
      pi.events.emit('herdr:blocked', { active: false });
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
  pty.write('/reload\r');
  await waitFor(() => states().includes('idle'));
  pty.write('/herdr-probe\r');
  await waitFor(() => states().includes('blocked') && states().at(-1) === 'idle');
  // An unavailable loopback provider exercises real start/error settlement without a model service.
  pty.write('Herdr lifecycle probe\r');
  await waitFor(() => states().includes('working') && states().at(-1) === 'idle');
  assert.ok(reports.some(report => report.method === 'pane.report_agent_session' && path.isAbsolute(report.params.agent_session_path)));
  assert.ok(reports.every(report => report.params.agent === 'pi' && report.params.pane_id === 'w1:p1'));
  const exit = new Promise(resolve => pty.onExit(resolve));
  const timer = setTimeout(() => pty.kill(), 5000);
  pty.write('/quit\r');
  const result = await exit;
  clearTimeout(timer);
  assert.equal(result.exitCode, 0);
  console.log(JSON.stringify({ states: states(), sessionRef: true, realHerdrHook: true, exitCode: result.exitCode }));
} finally {
  if (pty?.exitCode === null) pty.kill();
  await new Promise(resolve => server.close(resolve));
  await rm(dir, { recursive: true, force: true });
}
