import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { prepareRuntime, sourceDir } from './runtime.mjs';

test('temporary profile loads only Gimle browser and its canonical policy/skill', async () => {
  const agentDir = await mkdtemp(path.join(os.tmpdir(), 'pi-gimle-migration-'));
  try {
    const { settings } = await prepareRuntime({ agentDir, env: { NEO_PROXY_URL: 'https://proxy.invalid/v1' }, ompDir: path.join(agentDir, 'absent') });
    assert.ok(settings.extensions.includes(path.join(sourceDir, 'extensions/gimle.ts')));
    assert.ok(!settings.extensions.some(file => file.endsWith('/freyr.ts')));
    assert.ok(settings.skills.includes(path.join(sourceDir, 'skills/using-gimle-browser/SKILL.md')));
    assert.ok(!settings.skills.some(file => file.includes('/using-freyr-browser/')));
    const instructions = await readFile(path.join(agentDir, 'AGENTS.md'), 'utf8');
    assert.match(instructions, /loki_browser/);
    assert.doesNotMatch(instructions, /freyr_browser|gimle_browser/);
    assert.match(instructions, /credentials\/2FA/);
    const skill = await readFile(path.join(sourceDir, 'skills/using-gimle-browser/SKILL.md'), 'utf8');
    assert.match(skill, /loki_browser/);
    assert.doesNotMatch(skill, /gimle_browser/);
    assert.match(skill, /9444/);
    assert.match(skill, /approval/);
    assert.doesNotMatch(skill, /9333|freyr_browser/);
  } finally { await rm(agentDir, { recursive: true, force: true }); }
});
