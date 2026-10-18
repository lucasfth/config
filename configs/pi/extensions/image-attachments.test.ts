import assert from 'node:assert/strict';
import test from 'node:test';
import { CustomEditor } from '@earendil-works/pi-coding-agent';
import { KeybindingsManager } from '../node_modules/@earendil-works/pi-coding-agent/dist/core/keybindings.js';
import type { TUI } from '@earendil-works/pi-tui';

const first = '/tmp/pi-clipboard-11111111-1111-4111-8111-111111111111.png';
const second = '/tmp/pi-clipboard-22222222-2222-4222-8222-222222222222.png';
function editor() {
  return new CustomEditor({ terminal: { rows: 40 }, requestRender() {} } as unknown as TUI, { borderColor: text => text, selectList: { selectedPrefix: text => text, selectedText: text => text, description: text => text, scrollInfo: text => text, noMatch: text => text } }, new KeybindingsManager());
}

test('clipboard images display compact tokens and submit original paths with surrounding text', () => {
  const input = editor();
  let submitted = '';
  input.onSubmit = text => { submitted = text; };
  input.insertTextAtCursor('Compare ');
  input.insertImage(first);
  input.insertTextAtCursor(' with ');
  input.insertImage(second);
  assert.equal(input.getText(), 'Compare [img1\u2063] with [img2\u2063]');
  assert.equal(input.getExpandedText(), `Compare ${first} with ${second}`);
  const rendered = input.render(100).join('\n');
  assert.ok(rendered.includes('Compare [img1] with [img2]'));
  assert.ok(!rendered.includes('\u2063'));
  assert.ok(!rendered.includes('pi-clipboard-'));
  input.handleInput('\r');
  assert.equal(submitted, `Compare ${first} with ${second}`);
  assert.equal(input.getText(), '');
});

test('image tokens delete atomically and undo restores the original attachment mapping', () => {
  const input = editor();
  input.insertImage(first);
  input.insertImage(second);
  input.handleInput('\x7f');
  assert.equal(input.getText(), '[img1\u2063] ');
  assert.equal(input.getExpandedText(), first + ' ');
  input.handleInput('\x1f');
  assert.equal(input.getText(), '[img1\u2063] [img2\u2063]');
  assert.equal(input.getExpandedText(), first + ' ' + second);
  input.handleInput('\x1b[H');
  input.handleInput('\x1b[3~');
  assert.equal(input.getText(), ' [img2\u2063]');
  assert.equal(input.getExpandedText(), ' ' + second);
});

test('literal image labels and ordinary file paths remain literal without registered attachments', () => {
  const input = editor();
  input.insertTextAtCursor('[img1] /tmp/example.png');
  assert.equal(input.getExpandedText(), '[img1] /tmp/example.png');
  input.setText('');
  input.insertImage(first);
  assert.equal(input.getText(), '[img1\u2063]');
});

test('literal image labels stay literal alongside real image and large text attachments', () => {
  const input = editor();
  input.insertImage(first);
  input.handleInput('\x1b[200~ literal [img1] \x1b[201~');
  const large = 'source text\n'.repeat(12);
  input.handleInput('\x1b[200~' + large + '\x1b[201~');
  assert.equal(input.getExpandedText(), first + ' literal [img1] ' + large);
});
