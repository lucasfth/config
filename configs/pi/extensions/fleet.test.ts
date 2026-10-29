import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, chmodSync, rmSync, symlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { loadFleetConfig, safeFleetLabel } from './fleet.ts';

const token = 'synthetic-fleet-test-token-not-a-real-secret';
test('fleet config is private, exact and HTTPS; diagnostics never contain supplied content', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'fleet-config-'));
  const file = path.join(dir, 'fleet.json');
  try {
    assert.equal(loadFleetConfig(file).status, 'disabled: no fleet.json');
    const config = { endpoint: 'https://portfolio.invalid/api/admin/fleet/report', hostId: 'gimle', token };
    writeFileSync(file, JSON.stringify(config), { mode: 0o600 });
    assert.deepEqual(loadFleetConfig(file), { status: 'configured', config });
    for (const bad of [
      { ...config, endpoint: 'http://127.0.0.1/api/admin/fleet/report' },
      { ...config, endpoint: 'https://user:password@portfolio.invalid/api/admin/fleet/report' },
      { ...config, endpoint: config.endpoint + '?secret=canary' },
      { ...config, hostId: 'other' }, { ...config, token: 'short' }, { ...config, extra: true },
    ]) {
      writeFileSync(file, JSON.stringify(bad));
      assert.deepEqual(loadFleetConfig(file), { status: 'disabled: invalid fleet.json' });
    }
    writeFileSync(file, JSON.stringify(config));
    chmodSync(file, 0o644);
    assert.equal(loadFleetConfig(file).status, 'disabled: fleet.json must be an owned private regular file (0600)');
    chmodSync(file, 0o600);
    const link = path.join(dir, 'link.json');
    symlinkSync(file, link);
    assert.ok(loadFleetConfig(link).status.startsWith('disabled:'));
    writeFileSync(file, 'x'.repeat(4097));
    assert.equal(loadFleetConfig(file).status, 'disabled: invalid fleet.json');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('fleet labels use the shared trimmed 1–80 ASCII display alphabet', () => {
  for (const label of ['Admin feature', 'Gimle worker 2', 'Gimle-worker_2.0', 'a'.repeat(80), 'Pi session abcdef12']) assert.equal(safeFleetLabel(label), true);
  for (const label of ['', ' ', ' leading', 'trailing ', 'a'.repeat(81), 'Hugi 🐦', 'Café', 'foo/bar', 'foo\nbar', 'foo\tbar', 'foo\u202ebar', 'foo\u200bbar', 'foo\u00adbar', 'foo\u2028bar']) assert.equal(safeFleetLabel(label), false, JSON.stringify(label));
  for (let code = 0; code < 256; code++) {
    const char = String.fromCharCode(code);
    assert.equal(safeFleetLabel(`A${char}Z`), /^[A-Za-z0-9 ._-]+$/.test(char), `alphabet code ${code}`);
  }
});

test('token-only private config uses tracked known-host defaults; legacy full config still wins', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'fleet-default-'));
  const file = path.join(dir, 'fleet.json');
  try {
    writeFileSync(file, JSON.stringify({ token }), { mode: 0o600 });
    assert.deepEqual(loadFleetConfig(file, false, 'gimle').config, { endpoint: 'https://lucashanson.dk/api/admin/fleet/report', hostId: 'gimle', token });
    assert.equal(loadFleetConfig(file, false, 'lucas-macbook-pro.local').config?.hostId, 'macbook');
    assert.equal(loadFleetConfig(file, false, 'unknown-host').config, undefined);
    writeFileSync(file, JSON.stringify({ token, hostId: 'gimle' }));
    assert.equal(loadFleetConfig(file, false, 'gimle').config, undefined, 'partial overrides rejected');
    writeFileSync(file, JSON.stringify({ token, endpoint: 'https://wrong.invalid/api/admin/fleet/report' }));
    assert.equal(loadFleetConfig(file, false, 'gimle').config, undefined, 'token-only endpoint override rejected');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
