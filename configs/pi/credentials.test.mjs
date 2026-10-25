import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { loadMuninnCredential } from './credentials.mjs';

test('loads only the missing Muninn token from a private literal export', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-credential-'));
  try {
    await fs.mkdir(path.join(home, 'config'));
    const source = path.join(home, 'config/nix_secrets');
    await fs.writeFile(source, "export OTHER_SECRET='never-import'\nexport MUNINN_MCP_TOKEN='synthetic-value'\n", { mode: 0o600 });
    const env = {};
    assert.equal(await loadMuninnCredential({ homeDir: home, env }), true);
    assert.deepEqual(env, { MUNINN_MCP_TOKEN: 'synthetic-value' });
    env.MUNINN_MCP_TOKEN = 'existing';
    assert.equal(await loadMuninnCredential({ homeDir: home, env }), false);
    assert.equal(env.MUNINN_MCP_TOKEN, 'existing');
    await fs.writeFile(source, 'export MUNINN_MCP_TOKEN=$(touch /never-run)\n');
    assert.equal(await loadMuninnCredential({ homeDir: home, env: {} }), false);
    await fs.writeFile(source, "export MUNINN_MCP_TOKEN='synthetic-value'\n");
    await fs.chmod(source, 0o666);
    await assert.rejects(loadMuninnCredential({ homeDir: home, env: {} }), /Unsafe credential file permissions/);
  } finally {
    await fs.rm(home, { recursive: true, force: true });
  }
});

test('missing secrets file leaves environment unchanged', async () => {
  const env = {};
  assert.equal(await loadMuninnCredential({ homeDir: '/nonexistent-pi-credential-home', env }), false);
  assert.deepEqual(env, {});
});
