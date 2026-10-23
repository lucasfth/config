import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { DefaultResourceLoader, SettingsManager } from '@earendil-works/pi-coding-agent';
import { prepareRuntime, repoDir } from './runtime.mjs';

const { expandPromptTemplate } = await import(new URL('./core/prompt-templates.js', import.meta.resolve('@earendil-works/pi-coding-agent')));
const body = text => text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').trim();

test('AAR compatibility mirror matches the shared body with no exceptions', async () => {
  const mirrors = JSON.parse(await readFile(path.join(repoDir, 'configs/pi/skill-mirrors.json'), 'utf8'));
  assert.deepEqual(mirrors.aar.exceptions, []);
  const local = await readFile(path.join(repoDir, mirrors.aar.local), 'utf8');
  const shared = await readFile(path.join(repoDir, mirrors.aar.shared), 'utf8');
  assert.equal(body(local), body(shared));
  assert.match(local, /^name: aar$/m);
  assert.match(shared, /^name: aar$/m);
  const localStorage = await readFile(path.join(repoDir, '.omp/skills/aar/references/muninn.md'), 'utf8');
  const sharedStorage = await readFile(path.join(repoDir, 'volundr/skills/aar/references/muninn.md'), 'utf8');
  assert.equal(localStorage, sharedStorage);
});

test('/aar expands through the native loader to the shared aar skill independently of /retro', async () => {
  const agentDir = await mkdtemp(path.join(os.tmpdir(), 'pi-aar-command-'));
  try {
    await prepareRuntime({ agentDir, env: { ...process.env, NEO_PROXY_URL: 'https://proxy.invalid/v1' }, ompDir: path.join(agentDir, 'absent') });
    const settingsManager = SettingsManager.create(agentDir, agentDir, { projectTrusted: true });
    const loader = new DefaultResourceLoader({ cwd: agentDir, agentDir, settingsManager });
    await loader.reload();
    const { skills, diagnostics } = loader.getSkills();
    assert.deepEqual(diagnostics, []);
    assert.equal(skills.filter(s => s.name === 'aar').length, 1);
    assert.equal(skills.find(s => s.name === 'aar').filePath, path.join(repoDir, 'volundr/skills/aar/SKILL.md'));
    assert.equal(skills.some(s => s.name === 'retro'), false);
    const prompts = loader.getPrompts();
    assert.deepEqual(prompts.diagnostics, []);
    assert.equal(prompts.prompts.filter(p => p.name === 'aar').length, 1);
    const expanded = expandPromptTemplate('/aar release verification', prompts.prompts);
    assert.match(expanded, /`aar` skill/);
    assert.match(expanded, /release verification/);
    assert.notEqual(expanded, '/aar release verification');
    const retro = expandPromptTemplate('/retro', prompts.prompts);
    assert.notEqual(retro, '/retro');
    assert.match(retro, /`huginn-retro` skill/);
    assert.doesNotMatch(retro, /`aar` skill/);
  } finally { await rm(agentDir, { recursive: true, force: true }); }
});
