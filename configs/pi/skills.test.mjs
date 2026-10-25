import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import YAML from 'yaml';
import { DefaultResourceLoader, SettingsManager } from '@earendil-works/pi-coding-agent';
import * as runtime from './runtime.mjs';

const { prepareRuntime, repoDir, sourceDir } = runtime;
const localOverrides = new Map([
  ['sudo-ssh-freyr', path.join(repoDir, '.omp/skills/sudo-ssh-freyr/SKILL.md')],
  ['sudo-ssh-mimer', path.join(repoDir, '.omp/skills/sudo-ssh-mimer/SKILL.md')],
  ['syncing-vps-dotfiles', path.join(repoDir, '.omp/skills/syncing-vps-dotfiles/SKILL.md')],
  ['using-gimle-browser', path.join(sourceDir, 'skills/using-gimle-browser/SKILL.md')],
]);

async function sharedCatalogue() {
  const mapping = JSON.parse(await readFile(path.join(repoDir, 'volundr/docs/skill-mapping.json'), 'utf8'));
  const files = Object.keys(mapping.outputs).filter(file => /^skills\/[^/]+\/SKILL\.md$/.test(file));
  return Promise.all(files.map(async file => {
    const text = await readFile(path.join(repoDir, 'volundr', file), 'utf8');
    return YAML.parse(text.match(/^---\r?\n([\s\S]*?)\r?\n---/)[1]);
  }));
}

test('native loader uses pinned active Volundr skills once, with documented local overrides', async () => {
  const agentDir = await mkdtemp(path.join(os.tmpdir(), 'pi-skills-test-'));
  try {
    // Outside config: no ignored project skills may mask the pinned catalogue.
    const cwd = agentDir;
    await prepareRuntime({ agentDir, env: { ...process.env, NEO_PROXY_URL: 'https://proxy.invalid/v1' }, ompDir: path.join(agentDir, 'absent') });
    const manager = SettingsManager.create(cwd, agentDir, { projectTrusted: true });
    const loader = new DefaultResourceLoader({ cwd, agentDir, settingsManager: manager });
    await loader.reload();
    const { skills, diagnostics } = loader.getSkills();
    assert.deepEqual(diagnostics, []);
    assert.equal(new Set(skills.map(skill => skill.name)).size, skills.length);
    const byName = new Map(skills.map(skill => [skill.name, skill]));
    for (const entry of await sharedCatalogue()) {
      if (entry.metadata.status === 'archived' || entry.name === 'using-freyr-browser') {
        assert.equal(byName.has(entry.name), false, `${entry.name} must stay archived`);
      } else {
        const expected = localOverrides.get(entry.name) ?? path.join(repoDir, 'volundr/skills', entry.name, 'SKILL.md');
        assert.equal(byName.get(entry.name)?.filePath, expected, entry.name);
      }
    }
    assert.ok(byName.has('pi-subagents'));
    assert.ok(byName.has('pi-interactive-shell'));
  } finally { await rm(agentDir, { recursive: true, force: true }); }
});

async function fixtureSkill(root, relative, name, status) {
  const file = path.join(root, relative, name, 'SKILL.md');
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `---\nname: ${name}\ndescription: Fixture skill\n${status ? `metadata:\n  status: ${status}\n` : ''}---\n\nFixture.\n`);
  return file;
}

test('skill selection preserves local-only names, project precedence and archive exclusions', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'pi-skill-selection-'));
  try {
    const shared = await fixtureSkill(rootDir, 'volundr/skills', 'shared', 'active');
    await fixtureSkill(rootDir, 'volundr/skills', 'old', 'archived');
    await fixtureSkill(rootDir, 'volundr/skills', 'project-choice', 'active');
    await fixtureSkill(rootDir, '.omp/skills', 'shared');
    await fixtureSkill(rootDir, '.omp/skills', 'old');
    const local = await fixtureSkill(rootDir, '.omp/skills', 'local-only');
    const cwd = path.join(rootDir, 'project');
    await fixtureSkill(cwd, '.pi/skills', 'project-choice');
    const selected = runtime.canonicalSkillPaths({ rootDir, cwd });
    assert.deepEqual(selected.sort(), [shared, local].sort());
  } finally { await rm(rootDir, { recursive: true, force: true }); }
});

test('Pi browser override survives an archived or absent shared browser guide', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'pi-browser-override-'));
  try {
    await fixtureSkill(rootDir, 'volundr/skills', 'shared', 'active');
    const browser = await fixtureSkill(rootDir, 'configs/pi/skills', 'using-gimle-browser');
    assert.ok(runtime.canonicalSkillPaths({ rootDir, cwd: rootDir }).includes(browser));
    await fixtureSkill(rootDir, 'volundr/skills', 'using-gimle-browser', 'archived');
    assert.ok(runtime.canonicalSkillPaths({ rootDir, cwd: rootDir }).includes(browser));
  } finally { await rm(rootDir, { recursive: true, force: true }); }
});

test('missing Volundr initialization fails with the exact recovery command', async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'pi-missing-skills-'));
  try {
    assert.throws(() => runtime.canonicalSkillPaths({ rootDir, cwd: rootDir }), /git submodule update --init -- volundr/);
  } finally { await rm(rootDir, { recursive: true, force: true }); }
});
