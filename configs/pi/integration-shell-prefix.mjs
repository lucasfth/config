import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { tsImport } from 'tsx/esm/api';
import { initTheme } from '@earendil-works/pi-coding-agent';
import { getThemeByName } from './node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.js';
import { spawn } from 'zigpty';
import { execFileSync } from 'node:child_process';

const { InteractiveShellOverlay } = await tsImport('./node_modules/pi-interactive-shell/overlay-component.ts', import.meta.url);
const { ReattachOverlay } = await tsImport('./node_modules/pi-interactive-shell/reattach-overlay.ts', import.meta.url);
const { loadConfig } = await tsImport('./node_modules/pi-interactive-shell/config.ts', import.meta.url);
const { sessionManager } = await tsImport('./node_modules/pi-interactive-shell/session-manager.ts', import.meta.url);
const dir = await mkdtemp(path.join(os.tmpdir(), 'shell-prefix-'));
const wait = async (check, label) => {
  for (let i = 0; i < 200; i++) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  assert.fail(label);
};
let client, overlay, reattach;
try {
  initTheme('dark', false);
  const theme = getThemeByName('dark');
  const tui = { terminal: { columns: 160, rows: 40 }, requestRender() {} };
  const config = loadConfig(dir);
  let result, unfocused = false;
  overlay = new InteractiveShellOverlay(tui, theme, {
    command: 'printf "SHELL_PREFIX_READY\\n"; read -r finish', cwd: dir,
    shellConfig: { shell: '/bin/bash', args: ['-c'] },
    onUnfocus: () => { unfocused = true; },
  }, config, value => { result = value; });
  overlay.focused = true;
  await wait(() => overlay.session.getViewportLines().join('\n').includes('SHELL_PREFIX_READY'), 'real child output');
  const rendered = overlay.render(160).join('\n');
  assert.ok(rendered.includes('Prefix → i → t transfer'));
  assert.ok(rendered.includes('Prefix → i → m menu'));
  assert.ok(!/Alt\+Shift\+f|Ctrl\+B background/.test(rendered));
  overlay.handleInput('\x1b[102;7u');
  assert.equal(unfocused, true);
  overlay.handleInput('\x1b[109;7u');
  assert.ok(overlay.render(160).join('\n').includes('Session actions:'));
  overlay.handleInput('\x1b');
  overlay.handleInput('\x1b[98;7u');
  assert.equal(result.backgrounded, true);
  const background = sessionManager.get(result.backgroundId);
  assert.ok(background && !background.session.exited);
  let transferred;
  reattach = new ReattachOverlay(tui, theme, background, config, value => { transferred = value; });
  background.session.write('finish\r');
  await wait(() => background.session.exited, 'background child natural exit');
  reattach.handleInput('\x1b[116;7u');
  assert.ok(transferred.transferred.lines.join('\n').includes('SHELL_PREFIX_READY'));

  // Real isolated Herdr client: prefix cancel + transport must reach a child,
  // rather than executing a Herdr action. No live socket/config/session is used.
  const receiver = path.join(dir, 'receiver.py');
  const ready = path.join(dir, 'ready');
  const received = path.join(dir, 'received');
  await writeFile(receiver, `import os,tty,sys\ntty.setraw(0)\nos.write(1,b'\\x1b[>1u')\nopen(${JSON.stringify(ready)},'w').write('ready')\nwhile True:\n data=os.read(0,1024)\n with open(${JSON.stringify(received)},'ab') as out: out.write(data)\n`);
  const shell = path.join(dir, 'shell');
  await writeFile(shell, `#!/bin/sh\nexec /usr/bin/python3 ${JSON.stringify(receiver)}\n`, { mode: 0o700 });
  const configFile = path.join(dir, 'config.toml');
  await writeFile(configFile, `onboarding = false\n[terminal]\ndefault_shell = ${JSON.stringify(shell)}\n[keys]\nprefix = "ctrl+b"\n`);
  const env = Object.fromEntries(['PATH','HOME','USER','LANG','TMPDIR'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
  Object.assign(env, { TERM: 'xterm-256color', HERDR_CONFIG_PATH: configFile,
    HERDR_SOCKET_PATH: path.join(dir, 'api.sock'), XDG_CONFIG_HOME: dir,
    XDG_RUNTIME_DIR: dir, XDG_STATE_HOME: path.join(dir, 'state'), HERDR_DISABLE_SOUND: '1' });
  client = spawn(process.env.HERDR_TEST_BIN || '/opt/homebrew/bin/herdr', [], { cwd: dir, env, cols: 120, rows: 35 });
  let raw = '';
  client.onData(data => {
    raw += String(data);
    if (String(data).includes('\x1b[c')) client.write('\x1b[?62;c');
    if (String(data).includes('\x1b[6n')) client.write('\x1b[1;1R');
  });
  await wait(() => readFile(ready, 'utf8').then(Boolean).catch(() => false), 'isolated Herdr child startup: ' + raw);
  for (const key of ['f', 'b', 't', 'm', 'g', 'p']) {
    client.write('\x02\x1b[27u' + `\x1b[${key.charCodeAt(0)};7u`);
    await wait(() => readFile(received, 'utf8').then(value => value.includes(`\x1b[${key.charCodeAt(0)};7u`)).catch(() => false), `Herdr transport ${key}`);
  }
  const bytes = await readFile(received, 'utf8');
  assert.equal(bytes, ['f','b','t','m','g','p'].map(key => `\x1b[${key.charCodeAt(0)};7u`).join(''));
  console.log(JSON.stringify({ realOverlay: true, focus: true, menu: true, background: true,
    reattachTransfer: true, realHerdrTransport: 6, noPrefixLeak: true }));
} finally {
  if (client) {
    const env = { ...process.env, HERDR_CONFIG_PATH: path.join(dir, 'config.toml'), HERDR_SOCKET_PATH: path.join(dir, 'api.sock') };
    try { execFileSync(process.env.HERDR_TEST_BIN || '/opt/homebrew/bin/herdr', ['server', 'stop'], { env, stdio: 'pipe', timeout: 5000 }); } catch {}
    client.kill();
  }
  reattach?.dispose();
  overlay?.dispose();
  sessionManager.killAll();
  await rm(dir, { recursive: true, force: true });
}
