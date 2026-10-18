import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const execute = promisify(execFile);
const hostPackages = ['@earendil-works/pi-coding-agent', '@earendil-works/pi-ai', '@earendil-works/pi-agent-core', '@earendil-works/pi-tui'];
const usage = 'Usage: pi update [--check | --help]\nUpdates the repository profile with exact native Pi versions, applies compatibility patches, and verifies it. --check only queries version metadata. Uses a private user-owned npm cache; never updates Homebrew/global Pi.\n';

export function resolveHostUpdate(dependencies, versions) {
  const latest = versions['@earendil-works/pi-coding-agent'];
  if (typeof latest !== 'string' || !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(latest)) throw new Error('Registry returned an invalid native Pi version.');
  for (const name of hostPackages) {
    if (typeof dependencies[name] !== 'string') throw new Error(`Required profile dependency is missing: ${name}`);
    if (versions[name] !== latest) throw new Error(`Native Pi package releases do not agree: ${name} is ${versions[name]}, core is ${latest}. No files changed.`);
  }
  return { version: latest, changed: hostPackages.some(name => dependencies[name] !== latest), install: hostPackages.map(name => `${name}@${latest}`) };
}

export async function updateProfile({ sourceDir, cacheDir, args = [], env = process.env, stdout = text => process.stdout.write(text), stderr = text => process.stderr.write(text) }) {
  if (args.length === 1 && args[0] === '--help') { stdout(usage); return { code: 0 }; }
  if (args.length > 1 || (args.length && args[0] !== '--check')) { stderr(usage); return { code: 2 }; }
  const cache = cacheDir || path.join(env.HOME || os.homedir(), '.cache/huginn-pi/npm');
  const manifestPath = path.join(sourceDir, 'package.json');
  const lockPath = path.join(sourceDir, 'package-lock.json');
  await mkdir(cache, { recursive: true, mode: 0o700 });
  const run = async argv => {
    const result = await execute('npm', [...argv, '--cache', cache], { cwd: sourceDir, env: { ...env, npm_config_cache: cache }, maxBuffer: 32 * 1024 * 1024, timeout: 300000 });
    if (result.stdout) stdout(result.stdout);
    if (result.stderr) stderr(result.stderr);
  };
  let originalManifest, originalLock, attempted = false;
  try {
    originalManifest = await readFile(manifestPath, 'utf8');
    originalLock = await readFile(lockPath, 'utf8');
    const manifest = JSON.parse(originalManifest);
    const versions = {};
    // Inspect the complete synchronized host release before changing any pins.
    await Promise.all(hostPackages.map(async name => {
      const result = await execute('npm', ['view', `${name}@latest`, 'version', '--cache', cache], { cwd: sourceDir, env: { ...env, npm_config_cache: cache }, timeout: 30000, maxBuffer: 1024 * 1024 });
      versions[name] = result.stdout.trim();
    }));
    const plan = resolveHostUpdate(manifest.dependencies, versions);
    for (const name of hostPackages) stdout(`${name}: current ${manifest.dependencies[name]}, latest ${versions[name]}\n`);
    if (args[0] === '--check') return { code: 0 };
    stdout(plan.changed ? `Updating native Pi to ${plan.version}; previous pins will be restored if verification fails.\n` : `Native Pi ${plan.version} is current; checking the locked installation.\n`);
    attempted = true;
    await run(plan.changed ? ['install', '--save-exact', '--ignore-scripts', '--no-audit', '--no-fund', ...plan.install] : ['ci', '--ignore-scripts', '--no-audit', '--no-fund']);
    for (const command of [['run', 'setup'], ['run', 'typecheck'], ['test'], ['run', 'verify:integration']]) await run(command);
    stdout(`Pi ${plan.version} profile update and verification succeeded.\n`);
    return { code: 0 };
  } catch (error) {
    stderr(`Pi profile update failed: ${error.message}\n`);
    if (error.stdout) stderr(error.stdout);
    if (error.stderr) stderr(error.stderr);
    if (attempted && originalManifest && originalLock) {
      await writeFile(manifestPath, originalManifest);
      await writeFile(lockPath, originalLock);
      try {
        await run(['ci', '--ignore-scripts', '--no-audit', '--no-fund']);
        await run(['run', 'setup']);
        stdout('Restored the previous locked profile after the failed update.\n');
      } catch (rollbackError) {
        stderr(`Previous pins restored, but dependency restoration failed: ${rollbackError.message}\nRun npm ci --ignore-scripts --cache ${JSON.stringify(cache)} and npm run setup in ${sourceDir}.\n`);
      }
    }
    return { code: 1 };
  }
}
