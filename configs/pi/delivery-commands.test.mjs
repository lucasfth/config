import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { DefaultResourceLoader, SettingsManager } from '@earendil-works/pi-coding-agent';
import { prepareRuntime, repoDir } from './runtime.mjs';
const { expandPromptTemplate } = await import(new URL('./core/prompt-templates.js', import.meta.resolve('@earendil-works/pi-coding-agent')));

test('delivery slash commands resolve once to canonical shared skills in a fresh native loader', async () => {
  const agentDir = await mkdtemp(path.join(os.tmpdir(), 'pi-delivery-commands-'));
  try {
    await prepareRuntime({ agentDir, env: { ...process.env, NEO_PROXY_URL: 'https://proxy.invalid/v1' }, ompDir: path.join(agentDir, 'absent') });
    const settingsManager = SettingsManager.create(agentDir, agentDir, { projectTrusted: true });
    const loader = new DefaultResourceLoader({ cwd: agentDir, agentDir, settingsManager });
    await loader.reload();
    const { skills, diagnostics } = loader.getSkills();
    assert.deepEqual(diagnostics, []);
    const prompts = loader.getPrompts();
    assert.deepEqual(prompts.diagnostics, []);
    for (const name of ['done', 'review', 'full-send', 'full-stop']) {
      assert.equal(skills.filter(s => s.name === name).length, 1, `skill ${name}`);
      assert.equal(skills.find(s => s.name === name).filePath, path.join(repoDir, `volundr/skills/${name}/SKILL.md`));
      assert.equal(prompts.prompts.filter(p => p.name === name).length, 1, `prompt ${name}`);
      const expanded = expandPromptTemplate(`/${name} current task`, prompts.prompts);
      assert.ok(expanded.includes('`' + name + '` skill'));
      assert.match(expanded, /current task/);
      assert.match(expanded, /approval/);
      assert.notEqual(expanded, `/${name} current task`);
    }
    assert.match(expandPromptTemplate('/full-stop', prompts.prompts), /Never merge/);
    assert.match(expandPromptTemplate('/done', prompts.prompts), /if something went wrong/);
  } finally { await rm(agentDir, { recursive: true, force: true }); }
});