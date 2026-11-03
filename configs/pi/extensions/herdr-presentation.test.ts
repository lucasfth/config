import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { installHerdrPresentation } from './herdr-presentation.ts';

test('Herdr presentation sends explicit Hugi identity and refreshed titles through the real socket', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'hugi-view-'));
  const socket = path.join(dir, 'api.sock');
  const requests: any[] = [];
  const server = net.createServer(connection => {
    let data = '';
    connection.on('data', chunk => {
      data += chunk;
      if (!data.includes('\n')) return;
      const request = JSON.parse(data.split('\n')[0]);
      requests.push(request);
      connection.end(JSON.stringify({ id: request.id, ok: true, result: {} }) + '\n');
    });
  });
  await new Promise<void>(resolve => server.listen(socket, resolve));
  const handlers = new Map<string, Function>();
  const events: any[] = [];
  let name: string | undefined = 'First title';
  const pi = {
    on: (event: string, handler: Function) => handlers.set(event, handler),
    getSessionName: () => name,
    events: { emit: (event: string, data: unknown) => events.push({ event, data }) },
  } as unknown as ExtensionAPI;
  const env = { HERDR_ENV: '1', HERDR_SOCKET_PATH: socket, HERDR_PANE_ID: 'w1:p1' };
  try {
    installHerdrPresentation(pi, env);
    assert.equal(requests.length, 0, 'factory must not open a socket');
    await handlers.get('session_start')!({}, { mode: 'rpc' });
    assert.equal(requests.length, 0, 'headless sessions must not overwrite pane identity');
    await handlers.get('session_start')!({}, { mode: 'tui' });
    const first = requests.at(-1).params;
    assert.equal(first.agent, 'pi');
    assert.equal(first.applies_to_source, 'herdr:pi');
    assert.equal(first.tokens.agent_profile, 'huginn');
    assert.equal(first.display_agent, 'huginn');
    assert.equal(first.ttl_ms, 90_000, 'presentation expires if the runtime crashes');
    assert.equal(first.title, 'First title');
    assert.equal(first.state, undefined, 'presentation does not compete with the stock state hook');
    name = '\x1b[31mRenamed\x1b[0m\n session';
    await handlers.get('agent_start')!({}, { mode: 'tui' });
    assert.equal(requests.at(-1).params.title, 'Renamed session');
    await handlers.get('tool_execution_start')!({ toolName: 'bash', toolCallId: 'a' });
    assert.equal(requests.at(-1).params.tokens.needs_input, null);
    await handlers.get('tool_execution_start')!({ toolName: 'ask_user', toolCallId: 'b' });
    await handlers.get('tool_execution_start')!({ toolName: 'ask_user', toolCallId: 'c' });
    assert.equal(requests.at(-1).params.tokens.needs_input, 'true');
    await handlers.get('tool_execution_end')!({ toolName: 'ask_user', toolCallId: 'b' });
    assert.equal(requests.at(-1).params.tokens.needs_input, 'true', 'a sibling prompt remains open');
    await handlers.get('tool_execution_end')!({ toolName: 'ask_user', toolCallId: 'c' });
    assert.equal(requests.at(-1).params.tokens.needs_input, null);
    assert.deepEqual(events.map(item => item.data.active), [true, false]);
    name = '   ';
    await handlers.get('agent_settled')!({}, { mode: 'tui' });
    assert.equal(requests.at(-1).params.clear_title, true);
    await handlers.get('session_shutdown')!();
    assert.equal(requests.at(-1).params.tokens.agent_profile, null);
    assert.equal(requests.at(-1).params.clear_title, true);
    assert.ok(requests.every(request => request.method === 'pane.report_metadata'));
    assert.ok(requests.every((request, i) => i === 0 || request.params.seq > requests[i - 1].params.seq));
    const count = requests.length;
    await handlers.get('agent_start')!({}, { mode: 'tui' });
    assert.equal(requests.length, count, 'old runtime cannot republish after shutdown');
    name = 'New session';
    await handlers.get('session_start')!({}, { mode: 'tui' });
    assert.equal(requests.at(-1).params.title, 'New session');
    assert.equal(requests.at(-1).params.tokens.needs_input, null);
  } finally {
    await handlers.get('session_shutdown')?.();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});

test('Herdr presentation retries rejected and malformed acknowledgements without hiding failure', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'hugi-retry-'));
  const socket = path.join(dir, 'api.sock');
  let requests = 0;
  const server = net.createServer(connection => {
    let data = '';
    connection.on('data', chunk => {
      data += chunk;
      if (!data.includes('\n')) return;
      const request = JSON.parse(data.split('\n')[0]);
      requests++;
      const response = requests === 1 ? 'not json'
        : requests === 2 ? JSON.stringify({ id: request.id, error: { code: 'rejected' } })
        : requests === 3 ? JSON.stringify({ id: 'wrong-id', result: {} })
        : JSON.stringify({ id: request.id, result: {} });
      connection.end(response + '\n');
    });
  });
  await new Promise<void>(resolve => server.listen(socket, resolve));
  const handlers = new Map<string, Function>();
  const pi = {
    on: (event: string, handler: Function) => handlers.set(event, handler),
    getSessionName: () => 'Unchanged title',
    events: { emit() {} },
  } as unknown as ExtensionAPI;
  try {
    installHerdrPresentation(pi, { HERDR_ENV: '1', HERDR_SOCKET_PATH: socket, HERDR_PANE_ID: 'w1:p1' });
    await handlers.get('session_start')!({}, { mode: 'tui' });
    for (let expected = 2; expected <= 4; expected++) {
      await handlers.get('agent_start')!();
      assert.equal(requests, expected);
    }
    await handlers.get('agent_start')!();
    assert.equal(requests, 4, 'accepted unchanged metadata is deduplicated');
  } finally {
    await handlers.get('session_shutdown')?.();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});
