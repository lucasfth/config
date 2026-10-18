import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import test from 'node:test';
import path from 'node:path';
import { sourceDir } from './runtime.mjs';
import { readFile } from 'node:fs/promises';

test('interactive shell resolves both managed Pi functions and launches the managed profile', async () => {
  const output = await new Promise((resolve, reject) => {
    const child = spawn('zsh', ['-lic', 'whence -w pi pi-native; pi --version; pi-native --version; whence -p pi'], { cwd: path.resolve(sourceDir, '../..'), stdio: ['ignore','pipe','pipe'] });
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
});
