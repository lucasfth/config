import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { tsImport } from 'tsx/esm/api';

const base = './node_modules/pi-interactive-shell/';
const { loadConfig } = await tsImport(base + 'config.ts', import.meta.url);
const { InteractiveShellOverlay } = await tsImport(base + 'overlay-component.ts', import.meta.url);
const { ReattachOverlay } = await tsImport(base + 'reattach-overlay.ts', import.meta.url);
const { formatShortcut } = await tsImport(base + 'types.ts', import.meta.url);
const actions = { f: 'focus', b: 'background', t: 'transfer', m: 'menu', g: 'agent', p: 'spawn' };

test('shell defaults and Ghostty transport use the one-shot Herdr prefix namespace', async () => {
  const config = loadConfig('/tmp');
  assert.equal(config.focusShortcut, 'ctrl+alt+f');
  assert.equal(config.spawn.shortcut, 'ctrl+alt+p');
  for (const filename of ['config', 'herdr-shell.conf']) {
    const ghostty = await readFile(new URL(`../ghostty/${filename}`, import.meta.url), 'utf8');
    assert.ok(ghostty.includes('herdr-prefix/i=text:\\x1b[27u'));
    assert.ok(ghostty.includes('chain=activate_key_table_once:herdr-shell'));
    for (const key of Object.keys(actions)) {
      assert.ok(ghostty.includes(`herdr-shell/${key}=text:\\x1b[${key.charCodeAt(0)};7u`));
      assert.equal(formatShortcut(`ctrl+alt+${key}`), `Prefix → i → ${key}`);
    }
    assert.ok(ghostty.includes('herdr-shell/unconsumed:catch_all=end_key_sequence'));
  }
});

for (const Overlay of [InteractiveShellOverlay, ReattachOverlay]) {
  test(`${Overlay.name}: prefixed controls work and plain control keys reach the child`, () => {
    const writes = [];
    const calls = [];
    const overlay = Object.assign(Object.create(Overlay.prototype), {
      state: 'running', userTookOver: true,
      config: { focusShortcut: 'ctrl+alt+f' },
      options: { onUnfocus: () => calls.push('focus') },
      onUnfocus: () => calls.push('focus'),
      tui: { requestRender() {} },
      finishWithTransfer: () => calls.push('transfer'),
      finishWithBackground: () => calls.push('background'),
      returnToHandsFree: () => calls.push('agent'),
      triggerUserTakeover() {},
    });
    Object.defineProperty(overlay, 'session', { value: { exited: false, write: data => writes.push(data) } });
    for (const key of ['\x02', '\x14', '\x11', '\x07']) overlay.handleInput(key);
    assert.deepEqual(writes, ['\x02', '\x14', '\x11', '\x07']);
    for (const key of ['f', 't', 'b']) overlay.handleInput(`\x1b[${key.charCodeAt(0)};7u`);
    assert.deepEqual(calls, ['focus', 'transfer', 'background']);
    overlay.handleInput('\x1b[109;7u');
    assert.equal(overlay.state, 'detach-dialog');
    overlay.state = 'running';
    if (Overlay === InteractiveShellOverlay) {
      overlay.handleInput('\x1b[103;7u');
      assert.equal(calls.at(-1), 'agent');
    }
  });
}
