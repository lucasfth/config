import net from 'node:net';
import { stripTerminalSequences, truncateToWidth } from '@earendil-works/pi-tui';
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';

// Extension modules are reloaded for in-process children; keep pane leases process-wide.
const ownersKey = Symbol.for('huginn.herdr-presentation.owners');
const registry = globalThis as typeof globalThis & { [key: symbol]: Map<string, object> | undefined };
const owners = registry[ownersKey] ??= new Map<string, object>();

export function installHerdrPresentation(pi: ExtensionAPI, env: NodeJS.ProcessEnv = process.env): void {
  if (env.HERDR_ENV !== '1' || !env.HERDR_SOCKET_PATH || !env.HERDR_PANE_ID) return;
  const endpoint = process.platform === 'win32' ? `\\\\.\\pipe\\${env.HERDR_SOCKET_PATH}` : env.HERDR_SOCKET_PATH;
  const pane = env.HERDR_PANE_ID;
  const ownerKey = `${endpoint}\0${pane}`;
  const owner = {};
  const pendingInput = new Set<string>();
  let active = false;
  let interactive = false;
  let seq = Date.now() * 1000;
  let queue = Promise.resolve();
  let lastTitle: string | undefined;
  let lastInput = false;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let working = false;
  let lastState: string | undefined;
  let sessionRef: Record<string, string> = {};

  function reportState(force = false, release = false): Promise<void> {
    if (!active || interactive) return queue;
    const state = working ? 'working' : 'idle';
    if (!release && !force && state === lastState) return queue;
    lastState = state;
    return send(release ? 'pane.release_agent' : 'pane.report_agent', {
      pane_id: pane, source: 'herdr:pi', agent: 'pi',
      ...(!release ? { state, ...sessionRef } : {}),
    }, () => { lastState = undefined; });
  }

  function updateSession(ctx: ExtensionContext): void {
    const file = ctx.sessionManager?.getSessionFile?.();
    const id = ctx.sessionManager?.getSessionId?.();
    sessionRef = file ? { agent_session_path: file } : id ? { agent_session_id: id } : {};
  }

  function report(clear = false, force = false): Promise<void> {
    if (!active) return queue;
    const title = stripTerminalSequences(pi.getSessionName() ?? '').replace(/\s+/g, ' ').trim();
    const input = !clear && pendingInput.size > 0;
    const cleanTitle = clear ? '' : truncateToWidth(title, 120, '…');
    if (!clear && !force && cleanTitle === lastTitle && input === lastInput) return queue;
    lastTitle = cleanTitle;
    lastInput = input;
    return send('pane.report_metadata', {
        pane_id: pane, source: 'huginn:presentation', agent: 'pi',
        applies_to_source: 'herdr:pi',
        ttl_ms: 90_000,
        ...(clear ? { clear_display_agent: true } : { display_agent: 'huginn' }),
        ...(cleanTitle ? { title: cleanTitle } : { clear_title: true }),
        tokens: { agent_profile: clear ? null : 'huginn', needs_input: input ? 'true' : null },
    }, () => { lastTitle = undefined; });
  }

  function send(method: string, params: Record<string, unknown>, failed: () => void): Promise<void> {
    const request = { id: `huginn:presentation:${++seq}`, method, params: { ...params, seq } };
    queue = queue.then(() => new Promise<void>(resolve => {
      const connection = net.createConnection(endpoint);
      let response = '';
      let finished = false;
      const timer = setTimeout(() => finish(false), 500);
      function finish(delivered: boolean) {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        connection.destroy();
        if (!delivered) failed(); // Retry on the next lifecycle event/heartbeat.
        resolve();
      }
      connection.on('error', () => finish(false));
      connection.on('end', () => finish(false));
      connection.on('data', data => {
        response += data.toString();
        if (!response.includes('\n')) return;
        try {
          const reply = JSON.parse(response.split('\n')[0]);
          finish(reply.id === request.id && !reply.error && reply.result !== undefined);
        } catch { finish(false); }
      });
      connection.on('connect', () => connection.write(JSON.stringify(request) + '\n'));
    }));
    return queue;
  }

  pi.on('session_start', async (event, ctx) => {
    interactive = ctx.mode === 'tui';
    // In-process children also bind in print mode; never let them retitle the parent pane.
    const child = env.PI_SUBAGENT_CHILD === '1' || (!interactive && !!ctx.sessionManager?.getHeader()?.parentSession);
    const paneOwner = owners.get(ownerKey);
    active = !child && (!paneOwner || paneOwner === owner)
      && (interactive || ctx.mode === 'print' || ctx.mode === 'json');
    pendingInput.clear();
    lastTitle = undefined;
    lastState = undefined;
    working = ctx.isIdle?.() === false;
    updateSession(ctx);
    if (heartbeat) clearInterval(heartbeat);
    if (active) {
      owners.set(ownerKey, owner);
      if (!interactive) {
        await send('pane.report_agent_session', {
          pane_id: pane, source: 'herdr:pi', agent: 'pi', ...sessionRef, session_start_source: event.reason,
        }, () => { lastState = undefined; });
      }
      await reportState();
      await report();
      heartbeat = setInterval(() => { void reportState(true); void report(false, true); }, 30_000);
      heartbeat.unref();
    }
  });
  // Low-frequency lifecycle refreshes also pick up titles set by /name or auto-titling.
  pi.on('agent_start', async (_event, ctx) => {
    working = true;
    if (active) updateSession(ctx);
    await reportState();
    await report();
  });
  pi.on('agent_settled', async (_event, ctx) => {
    // Settlement may be followed by queued work; only an idle runtime is idle.
    if (ctx.isIdle?.() === true) working = false;
    await reportState();
    await report();
  });
  pi.on('tool_execution_start', async event => {
    if (!active || !interactive || event.toolName !== 'ask_user') return;
    const wasEmpty = pendingInput.size === 0;
    pendingInput.add(event.toolCallId);
    if (wasEmpty) pi.events.emit('herdr:blocked', { active: true, label: 'needs input' });
    await report();
  });
  pi.on('tool_execution_end', async event => {
    if (!active || !pendingInput.delete(event.toolCallId)) return;
    if (pendingInput.size === 0) pi.events.emit('herdr:blocked', { active: false });
    await report();
  });
  pi.on('session_shutdown', async () => {
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = undefined;
    if (pendingInput.size) pi.events.emit('herdr:blocked', { active: false });
    pendingInput.clear();
    await report(true);
    await reportState(false, true);
    active = false;
    if (owners.get(ownerKey) === owner) owners.delete(ownerKey);
  });
}

export default installHerdrPresentation;
