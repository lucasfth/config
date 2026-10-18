import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { sourceDir, prepareRuntime } from './runtime.mjs';
import { updateProfile } from './update.mjs';

const agentDir = process.env.PI_CODING_AGENT_DIR || path.join(os.homedir(), '.local/share/huginn-pi/agent');
const env = {
  ...process.env,
  PI_CODING_AGENT_DIR: agentDir,
  PI_SUBAGENTS_PI_CODING_AGENT_PACKAGE_ROOT: path.join(sourceDir, 'node_modules/@earendil-works/pi-coding-agent'),
  PI_TELEMETRY: '0',
  PI_ALLOW_BROWSER_COOKIES: '0',
  FEYNMAN_ALLOW_BROWSER_COOKIES: '0',
  npm_config_cache: path.join(os.homedir(), '.cache/huginn-pi/npm'),
};
try {
  if (process.argv[2] === 'update') {
    const result = await updateProfile({ sourceDir, cacheDir: env.npm_config_cache, args: process.argv.slice(3), env });
    process.exitCode = result.code;
  } else {
    await prepareRuntime({ agentDir, env, ...(env.HUGINN_OMP_AGENT_DIR ? { ompDir: env.HUGINN_OMP_AGENT_DIR } : {}) });
    const cli = path.join(sourceDir, 'host-entry.mjs');
    const child = spawn(process.execPath, [cli, ...process.argv.slice(2)], { env, stdio: 'inherit' });
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => child.kill(signal));
    child.on('error', error => { console.error(error.message); process.exitCode = 1; });
    child.on('exit', (code, signal) => { if (signal) process.kill(process.pid, signal); else process.exitCode = code ?? 1; });
  }
} catch (error) {
  console.error(`pi-native: ${error.message}`);
  process.exitCode = 1;
}
