import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { spawn } from 'zigpty';
import { stripTerminalSequences } from '@earendil-works/pi-tui';
import { prepareRuntime, repoDir, sourceDir } from './runtime.mjs';

const dir = await mkdtemp(path.join(os.tmpdir(), 'pi-user-shell-proof-'));
let pty;
let raw = '';
let modelCalls = 0;
const server = http.createServer((_req, res) => { modelCalls++; res.writeHead(503); res.end(); });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
try {
  // Use the actual user's .zshrc, not a fixture, but isolated Pi state and no live provider.
  const env = Object.fromEntries(['PATH', 'HOME', 'USER', 'SHELL', 'TMPDIR', 'LANG', 'ZDOTDIR']
    .filter(key => process.env[key]).map(key => [key, process.env[key]]));
  Object.assign(env, { PI_CODING_AGENT_DIR: dir, NEO_PROXY_API_KEY: 'synthetic', PI_OFFLINE: '1',
    PI_TELEMETRY: '0', TERM: 'xterm-256color' });
  const { settings } = await prepareRuntime({ agentDir: dir,
    env: { ...env, NEO_PROXY_URL: `http://127.0.0.1:${server.address().port}/v1` }, ompDir: path.join(dir, 'absent') });
  const extensions = settings.extensions.filter(file => /\/(user-shell|presentation)\.ts$/.test(file));
  assert.ok(extensions.some(file => file.endsWith('/user-shell.ts')));
  await writeFile(path.join(dir, 'settings.json'), JSON.stringify({ ...settings, packages: [], skills: [], extensions }));
  await writeFile(path.join(dir, 'mcp.json'), '{"mcpServers":{}}');
  pty = spawn(process.execPath, [path.join(sourceDir, 'host-entry.mjs'), '--offline', '--no-mcp',
    '--no-session', '--no-context-files', '--approve'], { cwd: repoDir, env, cols: 115, rows: 35 });
  pty.onData(data => {
    const text = String(data); raw += text;
    if (text.includes('\x1b[c')) pty.write('\x1b[?62;c');
    if (text.includes('\x1b[6n')) pty.write('\x1b[1;1R');
    if (text.includes('\x1b[16t')) pty.write('\x1b[6;20;16t');
  });
  await pty.waitFor('Huginn · Pi', { timeout: 15000 });
  let sequence = 0;
  async function run(command, expected) {
    const marker = `PI_SHELL_${++sequence}_DONE`;
    const offset = raw.length;
    pty.write(command + `; printf '\\nPI_SHELL_%s_DONE\\n' ${sequence}\r`);
    const deadline = Date.now() + 10000;
    while (!stripTerminalSequences(raw.slice(offset)).includes(marker)) {
      if (Date.now() > deadline) throw new Error(`User command failed: ${command}: ${raw.slice(offset)}`);
      await delay(40);
    }
    const output = stripTerminalSequences(raw.slice(offset));
    assert.ok(output.includes(expected), output);
    if (command === '!echo ok') assert.match(output, /(?:^|[\r\n])\s*(?:│\s*)?ok\s*(?:│)?(?:[\r\n]|$)/);
    assert.ok(!output.includes('command not found'));
  }
  await run('!echo ok', 'ok');
  await run('!gst', 'On branch main');
  await run('!!gst', 'On branch main');
  await run('!printf "ZSH=%s INTERACTIVE=%s" "$ZSH_VERSION" "$options[interactive]"', 'INTERACTIVE=on');
  const exit = new Promise(resolve => pty.onExit(resolve));
  const timer = setTimeout(() => pty.kill(), 5000);
  pty.write('/quit\r');
  const result = await exit;
  clearTimeout(timer);
  assert.equal(result.exitCode, 0);
  assert.equal(modelCalls, 0);
  await writeFile('/tmp/pi-user-shell-proof.ansi', raw);
  console.log(JSON.stringify({ commands: ['!echo ok', '!gst', '!!gst'], realZshrc: true,
    interactiveZsh: true, modelCalls, exitCode: result.exitCode, evidence: '/tmp/pi-user-shell-proof.ansi' }));
} finally {
  if (pty?.exitCode === null) pty.kill();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  await rm(dir, { recursive: true, force: true });
}
