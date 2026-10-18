import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateAppUrl, resolveFreyrEndpoint } from './freyr.ts';

test('Freyr bridge refuses credentials and unexpected browser endpoints', async () => {
  assert.throws(() => validateAppUrl('https://accounts.google.com/signin'), /login|credential/i);
  assert.throws(() => validateAppUrl('https://user:secret@example.com'), /credential/i);
  assert.throws(() => resolveFreyrEndpoint('http://example.com:9333'), /loopback|Freyr/i);
  assert.equal(resolveFreyrEndpoint('http://127.0.0.1:9333'), 'http://127.0.0.1:9333');
});
