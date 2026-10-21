import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { FILE_LIMIT } from './drive.mjs';

// This boundary consumes transport bytes. Only the receipt reaches the agent.
export function saveDriveDownload(workspace, body, expectedId) {
  const d = body.data;
  if (!d || d.id !== expectedId || d.encoding !== 'base64' ||
      !Number.isSafeInteger(d.bytes) || d.bytes < 0 || d.bytes > FILE_LIMIT ||
      !/^[a-f0-9]{64}$/.test(d.sha256) || !/^\.(pdf|xlsx|docx|jpg|png|webp|tiff|txt|csv)$/.test(d.extension) ||
      typeof d.content_base64 !== 'string' || d.content_base64.length !== 4 * Math.ceil(d.bytes / 3) ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(d.content_base64)) throw Error('google_file_receipt_invalid');
  const bytes = Buffer.from(d.content_base64, 'base64');
  if (bytes.length !== d.bytes || crypto.createHash('sha256').update(bytes).digest('hex') !== d.sha256) throw Error('google_file_integrity_invalid');
  const root = fs.realpathSync(workspace);
  const directory = fs.mkdtempSync(path.join(root, '.drive-'));
  fs.chmodSync(directory, 0o700);
  const filename = path.join(directory, 'document' + d.extension);
  try {
    fs.writeFileSync(filename, bytes, { mode: 0o600, flag: 'wx' });
  } catch (error) {
    fs.rmSync(directory, { recursive: true });
    throw error;
  }
  const { content_base64, encoding, ...metadata } = d;
  return {
    ...body, data: { ...metadata, path: path.relative(root, filename), downloadStoredLocally: true },
    googleWrites: false, localFileCreated: true,
  };
}
