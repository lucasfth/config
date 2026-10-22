import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import test from 'node:test';
import path from 'node:path';
import os from 'node:os';
import { sourceDir } from './runtime.mjs';
import { lstat, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';

// Read-only extensions snapshot; never follows symlinks or watches active session files.
async function snapshot(directory) {
  const entries = new Map();
  async function visit(file) {
    let stat;
    try { stat = await lstat(file, { bigint: true }); }
    catch (error) { if (error.code === 'ENOENT') return; throw error; }
    entries.set(path.relative(directory, file), [stat.mode, stat.size, stat.mtimeNs, stat.ctimeNs]);
    if (stat.isDirectory()) for (const name of (await readdir(file)).sort()) await visit(path.join(file, name));
  }
  await visit(directory);
  return entries;
}

test('interactive shell launches an isolated managed profile without changing live extensions', async () => {
  const agentDir = await mkdtemp(path.join(os.tmpdir(), 'pi-entrypoint-'));
  const liveDir = process.env.PI_CODING_AGENT_DIR || path.join(os.homedir(), '.local/share/huginn-pi/agent');
  const liveExtensions = path.join(liveDir, 'extensions');
  const before = await snapshot(liveExtensions);
  const env = { ...process.env, PI_CODING_AGENT_DIR: agentDir };
  for (const key of ['HERDR_ENV', 'HERDR_SOCKET_PATH', 'HERDR_PANE_ID', 'HERDR_BIN_PATH']) delete env[key];
  try {
    const output = await new Promise((resolve, reject) => {
      // Reassert isolation after interactive startup, which may source user environment files.
      const command = 'export PI_CODING_AGENT_DIR="$1"; unset HERDR_ENV HERDR_SOCKET_PATH HERDR_PANE_ID HERDR_BIN_PATH; whence -w pi pi-native; pi --version; pi-native --version; whence -p pi';
      const child = spawn('zsh', ['-lic', command, 'pi-entrypoint-test', agentDir], {
        cwd: path.resolve(sourceDir, '../..'), env, stdio: ['ignore', 'pipe', 'pipe'],
      });
      let text = '', error = '';
      child.stdout.on('data', chunk => { text += chunk; });
      child.stderr.on('data', chunk => { error += chunk; });
      child.on('error', reject);
      child.on('exit', code => code === 0 ? resolve(text) : reject(new Error(error)));
    });
    assert.match(output, /pi: function/);
    assert.match(output, /pi-native: function/);
    const installed = JSON.parse(await readFile(path.join(sourceDir, 'node_modules/@earendil-works/pi-coding-agent/package.json'), 'utf8'));
    assert.equal(output.split(installed.version).length - 1, 2);
    const globalExecutable = output.trim().split('\n').at(-1);
    assert.ok(globalExecutable);
    assert.notEqual(globalExecutable, path.resolve(sourceDir, '../../scripts/pi-native'));
    assert.ok(await readFile(path.join(agentDir, 'AGENTS.md'), 'utf8'));
    await assert.rejects(lstat(path.join(agentDir, 'extensions/herdr-agent-state.ts')), { code: 'ENOENT' });
  } finally {
    await rm(agentDir, { recursive: true, force: true });
    assert.deepEqual(await snapshot(liveExtensions), before, 'entrypoint test must not mutate live extensions');
  }
});
