import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, chmod, stat, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { privateEvaluationOutput, writePrivateEvaluation } from './private-evaluation-output.mjs';

test('reject permissive output and create private artifacts', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'private-eval-test-'));
  try {
    await chmod(directory, 0o755);
    await assert.rejects(privateEvaluationOutput(directory), /private/);
    await chmod(directory, 0o700);
    await writePrivateEvaluation(directory, 'trace.json', '{}');
    assert.equal((await stat(path.join(directory, 'trace.json'))).mode & 0o777, 0o600);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
