import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createAgentSession, createBashTool, SessionManager, initTheme } from '@earendil-works/pi-coding-agent';
import { prepareRuntime } from './runtime.mjs';

test('user commands load interactive zsh aliases without changing the model bash tool', { timeout: 30000 }, async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'pi-user-shell-'));
  const previousZdotdir = process.env.ZDOTDIR;
  let session;
  try {
    await writeFile(path.join(dir, '.zshrc'), "alias gst='printf ZSH_ALIAS_OK'\n");
    process.env.ZDOTDIR = dir;
    const { settings } = await prepareRuntime({ agentDir: dir, env: { NEO_PROXY_URL: 'http://127.0.0.1:9/v1' }, ompDir: path.join(dir, 'absent') });
    const extensions = settings.extensions.filter(file => file.endsWith('/user-shell.ts'));
    assert.equal(extensions.length, 1, 'runtime must load the user shell hook');
    await writeFile(path.join(dir, 'settings.json'), JSON.stringify({ ...settings, packages: [], skills: [], extensions }));
    await writeFile(path.join(dir, 'mcp.json'), JSON.stringify({ mcpServers: {} }));
    initTheme('dark', false);
    const loaded = await createAgentSession({ cwd: dir, agentDir: dir, sessionManager: SessionManager.inMemory(dir) });
    session = loaded.session;
    assert.deepEqual(loaded.extensionsResult.errors, []);
    await session.bindExtensions({ mode: 'print' });
    const run = async (command, excludeFromContext = false) => {
      const handled = await session.extensionRunner.emitUserBash({ type: 'user_bash', command, excludeFromContext, cwd: dir });
      assert.ok(handled?.operations, 'user commands must receive zsh operations');
      return session.executeBash(command, undefined, { operations: handled.operations, excludeFromContext });
    };
    assert.equal((await run('echo ok')).output.trim(), 'ok');
    for (const excluded of [false, true]) {
      const result = await run('gst', excluded);
      assert.equal(result.exitCode, 0);
      assert.equal(result.output, 'ZSH_ALIAS_OK');
      assert.equal(session.state.messages.at(-1).excludeFromContext, excluded);
    }
    const literal = "single ' double \" dollar $HOME backtick `echo nope`\nnext line";
    const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
    assert.equal((await run(`printf '%s' ${quote(literal)}`)).output, literal);
    assert.equal((await run('exit 23')).exitCode, 23);
    const modelResult = await createBashTool(dir).execute('bash-proof', { command: 'printf "%s" "$BASH_VERSION"' });
    assert.ok(modelResult.content.some(part => part.type === 'text' && /^\d+\./.test(part.text)), 'model tool remains bash');
    const handled = await session.extensionRunner.emitUserBash({ type: 'user_bash', command: 'sleep 10', excludeFromContext: false, cwd: dir });
    await assert.rejects(handled.operations.exec('sleep 10', dir, { onData() {}, timeout: 0.1 }), /timeout:/);
    const started = new Promise(resolve => {
      session.subscribe(event => { if (event.type === 'bash_execution_update' && event.delta.includes('READY')) resolve(); });
    });
    const running = run('echo READY; sleep 10');
    await started;
    session.abortBash();
    assert.equal((await running).cancelled, true);
  } finally {
    session?.dispose();
    if (previousZdotdir === undefined) delete process.env.ZDOTDIR;
    else process.env.ZDOTDIR = previousZdotdir;
    await rm(dir, { recursive: true, force: true });
  }
});
