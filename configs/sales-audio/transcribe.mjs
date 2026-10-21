#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const MAX_BYTES = 20 * 1024 * 1024;
const MAX_RESPONSE = 2 * 1024 * 1024;

export async function transcribe(file, endpoint, fetchImpl = fetch) {
  const url = new URL(endpoint);
  // The operator-owned configuration fixes one Tailnet destination, never a user URL.
  const octets = url.hostname.split('.').map(Number);
  if (url.protocol !== 'http:' || octets.length !== 4 || octets.some(x => !Number.isInteger(x) || x < 0 || x > 255) ||
      octets[0] !== 100 || octets[1] < 64 || octets[1] > 127 || url.port !== '9090' || url.pathname !== '/transcribe' ||
      url.search || url.hash || url.username || url.password) throw Error('invalid_transcription_endpoint');
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  let audio;
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size < 1024 || stat.size > MAX_BYTES) throw Error('invalid_audio_size');
    audio = fs.readFileSync(fd);
    if (audio.length > MAX_BYTES) throw Error('invalid_audio_size');
  } finally { fs.closeSync(fd); }
  const form = new FormData();
  // Do not disclose original customer filenames to the service.
  form.set('file', new Blob([audio], { type: 'application/octet-stream' }), 'voice.bin');
  const response = await fetchImpl(url, { method: 'POST', body: form, redirect: 'error', signal: AbortSignal.timeout(90000) });
  if (!response.ok) {
    await response.body?.cancel();
    throw Error(`transcription_http_${response.status}`);
  }
  const reader = response.body?.getReader();
  if (!reader) throw Error('transcription_empty_response');
  const parts = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_RESPONSE) {
        await reader.cancel();
        throw Error('transcription_response_too_large');
      }
      parts.push(Buffer.from(value));
    }
  } finally { reader.releaseLock(); }
  const result = JSON.parse(Buffer.concat(parts).toString('utf8'));
  if (typeof result.text !== 'string' || !result.text.trim()) throw Error('transcription_no_speech');
  return result.text.trim();
}

async function main() {
  if (process.argv.length !== 4) throw Error('usage: transcribe.mjs CONFIG AUDIO');
  const configPath = process.argv[2];
  const fd = fs.openSync(configPath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  let config;
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.uid !== process.getuid() || (stat.mode & 0o077)) throw Error('private_config_required');
    config = JSON.parse(fs.readFileSync(fd, 'utf8'));
  } finally { fs.closeSync(fd); }
  const file = fs.realpathSync(process.argv[3]);
  if (!Array.isArray(config.mediaRoots) || !config.mediaRoots.some(root => {
    const relative = path.relative(fs.realpathSync(root), file);
    return relative && !relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative);
  })) throw Error('audio_outside_allowed_roots');
  process.stdout.write(await transcribe(file, config.endpoint) + '\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    // Never print upstream bodies, credentials, filenames or partial transcripts.
    const safe = /^(invalid_|transcription_|private_config_required$|audio_outside_allowed_roots$|usage:)/.test(error.message);
    process.stderr.write((safe ? error.message : 'transcription_unavailable') + '\n');
    process.exitCode = 1;
  });
}
