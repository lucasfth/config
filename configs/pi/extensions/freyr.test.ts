import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { buildInteractionExpression, validateAppUrl, resolveFreyrEndpoint } from './freyr.ts';

test('Freyr bridge refuses credentials and unexpected browser endpoints', async () => {
  assert.throws(() => validateAppUrl('https://accounts.google.com/signin'), /login|credential/i);
  assert.throws(() => validateAppUrl('https://user:secret@example.com'), /credential/i);
  assert.throws(() => resolveFreyrEndpoint('http://example.com:9333'), /loopback|Freyr/i);
  assert.equal(resolveFreyrEndpoint('http://127.0.0.1:9333'), 'http://127.0.0.1:9333');
});

function richEditor(attributes: Record<string, string> = {}) {
  let text = '';
  const element = {
    isContentEditable: true,
    getAttribute: (name: string) => attributes[name] ?? null,
    closest: () => null,
    focus() {},
  };
  const document = {
    querySelector: () => element,
    createRange: () => ({ selectNodeContents() {} }),
    execCommand: (command: string, _ui: boolean, value: string) => {
      assert.equal(command, 'insertText');
      text = value;
      return true;
    },
  };
  return { element, document, text: () => text };
}

test('rich-text typing inserts literal text without clicking or submitting', () => {
  const editor = richEditor();
  const value = 'hello "); throw Error("injected"); //';
  const expression = buildInteractionExpression('type', '[contenteditable="true"]', value);
  const result = runInNewContext(expression, {
    document: editor.document,
    window: { getSelection: () => ({ removeAllRanges() {}, addRange() {} }) },
  });
  assert.equal(result, 'ok');
  assert.equal(editor.text(), value);
});

test('rich-text credential fields are refused before insertion', () => {
  for (const label of ['password', 'OTP code', 'API token', 'email', 'username']) {
    const editor = richEditor({ 'aria-label': label });
    assert.throws(() => runInNewContext(buildInteractionExpression('type', '.editor', 'test'), { document: editor.document }), /Credential field/);
    assert.equal(editor.text(), '');
  }
});

test('rich editor failure is explicit; no fallback or implicit submission', () => {
  const editor = richEditor();
  editor.document.execCommand = () => false;
  assert.throws(() => runInNewContext(buildInteractionExpression('type', '.editor', 'test'), {
    document: editor.document,
    window: { getSelection: () => ({ removeAllRanges() {}, addRange() {} }) },
  }), /Rich-text insertion failed/);
});
