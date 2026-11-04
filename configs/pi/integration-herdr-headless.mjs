import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { prepareRuntime, sourceDir } from './runtime.mjs';

// Separate Herdr server, config/state roots, Pi profile and pane. No live socket or session.
const dir = await mkdtemp(path.join(os.tmpdir(), 'hugi-kill-'));
const socket = path.join(dir, 'api.sock');
const agentDir = path.join(dir, 'agent');
const config = path.join(dir, 'config.toml');
const env = { ...process.env, HERDR_SOCKET_PATH: socket, HERDR_CONFIG_PATH: config,
  XDG_CONFIG_HOME: path.join(dir, 'config'), XDG_STATE_HOME: path.join(dir, 'state'),
  PI_CODING_AGENT_DIR: agentDir, NEO_PROXY_URL: 'http://127.0.0.1:9/v1', NEO_PROXY_API_KEY: 'synthetic',
  MUNINN_MCP_TOKEN: 'synthetic', PI_OFFLINE: '1', PI_TELEMETRY: '0' };
for (const key of ['HERDR_SESSION', 'HERDR_ENV', 'HERDR_PANE_ID', 'HERDR_CLIENT_SOCKET_PATH']) delete env[key];
await writeFile(config, 'default_shell = "/bin/sh"\n[onboarding]\ncompleted = true\n');
const api = (method, params = {}) => new Promise((resolve, reject) => {
  const connection = net.createConnection(socket);
  const timer = setTimeout(() => { connection.destroy(); reject(new Error(`${method} timed out`)); }, 3000);
  let data = '';
  connection.on('error', error => { clearTimeout(timer); reject(error); });
  connection.on('connect', () => connection.write(JSON.stringify({ id: method, method, params }) + '\n'));
  connection.on('data', chunk => {
    data += chunk;
    if (!data.includes('\n')) return;
    clearTimeout(timer);
    connection.destroy();
    try {
      const reply = JSON.parse(data.split('\n')[0]);
      assert.ok(!reply.error, JSON.stringify(reply.error));
      resolve(reply.result);
    } catch (error) { reject(error); }
  });
});
const until = async (probe, label) => {
  for (let i = 0; i < 100; i++) {
    const result = await probe();
    if (result) return result;
    await delay(200);
  }
  throw new Error(`${label} timed out`);
};
let server;
let serverExit;
try {
  await prepareRuntime({ agentDir, env });
  const hold = path.join(dir, 'hold.ts');
  await writeFile(hold, `export default pi => {
    pi.on('before_provider_request', async () => {
      const { writeFile } = await import('node:fs/promises');
      // PTY events drive Herdr process discovery; test lifecycle after discovery.
      // This deliberately does not qualify a completely silent redirected process.
      const discovery = setInterval(() => { void writeFile('/dev/tty', '\\n'); }, 250);
      await writeFile(${JSON.stringify(path.join(dir, 'pid'))}, String(process.pid));
      await writeFile(${JSON.stringify(path.join(dir, 'env.json'))}, JSON.stringify({
        socket: process.env.HERDR_SOCKET_PATH, pane: process.env.HERDR_PANE_ID,
        enabled: process.env.HERDR_ENV, child: process.env.PI_SUBAGENT_CHILD
      }));
      try { await new Promise(resolve => setTimeout(resolve, 120000)); }
      finally { clearInterval(discovery); }
    });
  };`);
  const settings = JSON.parse(await readFile(path.join(agentDir, 'settings.json'), 'utf8'));
  Object.assign(settings, { extensions: [path.join(sourceDir, 'extensions/herdr-presentation.ts'), hold],
    skills: [], packages: [], retry: { enabled: false } });
  await writeFile(path.join(agentDir, 'settings.json'), JSON.stringify(settings));
  await writeFile(path.join(agentDir, 'mcp.json'), '{"mcpServers":{}}');
  const trace = path.join(dir, 'trace.mjs');
  await writeFile(trace, `import net from 'node:net';
    import { appendFileSync } from 'node:fs';
    const original = net.createConnection;
    net.createConnection = function (...args) {
      const connection = original.apply(this, args);
      const write = connection.write;
      connection.write = function (data, ...rest) {
        appendFileSync(${JSON.stringify(path.join(dir, 'wire.jsonl'))}, JSON.stringify({ send: String(data) }) + '\\n');
        return write.call(this, data, ...rest);
      };
      connection.on('data', data => appendFileSync(${JSON.stringify(path.join(dir, 'wire.jsonl'))}, JSON.stringify({ reply: String(data) }) + '\\n'));
      return connection;
    };`);
  env.NODE_OPTIONS = `--import=${trace}`;
  server = spawn('herdr', ['server'], { cwd: dir, env, stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  server.stderr.on('data', data => { stderr += data; });
  serverExit = new Promise(resolve => server.on('exit', resolve));
  await until(async () => {
    if (server.exitCode !== null) throw new Error(`fixture server exited: ${stderr}`);
    return api('ping').catch(() => false);
  }, 'isolated server readiness');
  const created = await api('workspace.create', { cwd: dir, label: 'headless-kill-fixture', focus: false });
  const pane = created.root_pane.pane_id;
  // Exercise the managed launch shape, using only explicit fixture extensions.
  const args = [process.execPath, path.join(sourceDir, 'launch.mjs'), '--offline', '--no-mcp',
    '--no-context-files', '--approve', '--no-extensions',
    '-e', path.join(sourceDir, 'extensions/herdr-presentation.ts'), '-e', hold, '-p', 'fixture'];
  const quoted = args.map(arg => `'${arg.replaceAll("'", "'\\''")}'`).join(' ');
  await api('pane.send_text', { pane_id: pane, text: `${quoted} > ${dir}/stdout.log 2> ${dir}/stderr.log\n` });
  const pid = Number(await until(() => readFile(path.join(dir, 'pid'), 'utf8').catch(() => false), 'fixture Pi start'));
  const status = async () => {
    const reply = await api('pane.get', { pane_id: pane });
    assert.equal(reply.pane?.pane_id, pane, 'fixture pane must survive');
    assert.equal(typeof reply.pane.agent_status, 'string');
    return reply.pane;
  };
  const before = await until(async () => {
    const reply = await status();
    return reply.agent_status === 'working' ? reply : false;
  }, 'working state');
  assert.equal(before.agent_status, 'working');
  assert.ok(Number.isSafeInteger(pid) && pid > 1);
  process.kill(pid, 'SIGKILL'); // Only the PID written by this isolated fixture.
  const after = await until(async () => {
    const reply = await status();
    return reply.agent_status === 'idle' ? reply : false;
  }, 'idle state after SIGKILL');
  assert.equal(after.agent_status, 'idle');
  assert.equal(after.pane_id, pane);
  console.log(JSON.stringify({ isolatedHerdr: true, pane, killedFixturePid: pid,
    before: before.agent_status, after: after.agent_status }));
} catch (error) {
  console.error(await readFile(path.join(dir, 'env.json'), 'utf8').catch(() => 'no fixture env'));
  console.error(JSON.stringify(await api('agent.list').catch(() => ({}))));
  console.error(JSON.stringify(await api('agent.explain', { target: 'w1:p1' }).catch(() => ({}))));
  console.error(JSON.stringify(await api('pane.process_info', { pane_id: 'w1:p1' }).catch(() => ({}))));
  console.error(await readFile(path.join(dir, 'stderr.log'), 'utf8').catch(() => ''));
  console.error(await readFile(path.join(dir, 'wire.jsonl'), 'utf8').catch(() => 'no socket requests'));
  throw error;
} finally {
  if (server && server.exitCode === null) {
    await api('server.stop').catch(() => server.kill('SIGTERM'));
    await serverExit;
  }
  await rm(dir, { recursive: true, force: true });
}
