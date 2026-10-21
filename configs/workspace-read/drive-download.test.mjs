import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { saveDriveDownload } from './drive-download.mjs';

function receipt() {
  const bytes = Buffer.alloc(200000, 65);
  return { principal: 'mini-isabella', subject: 'ps@ecoray.dk', operation: 'drive_read', writes: false,
    data: { id: 'file_123', name: '../../escape.pdf', extension: '.pdf', mimeType: 'application/pdf', bytes: bytes.length,
      sha256: crypto.createHash('sha256').update(bytes).digest('hex'), encoding: 'base64', content_base64: bytes.toString('base64') } };
}

test('download is private and workspace-relative; no bytes escape to model response', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'drive-test-'));
  try {
    const result = saveDriveDownload(root, receipt(), 'file_123');
    assert.match(result.data.path, /^\.drive-[^/]+\/document\.pdf$/);
    assert.equal(result.data.content_base64, undefined);
    assert.equal(result.data.encoding, undefined);
    const target = path.join(root, result.data.path);
    assert.equal(fs.statSync(target).size, 200000);
    assert.equal(fs.statSync(target).mode & 0o777, 0o600);
    assert.equal(fs.statSync(path.dirname(target)).mode & 0o777, 0o700);
    assert.ok(JSON.stringify(result).length < 1500);
  } finally { fs.rmSync(root, { recursive: true }); }
});

test('bad hash, path extension, file identity and byte count are rejected before writing', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'drive-test-'));
  try {
    for (const patch of [{ sha256: '0'.repeat(64) }, { extension: '/../secret' }, { id: 'other' }, { bytes: 2 }]) {
      const body = receipt();
      Object.assign(body.data, patch);
      assert.throws(() => saveDriveDownload(root, body, 'file_123'), /google_file_/);
      assert.deepEqual(fs.readdirSync(root), []);
    }
  } finally { fs.rmSync(root, { recursive: true }); }
});
