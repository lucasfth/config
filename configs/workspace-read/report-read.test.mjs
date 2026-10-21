import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readReport } from './report-read.mjs';
async function fixture(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'report-read-'));
  try { await fn(root); } finally { fs.rmSync(root, { recursive: true }); }
}
test('large report saved privately without putting values into tool response', () => fixture(async root => {
  const data = { snapshot: { id: 'abc123', payload: { text: 'synthetic'.repeat(10000) } } };
  const result = await readReport(root, 'abc123', async (url, options) => {
    assert.equal(url, 'https://ecoray.dk/api/calculations/snapshots/abc123');
    assert.equal(options.redirect, 'error');
    assert.equal(options.method, undefined);
    return Response.json(data);
  });
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, result.path))), data);
  assert.equal(fs.statSync(path.join(root, result.path)).mode & 0o777, 0o600);
  assert.equal(fs.statSync(path.dirname(path.join(root, result.path))).mode & 0o777, 0o700);
  assert.ok(!JSON.stringify(result).includes('synthetic'));
  assert.ok(JSON.stringify(result).length < 1000);
}));
test('invalid IDs, denied access, oversized and malformed documents do not create files', () => fixture(async root => {
  await assert.rejects(readReport(root, '../other', () => { throw Error('must_not_fetch'); }), /invalid_snapshot_id/);
  await assert.rejects(readReport(root, 'abc123', async () => new Response('denied', {status:403})), /report_http_403/);
  await assert.rejects(readReport(root, 'abc123', async () => new Response('x'.repeat(2097153))), /report_response_budget/);
  await assert.rejects(readReport(root, 'abc123', async () => Response.json({snapshot:[]})), /report_invalid_snapshot/);
  await assert.rejects(readReport(root, 'abc123', async () => Response.json({snapshot:{id:'wrong'}})), /report_identity_mismatch/);
  assert.deepEqual(fs.readdirSync(root), []);
}));
