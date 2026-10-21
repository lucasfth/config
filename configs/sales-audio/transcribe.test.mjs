import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { transcribe, MAX_BYTES } from './transcribe.mjs';
const endpoint = 'http://100.64.0.1:9090/transcribe';
async function fixture(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sales-audio-'));
  const file = path.join(root, 'synthetic.wav');
  fs.writeFileSync(file, Buffer.alloc(2048));
  try { await fn(file); } finally { fs.rmSync(root, { recursive: true }); }
}
test('plain transcript only, fixed multipart field, no original filename or redirects', () => fixture(async file => {
  const result = await transcribe(file, endpoint, async (url, options) => {
    assert.equal(url.href, endpoint);
    assert.equal(options.redirect, 'error');
    assert.equal(options.body.get('file').name, 'voice.bin');
    assert.equal(options.body.get('file').size, 2048);
    return Response.json({ text: '  Dette er en test.  ', segments: [] });
  });
  assert.equal(result, 'Dette er en test.');
}));
test('reject endpoints outside fixed Tailnet service contract', () => fixture(async file => {
  for (const url of ['http://127.0.0.1:9090/transcribe', 'https://example.com/transcribe', endpoint+'?url=other', endpoint.replace('9090','80')]) {
    await assert.rejects(transcribe(file, url, () => { throw Error('must_not_fetch'); }), /invalid_transcription_endpoint/);
  }
}));
test('oversize file fails before upload', () => fixture(async file => {
  fs.truncateSync(file, MAX_BYTES + 1);
  await assert.rejects(transcribe(file, endpoint, () => { throw Error('must_not_fetch'); }), /invalid_audio_size/);
}));
test('HTTP failure does not fall back or expose upstream details', () => fixture(async file => {
  let calls = 0;
  await assert.rejects(transcribe(file, endpoint, async () => { calls++; return new Response('private error', {status:503}); }), /^Error: transcription_http_503$/);
  assert.equal(calls, 1);
}));
test('empty transcript is a failure, not a successful transcription', () => fixture(async file => {
  await assert.rejects(transcribe(file, endpoint, async () => Response.json({text:' '})), /transcription_no_speech/);
}));
test('response limit enforced', () => fixture(async file => {
  await assert.rejects(transcribe(file, endpoint, async () => new Response('x'.repeat(2*1024*1024+1))), /transcription_response_too_large/);
}));
