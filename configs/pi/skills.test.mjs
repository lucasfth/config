import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { DefaultResourceLoader, SettingsManager } from '@earendil-works/pi-coding-agent';
import { prepareRuntime, repoDir, sourceDir } from './runtime.mjs';

test('native loader discovers canonical skills once without duplicate diagnostics', async () => {
  const agentDir = await mkdtemp(path.join(os.tmpdir(), 'pi-skills-test-'));
  try {
    const cwd = repoDir;
    await prepareRuntime({ agentDir, env: { ...process.env, NEO_PROXY_URL: 'https://proxy.invalid/v1' }, ompDir: path.join(agentDir, 'absent') });
    const manager = SettingsManager.create(cwd, agentDir, { projectTrusted: true });
    const loader = new DefaultResourceLoader({ cwd, agentDir, settingsManager: manager });
    await loader.reload();
    const { skills, diagnostics } = loader.getSkills();
    assert.deepEqual(diagnostics, []);
    assert.equal(skills.filter(skill => skill.name === 'typesafe-ai').length, 1);
    assert.equal(skills.filter(skill => skill.name === 'using-freyr-browser').length, 1);
    assert.equal(skills.find(skill => skill.name === 'using-freyr-browser').filePath, path.join(sourceDir, 'skills', 'using-freyr-browser', 'SKILL.md'));
  } finally { await rm(agentDir, { recursive: true, force: true }); }
});
