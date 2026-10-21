import assert from 'node:assert/strict';
import test from 'node:test';
import { driveOperation, FILE_LIMIT } from './drive.mjs';

const params = values => new URLSearchParams(values);
const metadata = { id: 'file_123', name: 'bilag.pdf', mimeType: 'application/pdf', size: '200000' };
function upstream(meta = metadata, bytes = Buffer.alloc(200000, 65)) {
  const calls = [];
  return {
    calls,
    fetch: async (url, options) => {
      calls.push({ url: new URL(url), options });
      return calls.length === 1 ? Response.json(meta) : new Response(bytes);
    },
  };
}

test('binary bilag larger than metadata cap is read with integrity receipt', async () => {
  const mock = upstream();
  const data = await driveOperation('drive_read', params({ id: 'file_123' }), 'test-token', mock.fetch);
  assert.equal(data.bytes, 200000);
  assert.equal(Buffer.from(data.content_base64, 'base64').length, 200000);
  assert.match(data.sha256, /^[a-f0-9]{64}$/);
  assert.equal(mock.calls[1].url.searchParams.get('alt'), 'media');
  assert.equal(mock.calls[1].options.redirect, 'error');
});

test('declared oversized file is rejected without download', async () => {
  const mock = upstream({ ...metadata, size: String(FILE_LIMIT + 1) });
  await assert.rejects(driveOperation('drive_read', params({ id: 'file_123' }), 'test-token', mock.fetch), /file_too_large/);
  assert.equal(mock.calls.length, 1);
});

test('actual stream cap is enforced even when size metadata lies', async () => {
  const mock = upstream(metadata, Buffer.alloc(FILE_LIMIT + 1));
  await assert.rejects(driveOperation('drive_read', params({ id: 'file_123' }), 'test-token', mock.fetch), /file_too_large/);
});

test('native Docs and Sheets are exported in supported file formats', async () => {
  for (const [native, exported] of [
    ['application/vnd.google-apps.document', 'application/pdf'],
    ['application/vnd.google-apps.spreadsheet', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  ]) {
    const mock = upstream({ ...metadata, mimeType: native });
    const data = await driveOperation('drive_read', params({ id: 'file_123' }), 'test-token', mock.fetch);
    assert.equal(data.mimeType, exported);
    assert.equal(mock.calls[1].url.pathname, '/drive/v3/files/file_123/export');
    assert.equal(mock.calls[1].url.searchParams.get('mimeType'), exported);
  }
});

test('listing keeps 128 KiB response cap', async () => {
  const fetch = async () => new Response(JSON.stringify({ files: [], padding: 'x'.repeat(131072) }));
  await assert.rejects(driveOperation('drive_list', params({}), 'test-token', fetch), /response_budget/);
});

test('search is escaped text, not caller-controlled Drive query syntax', async () => {
  let url;
  await driveOperation('drive_search', params({ query: "a' or trashed=true", id: 'parent_1', page_token: 'next-page' }), 'test-token', async u => {
    url = new URL(u);
    return Response.json({ files: [] });
  });
  assert.equal(url.searchParams.get('q'), "trashed=false and 'parent_1' in parents and fullText contains 'a\\' or trashed=true'");
  assert.equal(url.searchParams.get('pageToken'), 'next-page');
});

test('invalid IDs, extra arguments and missing search text fail before Google', async () => {
  const fetch = () => { throw Error('must_not_fetch'); };
  for (const [op, args] of [
    ['drive_read', { id: '../secret' }],
    ['drive_read', { id: 'file_123', subject: 'other@example.com' }],
    ['drive_read', { id: 'file_123', query: 'unexpected' }],
    ['drive_search', {}],
    ['drive_upload', {}],
  ]) await assert.rejects(driveOperation(op, params(args), 'test-token', fetch), /invalid_|operation_denied/);
});

test('upstream denial preserves error category and does not fetch file bytes', async () => {
  let calls = 0;
  await assert.rejects(driveOperation('drive_read', params({ id: 'file_123' }), 'test-token', async () => {
    calls++;
    return new Response('private upstream details', { status: 403 });
  }), /google_http_403/);
  assert.equal(calls, 1);
});

test('folders, shortcuts and unsupported Google types are not downloaded', async () => {
  for (const mimeType of ['application/vnd.google-apps.folder', 'application/vnd.google-apps.shortcut', 'application/vnd.google-apps.form']) {
    const mock = upstream({ ...metadata, mimeType });
    await assert.rejects(driveOperation('drive_read', params({ id: 'file_123' }), 'test-token', mock.fetch), /unsupported_file_type/);
    assert.equal(mock.calls.length, 1);
  }
});
