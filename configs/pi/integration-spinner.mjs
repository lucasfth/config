import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { spawn } from 'zigpty';
import headless from '@xterm/headless';
import { sourceDir, repoDir, prepareRuntime } from './runtime.mjs';

const dir = await mkdtemp(path.join(os.tmpdir(), 'pi-spinner-proof-'));
const terminal = new headless.Terminal({ cols: 115, rows: 30, allowProposedApi: true });
let pty;
let raw = '';
let calls = 0;
const frames = new Set();
const activeBorders = [];
const readScreen = () => {
  const view = terminal.buffer.active;
  return Array.from({ length: 30 }, (_, y) => view.getLine(view.viewportY + y)?.translateToString(true) ?? '');
};
const server = http.createServer(async (req, res) => {
  let body = '';
  for await (const part of req) body += part;
  const request = JSON.parse(body);
  calls++;
  // Keep a real host turn active long enough to observe multiple native frames.
  await delay(800);
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  for (const [delta, finish_reason] of [
    [{ role: 'assistant', content: 'Spinner fixture finished.' }, null],
    [{}, 'stop'],
  ]) {
    res.write(`data: ${JSON.stringify({ id: 'spinner-proof', object: 'chat.completion.chunk', created: 1,
      model: request.model, choices: [{ index: 0, delta, finish_reason }] })}\n\n`);
  }
  res.end('data: [DONE]\n\n');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
try {
  const env = Object.fromEntries(['PATH', 'HOME', 'USER', 'SHELL', 'TMPDIR', 'LANG']
    .filter(key => process.env[key]).map(key => [key, process.env[key]]));
  Object.assign(env, { PI_CODING_AGENT_DIR: dir, NEO_PROXY_URL: `http://127.0.0.1:${server.address().port}/v1`,
    NEO_PROXY_API_KEY: 'synthetic', PI_OFFLINE: '1', PI_TELEMETRY: '0', TERM: 'xterm-256color', COLORTERM: 'truecolor' });
  await prepareRuntime({ agentDir: dir, env, ompDir: path.join(dir, 'absent') });
  const settings = JSON.parse(await readFile(path.join(dir, 'settings.json'), 'utf8'));
  settings.extensions = settings.extensions.filter(file => !file.endsWith('advisor.ts') && !file.endsWith('muninn.ts'));
  settings.skills = [];
  settings.packages = [];
  await writeFile(path.join(dir, 'settings.json'), JSON.stringify(settings));
  await writeFile(path.join(dir, 'mcp.json'), '{"mcpServers":{}}');
  pty = spawn(process.execPath, [path.join(sourceDir, 'host-entry.mjs'), '--offline', '--no-mcp',
    '--no-session', '--no-context-files', '--approve'], { cwd: repoDir, env, cols: 115, rows: 30 });
  pty.onData(data => {
    const text = String(data);
    raw += text;
    terminal.write(text, () => {
      const border = readScreen().find(line => /^╭\s+[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/u.test(line));
      if (border) { frames.add(border.match(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/u)[0]); activeBorders.push(border); }
    });
    if (text.includes('\x1b[c')) pty.write('\x1b[?62;c');
    if (text.includes('\x1b[6n')) pty.write('\x1b[1;1R');
    if (text.includes('\x1b[16t')) pty.write('\x1b[6;20;16t');
  });
  await pty.waitFor('Huginn · Pi', { timeout: 15_000 });
  pty.write('Check the compact activity indicator\r');
  await pty.waitFor('Spinner fixture finished.', { timeout: 15_000 });
  await delay(200);
  assert.equal(calls, 1);
  assert.ok(frames.size >= 2, 'At least two native Braille frames reach the left-hand composer slot');
  assert.ok(activeBorders.every(line => !line.includes('◉') && !line.includes('working')),
    'Active composer has neither duplicate idle icon nor trailing working label');
  const idleBorder = readScreen().find(line => /^╭\s+◉/u.test(line));
  assert.ok(idleBorder, 'Idle icon returns after the real host turn settles');
  const artifact = '/tmp/pi-spinner-proof';
  await writeFile(`${artifact}.ansi`, raw);
  await writeFile(`${artifact}.txt`, [...new Set(activeBorders), '', 'Settled:', idleBorder].join('\n'));
  const exit = new Promise(resolve => pty.onExit(resolve));
  const timer = setTimeout(() => pty.kill(), 5_000);
  pty.write('/quit\r');
  const result = await exit;
  clearTimeout(timer);
  assert.equal(result.exitCode, 0);
  console.log(JSON.stringify({ calls, observedFrames: [...frames], idleBorder, exitCode: result.exitCode,
    ansi: `${artifact}.ansi`, borders: `${artifact}.txt` }, null, 2));
} finally {
  if (pty?.exitCode === null) pty.kill();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  terminal.dispose();
  await rm(dir, { recursive: true, force: true, maxRetries: 3 });
}
