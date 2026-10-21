import crypto from 'node:crypto';

export const FILE_LIMIT = 8 * 1024 * 1024;
export const JSON_LIMIT = 128 * 1024;
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const FILES = 'https://www.googleapis.com/drive/v3/files';
const ID = /^[A-Za-z0-9_-]{1,120}$/;
const FIELDS = 'id,name,mimeType,size,modifiedTime,webViewLink,capabilities(canDownload)';
const EXPORTS = {
  'application/vnd.google-apps.document': ['application/pdf', '.pdf'],
  'application/vnd.google-apps.spreadsheet': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.xlsx'],
  'application/vnd.google-apps.presentation': ['application/pdf', '.pdf'],
};
const EXTENSIONS = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/tiff': '.tiff',
  'text/plain': '.txt',
  'text/csv': '.csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
};

async function request(url, key, limit, signal, fetchImpl) {
  const response = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${key}` }, redirect: 'error', signal,
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw Error(`google_http_${response.status}`);
  }
  const overflow = limit === FILE_LIMIT ? 'file_too_large' : 'response_budget';
  if (Number(response.headers.get('content-length')) > limit) {
    await response.body?.cancel();
    throw Error(overflow);
  }
  const reader = response.body?.getReader();
  if (!reader) throw Error('google_empty_body');
  const parts = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) {
        await reader.cancel();
        throw Error(overflow);
      }
      parts.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(parts);
}

export async function driveOperation(operation, params, key, fetchImpl = fetch) {
  const list = operation === 'drive_list' || operation === 'drive_search';
  if (!list && !['drive_metadata', 'drive_read'].includes(operation)) throw Error('operation_denied');
  const allowed = list ? ['operation', 'id', 'page_token', ...(operation === 'drive_search' ? ['query'] : [])] : ['operation', 'id'];
  if ([...params.keys()].some(k => !allowed.includes(k) || params.getAll(k).length !== 1)) throw Error('invalid_arguments');
  const id = params.get('id');
  if ((id !== null && !ID.test(id)) || (!list && !id)) throw Error('invalid_id');
  const page = params.get('page_token');
  if (page !== null && (!page || page.length > 2048 || /[\x00-\x1f\x7f]/.test(page))) throw Error('invalid_page_token');
  const query = params.get('query')?.trim();
  if (operation === 'drive_search' && (!query || query.length > 200)) throw Error('invalid_query');
  // One deadline covers metadata and the file body, including slow streams.
  const signal = AbortSignal.timeout(15000);
  const json = async url => JSON.parse((await request(url, key, JSON_LIMIT, signal, fetchImpl)).toString('utf8'));
  if (list) {
    const url = new URL(FILES);
    const clauses = ['trashed=false'];
    if (id) clauses.push(`'${id}' in parents`);
    if (query) clauses.push(`fullText contains '${query.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`);
    url.search = new URLSearchParams({ pageSize: '20', fields: `files(${FIELDS}),nextPageToken,incompleteSearch`, q: clauses.join(' and '), supportsAllDrives: 'true', includeItemsFromAllDrives: 'true' });
    if (page) url.searchParams.set('pageToken', page);
    return json(url);
  }
  const url = new URL(`${FILES}/${id}`);
  url.search = new URLSearchParams({ fields: FIELDS, supportsAllDrives: 'true' });
  const metadata = await json(url);
  if (metadata.id !== id) throw Error('google_file_identity_invalid');
  if (operation === 'drive_metadata') return metadata;
  if (metadata.capabilities?.canDownload === false) throw Error('google_download_denied');
  const exported = EXPORTS[metadata.mimeType];
  const mimeType = exported?.[0] ?? metadata.mimeType;
  const extension = exported?.[1] ?? EXTENSIONS[mimeType];
  if (!extension) throw Error('unsupported_file_type');
  if (!exported && Number(metadata.size) > FILE_LIMIT) throw Error('file_too_large');
  const download = new URL(`${FILES}/${id}${exported ? '/export' : ''}`);
  download.search = new URLSearchParams(exported ? { mimeType } : { alt: 'media', supportsAllDrives: 'true' });
  const bytes = await request(download, key, FILE_LIMIT, signal, fetchImpl);
  return {
    ...metadata, sourceMimeType: metadata.mimeType, mimeType, extension,
    bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    encoding: 'base64', content_base64: bytes.toString('base64'),
  };
}
