import { waitForSessionReady } from './pty-ready.mjs';
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
let frameBuffer = '';
let submittedAt;
const inputMarker = '\x1b]777;pi-input\x07';
const demoMarker = '\x1b]777;pi-demo=';
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
  // Instrument only the isolated fixture; observe the actual closure state, not its colours/caption.
  const presentationPath = path.join(sourceDir, 'extensions/presentation.ts');
  let presentationSource = await readFile(presentationPath, 'utf8');
  presentationSource = presentationSource.replaceAll("from './", `from '${path.dirname(presentationPath)}/`);
  const renderState = "          const state = demoTimer !== undefined ? 'model'";
  assert.ok(presentationSource.includes(renderState));
  presentationSource = presentationSource.replace(renderState,
    `          process.stdout.write(${JSON.stringify(demoMarker)} + (demoTimer !== undefined ? 'on' : 'off') + '\\x07');\n${renderState}`);
  if (process.env.PI_SPINNER_TEST_KEEP_DEMO === '1') {
    presentationSource = presentationSource.replace('const stopDemo = () => {', 'const stopDemo = () => { return;');
  }
  const instrumented = path.join(dir, 'presentation-probe.ts');
  await writeFile(instrumented, presentationSource);
  settings.extensions = settings.extensions.map(file => file === presentationPath ? instrumented : file);
  assert.ok(settings.extensions.includes(instrumented), 'real host loads the instrumented presentation');
  const probe = path.join(dir, 'session-probe.ts');
  await writeFile(probe, `import { writeFileSync } from 'node:fs';
export default pi => {
  pi.on('session_start', (_, ctx) => {
    writeFileSync(${JSON.stringify(path.join(dir, 'session-id'))}, ctx.sessionManager.getSessionId());
    process.stdout.write('\\x1b]777;pi-session-ready\\x07');
  });
  pi.on('input', event => {
    writeFileSync(${JSON.stringify(path.join(dir, 'submitted-input'))}, JSON.stringify({ source: event.source, text: event.text }));
    process.stdout.write(${JSON.stringify(inputMarker)});
  });
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
    frameBuffer += text;
    // Read synchronized updates atomically, as a real terminal paints them.
    if (frameBuffer.lastIndexOf('\x1b[?2026h') > frameBuffer.lastIndexOf('\x1b[?2026l')) return;
    const frameData = frameBuffer;
    frameBuffer = '';
    const submitted = raw.includes(inputMarker);
    const demoState = [...raw.matchAll(/\x1b\]777;pi-demo=(on|off)\x07/g)].at(-1)?.[1];
    terminal.write(frameData, () => {
      if (!frameData.includes('\x1b[?2026l')) return;
      if (submitted && submittedAt === undefined) submittedAt = samples.length;
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
        const previewY = screen.findIndex(line => line.startsWith('╭ Session colour'));
        const previewTarget = previewY < 0 ? null : rgb(view.getLine(view.viewportY + previewY + 2), 114);
        const previewCaption = previewY >= 0 ? screen[previewY + 2] : '';
        samples.push({ colors, border, active: Boolean(frame), previewTarget, previewCaption, demoState });
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
  const sessionId = await waitForSessionReady(path.join(dir, 'session-id'), 15_000);
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
  assert.ok(startup.some(line => /^╭\s+◉/u.test(line)), 'composer remains visible below artwork and legend in a 30-row terminal');
  const identity = number(composerColors(sessionId, appearance, 'idle').base);
  const view = terminal.buffer.active;
  for (let y = artY; y < artY + 14; y++) {
    for (let x = 0; x < startup[y].length; x++) {
      if (startup[y][x] !== ' ') assert.equal(rgb(view.getLine(view.viewportY + y), x), identity);
    }
  }
  const legendY = startup.findIndex(line => line.startsWith('Activity type'));
  assert.equal(legendY, artY + 18, 'sample uses just one extra interior row');
  assert.match(startup[legendY - 3], /^╭.*Session colour.*╮$/u);
  assert.match(startup[legendY - 2], /^│ +│$/u, 'dummy interior stays empty');
  assert.match(startup[legendY - 1], /^╰.*Activity type.*╯$/u);
  assert.equal(startup[legendY - 1].length, 115, 'sample spans the current terminal width');
  assert.equal(rgb(view.getLine(view.viewportY + legendY - 3), 0), identity);
  const composerY = startup.findIndex(line => /^╭\s+◉/u.test(line));
  assert.ok(composerY > legendY);
  const swatches = [];
  for (let y = legendY; y < composerY; y++) {
    const row = view.getLine(view.viewportY + y);
    for (let x = 0; x < 115; x++) if (row?.getCell(x)?.getChars() === '■') swatches.push(rgb(row, x));
  }
  assert.deepEqual(swatches, ['model', 'tool', 'waiting', 'compaction', 'error'].map(state =>
    number(composerColors(sessionId, appearance, state).target)), 'real terminal cells preserve all five activity colours');
  assert.ok(startup.slice(legendY, composerY).some(line => line.includes('Idle · session colour')));
  const startupRows = startup.slice(artY, composerY);
  const startupSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1190" height="${startupRows.length * 24 + 30}"><rect width="100%" height="100%" fill="${appearance === 'dark' ? '#1e1e2e' : '#eff1f5'}"/><g font-family="JetBrainsMono Nerd Font Mono,Menlo,monospace" font-size="16" xml:space="preserve">${startupRows.flatMap((line, i) => [...line].map((char, x) => {
    if (char === ' ') return '';
    const color = rgb(view.getLine(view.viewportY + artY + i), x) ?? identity;
    return `<text x="${20 + x * 10}" y="${28 + i * 24}" fill="#${color.toString(16).padStart(6, '0')}">${char}</text>`;
  })).join('')}</g></svg>`;
  await writeFile(`/tmp/pi-header-${appearance}-proof.png`, new Resvg(startupSvg).render().asPng());
  await writeFile(`/tmp/pi-header-${appearance}-proof.txt`, startupRows.join('\n'));
  await delay(2200);
  const demoSamples = samples.filter(sample => sample.previewTarget !== null);
  assert.ok(new Set(demoSamples.map(sample => sample.previewTarget)).size >= 5, 'idle header smoothly cycles demo colours');
  assert.ok(demoSamples.every(sample => Object.values(sample.colors).every(color => color === identity)),
    'demo leaves the actual composer idle');
  assert.ok(demoSamples.some(sample => sample.demoState === 'on'), 'probe observes an active demo timer before submission');
  pty.write('Check the compact activity indicator\r');
  await pty.waitFor('Spinner fixture finished.', { timeout: 15_000 });
  await delay(1200);
  assert.equal(calls, 2);
  assert.deepEqual(JSON.parse(await readFile(path.join(dir, 'submitted-input'), 'utf8')),
    { source: 'interactive', text: 'Check the compact activity indicator' }, 'typed prompt fires the real host input event');
  assert.ok(submittedAt !== undefined, 'submitted-input event precedes a complete repaint');
  assert.ok(samples.length > submittedAt, 'post-submit state samples exist');
  assert.ok(samples.slice(submittedAt).every(sample => sample.demoState === 'off'),
    'demo timer must be absent in every post-submit sample');
  const expected = Object.fromEntries(['idle', 'model', 'tool'].map(state => {
    const { base, target } = composerColors(sessionId, appearance, state);
    return [state, { base: number(base), target: number(target), midpoint: number(mixColors(base, target, 0.5, 'srgb')) }];
  }));
  assert.ok(frames.size >= 2, 'Native Braille spinner animates');
  for (const state of ['model', 'tool']) {
    const stateSamples = samples.filter(sample => sample.colors.bottomRight === expected[state].target);
    assert.ok(stateSamples.length, `${appearance}: real host reaches ${state} endpoint`);
    assert.ok(stateSamples.some(sample => sample.previewTarget === expected[state].target),
      `${appearance}: miniature border follows the ${state} endpoint too`);
    for (const { colors, border } of stateSamples) {
      assert.deepEqual(colors, { border: expected[state].base, spinner: expected[state].base,
        label: expected[state].base, topRight: expected[state].midpoint, bottomRight: expected[state].target });
      assert.ok(!border.includes('◉') && !border.includes('working'), 'No duplicate idle icon or working suffix');
    }
  }
  const settled = samples.at(-1);
  assert.match(settled.border, /^╭\s+◉/u);
  assert.ok(Object.values(settled.colors).every(color => color === expected.idle.base), 'Settled border is uniform session colour');
  assert.ok(samples.slice(submittedAt).every(sample => sample.previewTarget === null || sample.previewTarget === sample.colors.bottomRight),
    'after submitted input the sample follows real activity, never simulated colours');
  assert.equal(settled.previewTarget, identity, 'header settles to real idle instead of resuming demo');
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
