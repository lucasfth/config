import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { spawn } from 'zigpty';
import path from 'node:path';
import os from 'node:os';
import { prepareRuntime, sourceDir, repoDir } from './runtime.mjs';

// Uses the existing OMP catalogue cache, never live completions or live Pi state.
const agentDir = await mkdtemp(path.join(os.tmpdir(), 'pi-catalogue-'));
const env = Object.fromEntries(['PATH', 'HOME', 'USER', 'SHELL', 'TMPDIR', 'LANG'].filter(key => process.env[key]).map(key => [key, process.env[key]]));
Object.assign(env, { PI_CODING_AGENT_DIR: agentDir, NEO_PROXY_URL: 'http://127.0.0.1:9/v1', NEO_PROXY_API_KEY: 'synthetic-only', PI_OFFLINE: '1', PI_TELEMETRY: '0', TERM: 'xterm-256color' });
const pause = () => new Promise(resolve => setTimeout(resolve, 150));
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
let pty, raw = '';
try {
  await prepareRuntime({ agentDir, env });
  const models = JSON.parse(await readFile(path.join(agentDir, 'models.json'), 'utf8')).providers['neo-proxy'].models;
  assert.ok(models.length > 4, 'Catalogue cache must contain models beyond the four role defaults');
  pty = spawn(process.execPath, [path.join(sourceDir, 'launch.mjs'), '--offline', '--no-mcp', '--no-session', '--approve'], { cwd: repoDir, env, cols: 140, rows: 42 });
  pty.onData(data => {
    const text = String(data); raw += text;
    if (text.includes('\x1b[c')) pty.write('\x1b[?62;c');
    if (text.includes('\x1b[6n')) pty.write('\x1b[1;1R');
    if (text.includes('\x1b[16t')) pty.write('\x1b[6;20;16t');
  });
  const fresh = (pattern, action) => new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => { subscription.dispose(); reject(new Error('PTY deadline: ' + pattern)); }, 10000);
    const subscription = pty.onData(data => { output += String(data); if (output.includes(pattern)) { clearTimeout(timer); subscription.dispose(); resolve(output); } });
    action();
  });
  await pty.waitFor('Huginn · Pi', { timeout: 20000 });
  const exactRows = [], unverifiedRows = [];
  for (const model of models) {
    await fresh('Type to filter', () => pty.write('/switch\r'));
    const start = raw.length;
    pty.write(model.id);
    await pause();
    const output = raw.slice(start).replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/\x1b\][^\x07]*\x07/g, '');
    const row = new RegExp('^\\s*(?:→\\s*)?' + escapeRegex(model.id) + '\\s+neo-proxy\\s*·[^\\r\\n]*context(?:\\s|$)', 'm');
    (row.test(output) ? exactRows : unverifiedRows).push(model.id);
    pty.write('\x1b');
    // Keep lone Escape separate from subsequent bytes (native parser ambiguity window).
    await pause();
  }
  assert.ok(!/Skill conflicts|description is required|\[Extension issues\]/i.test(raw));
  const exit = new Promise(resolve => pty.onExit(resolve));
  const timer = setTimeout(() => pty.kill(), 5000);
  pty.write('/quit\r');
  const result = await exit; clearTimeout(timer);
  assert.equal(result.exitCode, 0);
  console.log(JSON.stringify({ sourceDir, repoDir, generatedCatalogue: models.length, renderedFilteredRows: exactRows.length, exactRows, unverifiedRows, status: unverifiedRows.length ? 'partial' : 'passed', rowMatch: 'escaped full model id followed by whitespace and provider/context metadata', skillsEnabled: true, contextFilesEnabled: true, mcpEnabled: false, liveProfileRegenerated: false, liveInferenceValidated: false, exitCode: result.exitCode }, null, 2));
} catch (error) {
  console.error(raw.slice(-3000)); throw error;
} finally {
  if (pty?.exitCode === null) { const exit = new Promise(resolve => pty.onExit(resolve)); pty.kill(); await exit; }
  await rm(agentDir, { recursive: true, force: true, maxRetries: 3 });
}
