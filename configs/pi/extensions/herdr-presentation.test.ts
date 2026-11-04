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
    assert.equal(requests.length, 0, 'RPC sessions must not overwrite pane identity');
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
      await handlers.get('agent_start')!({}, { mode: 'tui' });
      assert.equal(requests, expected);
    }
    await handlers.get('agent_start')!({}, { mode: 'tui' });
    assert.equal(requests, 4, 'accepted unchanged metadata is deduplicated');
  } finally {
    await handlers.get('session_shutdown')?.();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});

test('root print/JSON workers publish identity without requiring the TUI state hook; children stay silent', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'hugi-headless-'));
  const socket = path.join(dir, 'api.sock');
  const requests: any[] = [];
  const server = net.createServer(connection => {
    let data = '';
    connection.on('data', chunk => {
      data += chunk;
      if (!data.includes('\n')) return;
      const request = JSON.parse(data.split('\n')[0]);
      requests.push(request);
      connection.end(JSON.stringify({ id: request.id, result: {} }) + '\n');
    });
  });
  await new Promise<void>(resolve => server.listen(socket, resolve));
  try {
    for (const mode of ['print', 'json', 'rpc', 'tui']) {
      for (const child of ['none', 'runner', 'session']) {
        const handlers = new Map<string, Function>();
        const events: string[] = [];
        const pi = {
          on: (event: string, handler: Function) => handlers.set(event, handler),
          getSessionName: () => 'Worker identity',
          events: { emit: (event: string) => events.push(event) },
        } as unknown as ExtensionAPI;
        installHerdrPresentation(pi, {
          HERDR_ENV: '1', HERDR_SOCKET_PATH: socket, HERDR_PANE_ID: 'w1:p1',
          ...(child === 'runner' ? { PI_SUBAGENT_CHILD: '1' } : {}),
        });
        const before = requests.length;
        // A fork opened in a real TUI owns its pane; headless child sessions do not.
        const enabled = mode !== 'rpc' && child !== 'runner' && (child === 'none' || mode === 'tui');
        try {
          await handlers.get('session_start')?.({}, {
            mode, sessionManager: { getHeader: () => child === 'session' ? { parentSession: '/parent.jsonl' } : {} },
          });
          const count = enabled ? (mode === 'tui' ? 1 : 3) : 0;
          assert.equal(requests.length - before, count, `${mode}/${child} publication`);
          if (enabled) {
            const params = requests.at(-1).params;
            assert.equal(params.display_agent, 'huginn');
            assert.equal(params.tokens.agent_profile, 'huginn');
            assert.equal(params.agent, 'pi', 'still guarded to actual Pi detection');
            assert.equal(params.applies_to_source, 'herdr:pi');
            assert.equal(params.state, undefined, 'identity must not claim state authority');
            if (mode !== 'tui') {
              await handlers.get('tool_execution_start')?.({ toolName: 'ask_user', toolCallId: 'a' });
              assert.equal(requests.length, before + count, 'headless tools cannot claim interactive input');
              assert.deepEqual(events, []);
            }
          }
        } finally {
          await handlers.get('session_shutdown')?.();
        }
        if (enabled) assert.equal(requests.filter(r => r.method === 'pane.report_metadata').at(-1).params.clear_display_agent, true);
      }
    }
    // An in-process foreground child of --no-session has neither a header nor env marker.
    for (const parentMode of ['tui', 'print', 'json']) {
      const parent = new Map<string, Function>();
      const child = new Map<string, Function>();
      for (const [handlers, title] of [[parent, 'Parent'], [child, 'Child']] as const) {
        installHerdrPresentation({
          on: (event: string, handler: Function) => handlers.set(event, handler),
          getSessionName: () => title, events: { emit() {} },
        } as unknown as ExtensionAPI, { HERDR_ENV: '1', HERDR_SOCKET_PATH: socket, HERDR_PANE_ID: 'w1:p1' });
      }
      try {
        await parent.get('session_start')!({}, { mode: parentMode });
        assert.equal(requests.at(-1).params.title, 'Parent');
        const before = requests.length;
        await child.get('session_start')!({}, { mode: 'print' });
        await child.get('agent_start')!();
        await child.get('session_shutdown')!();
        assert.equal(requests.length, before, `${parentMode} parent survives anonymous child and child shutdown`);
      } finally {
        await child.get('session_shutdown')?.();
        await parent.get('session_shutdown')?.();
      }
    }
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});

test('headless roots report lifecycle and exact session through the socket without terminal output', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'hugi-state-'));
  const socket = path.join(dir, 'api.sock');
  const requests: any[] = [];
  let rejectState = true;
  const server = net.createServer(connection => {
    let data = '';
    connection.on('data', chunk => {
      data += chunk;
      if (!data.includes('\n')) return;
      const request = JSON.parse(data.split('\n')[0]);
      requests.push(request);
      const rejected = request.method === 'pane.report_agent' && rejectState;
      if (rejected) rejectState = false;
      connection.end(JSON.stringify({ id: request.id, ...(rejected ? { error: {} } : { result: {} }) }) + '\n');
    });
  });
  await new Promise<void>(resolve => server.listen(socket, resolve));
  try {
    for (const mode of ['print', 'json']) {
      const handlers = new Map<string, Function>();
      let idle = false;
      const ctx = { mode, isIdle: () => idle, sessionManager: {
        getHeader: () => ({}), getSessionFile: () => '/sessions/exact.jsonl', getSessionId: () => 'exact',
      } };
      installHerdrPresentation({
        on: (event: string, handler: Function) => handlers.set(event, handler),
        getSessionName: () => 'Headless lifecycle', events: { emit() {} },
      } as unknown as ExtensionAPI, { HERDR_ENV: '1', HERDR_SOCKET_PATH: socket, HERDR_PANE_ID: 'w1:p1' });
      const before = requests.length;
      const states = () => requests.slice(before).filter(r => r.method === 'pane.report_agent');
      try {
        await handlers.get('session_start')!({ reason: 'startup' }, ctx);
        const registration = requests.slice(before).find(r => r.method === 'pane.report_agent_session');
        assert.equal(registration?.params.session_start_source, 'startup');
        assert.equal(registration?.params.agent_session_path, '/sessions/exact.jsonl');
        assert.equal(states().at(-1)?.params.state, 'working', 'startup honors a busy restored session');
        await handlers.get('agent_start')!({}, ctx);
        if (mode === 'print') assert.equal(states().length, 2, 'rejected state is retried');
        await handlers.get('agent_settled')!({}, ctx);
        assert.equal(states().at(-1).params.state, 'working', 'queued continuation is not idle');
        idle = true;
        await handlers.get('agent_settled')!({}, ctx);
        assert.equal(states().at(-1).params.state, 'idle');
        idle = false;
        await handlers.get('agent_start')!({}, ctx);
        assert.equal(states().at(-1).params.state, 'working');
        assert.ok(states().every(r => r.params.agent_session_path === '/sessions/exact.jsonl'
          && r.params.source === 'herdr:pi' && r.params.agent === 'pi'));
      } finally {
        await handlers.get('session_shutdown')!();
      }
      assert.equal(requests.at(-1).method, 'pane.release_agent', 'shutdown releases headless state authority');
      const count = requests.length;
      await handlers.get('agent_start')!({}, ctx);
      assert.equal(requests.length, count, 'shutdown cannot republish');
    }
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});
