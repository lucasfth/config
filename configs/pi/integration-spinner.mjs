import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { spawn } from 'zigpty';
import headless from '@xterm/headless';
import { Resvg } from '@resvg/resvg-js';
import { tsImport } from 'tsx/esm/api';
import { colorToHex, mixColors } from '@earendil-works/pi-tui';
import { sourceDir, repoDir, prepareRuntime } from './runtime.mjs';
const { composerColors } = await tsImport('./extensions/presentation.ts', import.meta.url);

const appearance = process.env.PI_SPINNER_APPEARANCE ?? 'dark';
assert.ok(['light', 'dark'].includes(appearance));
const dir = await mkdtemp(path.join(os.tmpdir(), 'pi-spinner-proof-'));
const terminal = new headless.Terminal({ cols: 115, rows: 30, allowProposedApi: true });
let pty;
let raw = '';
let calls = 0;
const frames = new Set();
const samples = [];
const snapshots = new Map();
const readScreen = () => {
  const view = terminal.buffer.active;
  return Array.from({ length: 30 }, (_, y) => view.getLine(view.viewportY + y)?.translateToString(true) ?? '');
};
const rgb = (row, column) => {
  const cell = row?.getCell(column);
  return cell?.isFgRGB() ? cell.getFgColor() : null;
};
const number = color => Number.parseInt(colorToHex(color).slice(1), 16);
const server = http.createServer(async (req, res) => {
  let body = '';
  for await (const part of req) body += part;
  const request = JSON.parse(body);
  calls++;
  await delay(800);
  const tool = !request.messages.some(message => message.role === 'tool');
  const delta = tool
    ? { role: 'assistant', tool_calls: [{ index: 0, id: 'spinner-tool', type: 'function',
      function: { name: 'bash', arguments: JSON.stringify({ command: 'sleep 0.5; printf activity-tool-ok' }) } }] }
    : { role: 'assistant', content: 'Spinner fixture finished.' };
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  for (const [data, finish_reason] of [[delta, null], [{}, tool ? 'tool_calls' : 'stop']]) {
    res.write(`data: ${JSON.stringify({ id: 'spinner-proof', object: 'chat.completion.chunk', created: 1,
      model: request.model, choices: [{ index: 0, delta: data, finish_reason }] })}\n\n`);
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
  const probe = path.join(dir, 'session-probe.ts');
  await writeFile(probe, `import { writeFileSync } from 'node:fs';
export default pi => {
  pi.on('session_start', (_, ctx) => writeFileSync(${JSON.stringify(path.join(dir, 'session-id'))}, ctx.sessionManager.getSessionId()));
};`);
  settings.extensions.push(probe);
  settings.skills = [];
  settings.packages = [];
  settings.theme = `omp-${appearance}`;
  await writeFile(path.join(dir, 'settings.json'), JSON.stringify(settings));
  await writeFile(path.join(dir, 'mcp.json'), '{"mcpServers":{}}');
  pty = spawn(process.execPath, [path.join(sourceDir, 'host-entry.mjs'), '--offline', '--no-mcp',
    '--no-session', '--no-context-files', '--approve'], { cwd: repoDir, env, cols: 115, rows: 30 });
  pty.onData(data => {
    const text = String(data);
    raw += text;
    terminal.write(text, () => {
      const screen = readScreen();
      const topY = screen.findIndex(line => /^╭\s+[◉⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/u.test(line));
      const bottomY = screen.findIndex((line, y) => y > topY && /^╰/u.test(line));
      if (topY >= 0 && bottomY >= 0) {
        const border = screen[topY];
        const frame = border.match(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/u)?.[0];
        if (frame) frames.add(frame);
        const view = terminal.buffer.active;
        const top = view.getLine(view.viewportY + topY);
        const bottom = view.getLine(view.viewportY + bottomY);
        const icon = border.search(/[◉⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/u);
        const colors = { border: rgb(top, 0), spinner: rgb(top, icon), label: rgb(top, icon + 2),
          topRight: rgb(top, 114), bottomRight: rgb(bottom, 114) };
        // PTY chunks may split a repaint; compare only fully written composer corners.
        if (top?.getCell(114)?.getChars() !== '╮' || bottom?.getCell(114)?.getChars() !== '╯') return;
        samples.push({ colors, border, active: Boolean(frame) });
        if (!snapshots.has(colors.bottomRight)) {
          snapshots.set(colors.bottomRight, { screen, topY, bottomY,
            cells: Array.from({ length: 30 }, (_, y) => Array.from({ length: 115 }, (_, x) => {
              const cell = view.getLine(view.viewportY + y)?.getCell(x);
              return { text: cell?.getChars() ?? '', color: rgb(view.getLine(view.viewportY + y), x) };
            })) });
        }
      }
    });
    if (text.includes('\x1b[c')) pty.write('\x1b[?62;c');
    if (text.includes('\x1b[6n')) pty.write('\x1b[1;1R');
    if (text.includes('\x1b[16t')) pty.write('\x1b[6;20;16t');
  });
  await pty.waitFor('Huginn · Pi', { timeout: 15_000 });
  const sessionId = await readFile(path.join(dir, 'session-id'), 'utf8');
  await delay(150);
  const startup = readScreen();
  const wordmarkY = startup.findIndex(line => line.includes('█ █ █ █ █▀▀'));
  assert.ok(wordmarkY >= 5, 'raven and wordmark render together at actual host startup');
  assert.equal(startup[wordmarkY].indexOf('█ █ █ █ █▀▀'), 33);
  for (const [i, row] of ['█ █ █ █ █▀▀ ▀█▀ █▀█ █▀█', '█▀█ █ █ █ ▄  █  █ █ █ █', '█ █ ▀▀▀ ▀▀▀ ▄█▄ █ █ █ █'].entries()) {
    assert.equal(startup[wordmarkY + i].slice(33), row);
  }
  const artY = wordmarkY - 5;
  assert.equal(startup[artY + 1], '                    ⣀⣤⣶⣤⣄⣀');
  assert.equal(startup[artY + 12], '  ⠁⠔⠁');
  assert.equal(startup[artY + 14], ' '.repeat(33) + 'Huginn · Pi   /model · /switch');
  assert.ok(startup.some(line => /^╭\s+◉/u.test(line)), 'composer remains visible below the 15-row header in a 30-row terminal');
  const identity = number(composerColors(sessionId, appearance, 'idle').base);
  const view = terminal.buffer.active;
  for (let y = artY; y < artY + 14; y++) {
    for (let x = 0; x < startup[y].length; x++) {
      if (startup[y][x] !== ' ') assert.equal(rgb(view.getLine(view.viewportY + y), x), identity);
    }
  }
  const startupRows = startup.slice(artY, artY + 15);
  const startupSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="480"><rect width="100%" height="100%" fill="${appearance === 'dark' ? '#1e1e2e' : '#eff1f5'}"/><g font-family="JetBrainsMono Nerd Font Mono,Menlo,monospace" font-size="18" xml:space="preserve">${startupRows.map((line, i) => `<text x="20" y="${32 + i * 28}" fill="#${(i < 14 ? identity : appearance === 'dark' ? 0x7f849c : 0x6c6f85).toString(16).padStart(6, '0')}">${line}</text>`).join('')}</g></svg>`;
  await writeFile(`/tmp/pi-header-${appearance}-proof.png`, new Resvg(startupSvg).render().asPng());
  await writeFile(`/tmp/pi-header-${appearance}-proof.txt`, startupRows.join('\n'));
  pty.write('Check the compact activity indicator\r');
  await pty.waitFor('Spinner fixture finished.', { timeout: 15_000 });
  await delay(250);
  assert.equal(calls, 2);
  const expected = Object.fromEntries(['idle', 'model', 'tool'].map(state => {
    const { base, target } = composerColors(sessionId, appearance, state);
    return [state, { base: number(base), target: number(target), midpoint: number(mixColors(base, target, 0.5, 'srgb')) }];
  }));
  assert.ok(frames.size >= 2, 'Native Braille spinner animates');
  for (const state of ['model', 'tool']) {
    const stateSamples = samples.filter(sample => sample.colors.bottomRight === expected[state].target);
    assert.ok(stateSamples.length, `${appearance}: real host reaches ${state} endpoint`);
    for (const { colors, border } of stateSamples) {
      assert.deepEqual(colors, { border: expected[state].base, spinner: expected[state].base,
        label: expected[state].base, topRight: expected[state].midpoint, bottomRight: expected[state].target });
      assert.ok(!border.includes('◉') && !border.includes('working'), 'No duplicate idle icon or working suffix');
    }
  }
  const settled = samples.at(-1);
  assert.match(settled.border, /^╭\s+◉/u);
  assert.ok(Object.values(settled.colors).every(color => color === expected.idle.base), 'Settled border is uniform session colour');
  const artifact = `/tmp/pi-spinner-${appearance}-proof`;
  await writeFile(`${artifact}.ansi`, raw);
  await writeFile(`${artifact}.txt`, JSON.stringify({ sessionId, expected, samples }, null, 2));
  const escape = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const previews = ['idle', 'model', 'tool'].map(state => {
    const snapshot = snapshots.get(expected[state].target);
    assert.ok(snapshot);
    return `<text x="10" y="20" fill="${appearance === 'dark' ? '#cdd6f4' : '#4c4f69'}">${state}</text>` +
      snapshot.cells.slice(snapshot.topY, snapshot.bottomY + 1).flatMap((row, y) => row.map((cell, x) => cell.text
        ? `<text x="${10 + x * 10}" y="${45 + y * 21}" fill="#${(cell.color ?? expected.idle.base).toString(16).padStart(6, '0')}">${escape(cell.text)}</text>` : '')).join('');
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1170" height="330"><rect width="100%" height="100%" fill="${appearance === 'dark' ? '#1e1e2e' : '#eff1f5'}"/><g font-family="Menlo,monospace" font-size="14">${previews.map((preview, i) => `<g transform="translate(0 ${i * 110})">${preview}</g>`).join('')}</g></svg>`;
  await writeFile(`${artifact}.png`, new Resvg(svg).render().asPng());
  const exit = new Promise(resolve => pty.onExit(resolve));
  const timer = setTimeout(() => pty.kill(), 5_000);
  pty.write('/quit\r');
  const result = await exit;
  clearTimeout(timer);
  assert.equal(result.exitCode, 0);
  console.log(JSON.stringify({ appearance, sessionId, calls, observedFrames: [...frames], expected, exitCode: result.exitCode,
    ansi: `${artifact}.ansi`, image: `${artifact}.png` }, null, 2));
} finally {
  if (pty?.exitCode === null) pty.kill();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  terminal.dispose();
  await rm(dir, { recursive: true, force: true, maxRetries: 3 });
}
