import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { DefaultResourceLoader, SettingsManager } from '@earendil-works/pi-coding-agent';
import { prepareRuntime, sourceDir } from './runtime.mjs';

const coreUrl = name => new URL(`./core/${name}.js`, import.meta.resolve('@earendil-works/pi-coding-agent'));
const { expandPromptTemplate } = await import(coreUrl('prompt-templates'));
const { formatSkillsForPrompt } = await import(coreUrl('skills'));

test('/retro loads a single explicit-only Huginn skill and preserves prompt settings across preparation', async () => {
  const agentDir = await mkdtemp(path.join(os.tmpdir(), 'pi-retro-'));
  try {
    const customPrompt = path.join(agentDir, 'custom.md');
    await writeFile(customPrompt, 'A retained user prompt.\n');
    const managedNames = ['aar', 'retro', 'done', 'review', 'full-send', 'full-stop'];
    const stalePrompts = managedNames.map(name => path.join(agentDir, 'config-candidate/configs/pi/prompts', `${name}.md`));
    const customReview = path.join(agentDir, 'review.md');
    await writeFile(customReview, 'A custom prompt with a managed command name.\n');
    await writeFile(path.join(agentDir, 'settings.json'), JSON.stringify({ prompts: [customPrompt, customReview, ...stalePrompts] }));
    const options = { agentDir, env: { NEO_PROXY_URL: 'https://proxy.invalid/v1' }, ompDir: path.join(agentDir, 'absent') };
    await prepareRuntime(options);
    const { settings } = await prepareRuntime(options);
    assert.ok(settings.prompts.includes(customPrompt));
    assert.equal(settings.prompts.filter(p => p === path.join(sourceDir, 'prompts/retro.md')).length, 1);
    assert.ok(settings.prompts.includes(customReview));
    assert.equal(settings.prompts.length, managedNames.length + 2);
    assert.ok(stalePrompts.every(p => !settings.prompts.includes(p)));
    const loader = new DefaultResourceLoader({
      cwd: agentDir, agentDir,
      settingsManager: SettingsManager.create(agentDir, agentDir, { projectTrusted: true }),
    });
    await loader.reload();
    const { skills, diagnostics } = loader.getSkills();
    assert.deepEqual(diagnostics, []);
    const matches = skills.filter(s => s.name === 'huginn-retro');
    assert.equal(matches.length, 1);
    assert.equal(matches[0].filePath, path.join(sourceDir, 'skills/huginn-retro/SKILL.md'));
    assert.equal(matches[0].disableModelInvocation, true);
    assert.doesNotMatch(formatSkillsForPrompt(skills), /<name>huginn-retro<\/name>/);
    const { prompts, diagnostics: promptDiagnostics } = loader.getPrompts();
    // A genuine custom /review is retained, even though it collides by command name.
    assert.deepEqual(promptDiagnostics.map(d => d.type), ['collision']);
    assert.equal(prompts.filter(p => p.name === 'retro').length, 1);
    for (const [command, focus] of [
      ['/retro', 'the current task or session'],
      ['/retro context bloat', 'context bloat'],
      ['/retro "tool output" navigation', 'tool output navigation'],
    ]) {
      const expanded = expandPromptTemplate(command, prompts);
      assert.notEqual(expanded, command);
      assert.match(expanded, /`huginn-retro` skill/);
      assert.ok(expanded.includes('~/config/configs/pi/skills/huginn-retro/SKILL.md'));
      assert.ok(expanded.includes(`Focus: ${focus}`));
      assert.match(expanded, /proposal-only/);
      assert.doesNotMatch(expanded, /`aar` skill/);
    }
    const skill = await readFile(matches[0].filePath, 'utf8');
    assert.match(skill, /context bloat/i);
    assert.match(skill, /reproducible failure/i);
    assert.match(skill, /baseline.*regression check/i);
    assert.match(skill, /helped.*failed.*unverified/i);
    assert.match(skill, /verify:behaviour/);
    assert.match(skill, /separately approved implementation/i);
  } finally { await rm(agentDir, { recursive: true, force: true }); }
});
