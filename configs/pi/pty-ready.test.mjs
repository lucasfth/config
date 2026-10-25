import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { waitForSessionReady } from './pty-ready.mjs';

test('session readiness is retained even when the child was ready before waiting', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'pi-ready-test-'));
  try {
    const file = path.join(dir, 'session-id');
    await writeFile(file, 'session-17');
    assert.equal(await waitForSessionReady(file, 50), 'session-17');
    await rm(file);
    await assert.rejects(waitForSessionReady(file, 10), /deadline/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
