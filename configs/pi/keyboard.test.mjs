import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { CustomEditor } from '@earendil-works/pi-coding-agent';
import { KeybindingsManager } from './node_modules/@earendil-works/pi-coding-agent/dist/core/keybindings.js';
import { setKittyProtocolActive } from '@earendil-works/pi-tui';

test('Ghostty binds only Option–Backspace, preserving Danish Option characters', async () => {
  const config = await readFile(new URL('../ghostty/config', import.meta.url), 'utf8');
  assert.ok(config.split('\n').includes(String.raw`keybind = alt+backspace=text:\x1b\x7f`));
  assert.ok(!/^macos-option-as-alt\s*=\s*(true|left|right)\s*$/m.test(config));
});

test('native editor deletes words for legacy and Kitty Alt–Backspace, not plain Backspace', () => {
  const keys = new KeybindingsManager();
  const editor = new CustomEditor({ terminal: { rows: 40 }, requestRender() {} },
    { borderColor: text => text }, keys);
  for (const kitty of [false, true]) {
    setKittyProtocolActive(kitty);
    try {
      for (const sequence of ['\x1b\x7f', '\x1b\x08', '\x1b[127;3u']) {
        editor.setText('first second');
        editor.handleInput(sequence);
        assert.equal(editor.getText(), 'first ', `kitty=${kitty}, sequence=${JSON.stringify(sequence)}`);
        editor.handleInput('\x19');
        assert.equal(editor.getText(), 'first second', 'Deleted word remains available to yank');
      }
      editor.setText('first second');
      editor.handleInput('\x7f');
      assert.equal(editor.getText(), 'first secon');
    } finally { setKittyProtocolActive(false); }
  }
});
