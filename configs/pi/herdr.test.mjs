import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { prepareRuntime } from './runtime.mjs';

test('Herdr panes install the native Pi hook into the selected private profile on every launch', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'pi-herdr-'));
  try {
    const binary = path.join(dir, 'herdr');
    await writeFile(binary, `#!${process.execPath}
import { appendFileSync, existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
if (process.argv.slice(2).join(' ') !== 'integration install pi') process.exit(2);
const target = path.join(process.env.PI_CODING_AGENT_DIR, 'extensions/herdr-agent-state.ts');
if (!existsSync(path.dirname(target))) process.exit(3);
appendFileSync(target, '// installed by Herdr\\n');
writeFileSync(target + '.env', process.env.HERDR_PANE_ID);
`, { mode: 0o700 });
    const agentDir = path.join(dir, 'agent');
    const env = { NEO_PROXY_URL: 'http://127.0.0.1:9/v1', HERDR_BIN_PATH: binary,
      HERDR_ENV: '1', HERDR_SOCKET_PATH: path.join(dir, 'herdr.sock'), HERDR_PANE_ID: 'w1:p1' };
    const prepare = () => prepareRuntime({ agentDir, env, ompDir: path.join(dir, 'absent') });
    await prepare();
    const hook = path.join(agentDir, 'extensions/herdr-agent-state.ts');
    assert.equal(await readFile(hook, 'utf8'), '// installed by Herdr\n');
    assert.equal(await readFile(hook + '.env', 'utf8'), 'w1:p1');
    await prepare();
    assert.equal(await readFile(hook, 'utf8'), '// installed by Herdr\n// installed by Herdr\n');
    await prepareRuntime({ agentDir: path.join(dir, 'outside'), env: { ...env, HERDR_ENV: undefined }, ompDir: path.join(dir, 'absent') });
    await assert.rejects(readFile(path.join(dir, 'outside/extensions/herdr-agent-state.ts')), { code: 'ENOENT' });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
