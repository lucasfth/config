import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn as spawnProcess } from 'node:child_process';
import { spawn as spawnPty } from 'zigpty';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { prepareRuntime, sourceDir } from './runtime.mjs';
import headless from '@xterm/headless';

const root = await mkdtemp(path.join(os.tmpdir(), 'huginn-pi-ui-'));
let unexpectedModelRequests = 0;
const server = http.createServer((_request, response) => { unexpectedModelRequests++; response.writeHead(503); response.end('Model calls forbidden in UI exercise'); });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
// Only non-secret terminal/process variables enter the child. The one provider
// key is synthetic and its only configured endpoint is the loopback server.
const env = Object.fromEntries(['PATH','HOME','USER','SHELL','TMPDIR','LANG'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
Object.assign(env, { PI_CODING_AGENT_DIR: root, NEO_PROXY_API_KEY: 'synthetic-ui-only', PI_OFFLINE: '1', PI_TELEMETRY: '0', PI_ALLOW_BROWSER_COOKIES: '0', FEYNMAN_ALLOW_BROWSER_COOKIES: '0', TERM: 'xterm-256color', TERM_PROGRAM: 'ghostty' });
const shellCommand = `export NEO_PROXY_URL=${JSON.stringify(`http://127.0.0.1:${server.address().port}/v1`)}; export NEO_PROXY_API_KEY=synthetic-ui-only; export HUGINN_OMP_AGENT_DIR=${JSON.stringify(path.join(root, 'absent'))}; pi --offline --no-mcp --no-session --no-context-files --no-skills --tui-mode regular`;
let child, pty;
let raw = '';
const terminal = new headless.Terminal({ cols: 110, rows: 40, allowProposedApi: true });
const screen = () => {
  const view = terminal.buffer.active;
  return Array.from({ length: 40 }, (_, y) => view.getLine(view.viewportY + y)?.translateToString(true) ?? '');
};
const painted = () => new Promise(resolve => terminal.write('', resolve));
const waitScreen = async (predicate, label) => {
  for (let attempt = 0; attempt < 250; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 20));
    await painted();
    if (predicate(screen())) return;
  }
  assert.fail(`Terminal screen deadline: ${label}`);
};
const capturePicker = async label => {
  await waitScreen(lines => lines.some(line => line.includes('Type to filter')) &&
    (label === 'filtered' ? lines[38].includes('→ claude-haiku-5-5') : /^\s*\(\d+\/\d+\)/u.test(lines[38])),
    `${label}: complete bottom-anchored picker repaint`);
  const lines = screen();
  const hintY = lines.findIndex(line => line.includes('Type to filter'));
  assert.ok(hintY >= 20, `${label}: picker opens in lower half, hint row ${hintY}`);
  const last = lines.findLastIndex(line => line.trim());
  assert.equal(last, 38, `${label}: picker content ends one row above terminal bottom`);
  await writeFile(`/tmp/pi-switch-${label}-proof.txt`, lines.join('\n'));
  await writeFile(`/tmp/pi-switch-${label}-proof.ansi`, raw);
};
try {
  await prepareRuntime({ agentDir: root, env: { ...env, NEO_PROXY_URL: `http://127.0.0.1:${server.address().port}/v1` }, ompDir: path.join(root, 'absent') });
  const configuredModels = JSON.parse(await readFile(path.join(root, 'models.json'), 'utf8'));
  assert.deepEqual(Object.keys(configuredModels.providers), ['neo-proxy']);
  assert.equal(new URL(configuredModels.providers['neo-proxy'].baseUrl).hostname, '127.0.0.1');
  await writeFile(path.join(root, 'mcp.json'), JSON.stringify({ mcpServers: {} }));
  const settings = JSON.parse(await readFile(path.join(root, 'settings.json'), 'utf8'));
  settings.skills = [];
  settings.extensions = settings.extensions.filter(filename => !filename.endsWith('freyr.ts') && !filename.endsWith('muninn.ts'));
  await writeFile(path.join(root, 'settings.json'), JSON.stringify(settings));
  const cli = path.join(sourceDir, 'node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js');
  child = spawnProcess(process.execPath, [cli, '--offline', '--mode', 'rpc', '--no-session', '--no-context-files', '--no-skills'], { cwd: root, env, stdio: ['pipe','pipe','pipe'] });
  const exited = new Promise(resolve => child.once('exit', resolve));
  const pending = new Map();
  const errors = [], dialogs = [];
  let buffer = '', stderr = '', sequence = 0;
  child.stderr.on('data', chunk => { stderr += chunk; });
  child.stdout.on('data', chunk => {
    buffer += chunk;
    for (;;) {
      const end = buffer.indexOf('\n'); if (end < 0) break;
      const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
      let row; try { row = JSON.parse(line); } catch { continue; }
      if (row.type === 'extension_error') errors.push(row);
      if (row.type === 'response') pending.get(row.id)?.(row);
      if (row.type === 'extension_ui_request' && ['input','select'].includes(row.method)) {
        dialogs.push(row.method);
        const value = row.method === 'input' ? 'claude-haiku-5-5' : row.options.find(option => option.startsWith('neo-proxy/claude-haiku-5-5'));
        child.stdin.write(JSON.stringify({ type: 'extension_ui_response', id: row.id, value }) + '\n');
      }
    }
  });
  const send = (type, fields = {}) => new Promise((resolve, reject) => {
    const id = String(++sequence);
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`RPC deadline: ${type}: ${stderr}`)); }, 15000);
    pending.set(id, row => { clearTimeout(timer); pending.delete(id); row.success ? resolve(row) : reject(new Error(row.error)); });
    child.stdin.write(JSON.stringify({ id, type, ...fields }) + '\n');
  });
  const initial = await send('get_state');
  assert.equal(initial.data.model.id, 'gpt-6.1-sol');
  await send('prompt', { message: '/switch neo-proxy/gpt-6-luna:low' });
  assert.equal((await send('get_state')).data.model.id, 'gpt-6-luna');
  assert.equal(JSON.parse(await readFile(path.join(root,'settings.json'),'utf8')).defaultModel, 'gpt-6.1-sol');
  await send('prompt', { message: '/models role vision neo-proxy/claude-haiku-5-5:minimal' });
  assert.equal(JSON.parse(await readFile(path.join(root,'roles.json'),'utf8')).vision.modelId, 'claude-haiku-5-5');
  await send('prompt', { message: '/models default neo-proxy/claude-opus-5-5:high' });
  const defaults = JSON.parse(await readFile(path.join(root,'settings.json'),'utf8'));
  assert.equal(defaults.defaultModel, 'claude-opus-5-5');
  assert.equal(defaults.defaultThinkingLevel, 'high');
  await send('prompt', { message: '/switch' });
  assert.equal((await send('get_state')).data.model.id, 'claude-haiku-5-5');
  assert.deepEqual(dialogs, ['input','select']);
  assert.equal(errors.length, 0, JSON.stringify(errors));
  assert.equal(stderr, '');
  child.stdin.end(); await exited; child = undefined;
  console.log(JSON.stringify({ scenario: 'rpc-commands', pickerDialogs: dialogs, extensionErrors: errors.length, stderr }));

  pty = spawnPty('zsh', ['-lic', shellCommand], { cwd: root, env, cols: 110, rows: 40 });
  pty.onData(data => {
    const text = String(data); raw += text;
    terminal.write(text);
    if (text.includes('\x1b[c')) pty.write('\x1b[?62;c');
    if (text.includes('\x1b[6n')) pty.write('\x1b[1;1R');
    if (text.includes('\x1b[16t')) pty.write('\x1b[6;20;16t');
  });
  await pty.waitFor('Huginn · Pi', { timeout: 20000 });
  assert.ok(raw.includes('claude-opus-5-5'), 'Initial model is visible in composer status');
  pty.write('/switch neo-proxy/gpt-6-luna:low'); pty.write('\r');
  await pty.waitFor('Session model:', { timeout: 10000 });
  pty.write('/switch\r');
  await pty.waitFor('Type to filter', { timeout: 10000 });
  await capturePicker('open');
  pty.write('claude-haiku-5-5');
  await waitScreen(lines => lines.some(line => line.includes('claude-haiku-5-5')) && !lines.some(line => line.includes('gpt-6.1-sol')), 'filtered picker');
  await capturePicker('filtered');
  pty.write('\r');
  await pty.waitFor('Session model: neo-proxy/claude-haiku-5-5', { timeout: 10000 });
  await waitScreen(lines => !lines.some(line => line.includes('Type to filter')), 'selection dismisses picker');
  pty.write('/switch\r');
  await waitScreen(lines => lines.some(line => line.includes('Type to filter')), 'fresh picker opens');
  await capturePicker('reopen');
  pty.write('\x1b');
  await waitScreen(lines => !lines.some(line => line.includes('Type to filter')), 'Escape dismisses picker');
  pty.write('/visuals demo\r');
  await pty.waitFor('Native SVG preview shown', { timeout: 10000 });
  assert.ok(raw.includes('\x1b_G'), 'Terminal must receive Kitty image protocol');
  assert.ok(!raw.includes('[Extension issues]'), 'No extension warning panel');
  assert.ok(raw.includes('╭') && raw.includes('│') && raw.includes('╰'), 'Composer must be visibly boxed');
  assert.ok(!raw.includes('[Skills]') && !raw.includes('[Context]'), 'Quiet startup must not dump resources');
  const quit = new Promise(resolve => pty.onExit(result => resolve(result)));
  const deadline = setTimeout(() => pty.kill(), 5000);
  pty.write('/quit\r');
  const exit = await quit; clearTimeout(deadline);
  assert.equal(exit.exitCode, 0, 'Native /quit must exit cleanly');
  assert.equal(unexpectedModelRequests, 0, 'UI commands must not request model completions');
  console.log(JSON.stringify({ scenario: 'terminal-commands', kittyImageBytes: raw.includes('\x1b_G'), exitCode: exit.exitCode, unexpectedModelRequests, terminalTextTail: raw.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,'').slice(-700) }));
} catch (error) {
  console.error(JSON.stringify({ terminalFailure: raw.slice(-9000) }));
  throw error;
} finally {
  child?.kill(); pty?.kill(); server.closeAllConnections();
  terminal.dispose();
  await new Promise(resolve => server.close(resolve));
  await rm(root, { recursive: true, force: true });
}
