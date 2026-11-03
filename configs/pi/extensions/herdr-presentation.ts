import net from 'node:net';
import { stripTerminalSequences, truncateToWidth } from '@earendil-works/pi-tui';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

export function installHerdrPresentation(pi: ExtensionAPI, env: NodeJS.ProcessEnv = process.env): void {
  if (env.HERDR_ENV !== '1' || !env.HERDR_SOCKET_PATH || !env.HERDR_PANE_ID) return;
  const endpoint = process.platform === 'win32' ? `\\\\.\\pipe\\${env.HERDR_SOCKET_PATH}` : env.HERDR_SOCKET_PATH;
  const pane = env.HERDR_PANE_ID;
  const pendingInput = new Set<string>();
  let active = false;
  let seq = Date.now() * 1000;
  let queue = Promise.resolve();
  let lastTitle: string | undefined;
  let lastInput = false;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  function report(clear = false, force = false): Promise<void> {
    if (!active) return queue;
    const title = stripTerminalSequences(pi.getSessionName() ?? '').replace(/\s+/g, ' ').trim();
    const input = !clear && pendingInput.size > 0;
    const cleanTitle = clear ? '' : truncateToWidth(title, 120, '…');
    if (!clear && !force && cleanTitle === lastTitle && input === lastInput) return queue;
    lastTitle = cleanTitle;
    lastInput = input;
    const request = {
      id: `huginn:presentation:${++seq}`, method: 'pane.report_metadata',
      params: {
        pane_id: pane, source: 'huginn:presentation', agent: 'pi', applies_to_source: 'herdr:pi', seq,
        ttl_ms: 90_000,
        ...(clear ? { clear_display_agent: true } : { display_agent: 'huginn' }),
        ...(cleanTitle ? { title: cleanTitle } : { clear_title: true }),
        tokens: { agent_profile: clear ? null : 'huginn', needs_input: input ? 'true' : null },
      },
    };
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
        if (!delivered) lastTitle = undefined; // Retry on the next lifecycle event/heartbeat.
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

  pi.on('session_start', async (_event, ctx) => {
    active = ctx.mode === 'tui';
    pendingInput.clear();
    lastTitle = undefined;
    if (heartbeat) clearInterval(heartbeat);
    if (active) {
      await report();
      heartbeat = setInterval(() => { void report(false, true); }, 30_000);
      heartbeat.unref();
    }
  });
  // Low-frequency lifecycle refreshes also pick up titles set by /name or auto-titling.
  pi.on('agent_start', () => report());
  pi.on('agent_settled', () => report());
  pi.on('tool_execution_start', async event => {
    if (!active || event.toolName !== 'ask_user') return;
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
    const cleanup = report(true);
    active = false;
    await cleanup;
  });
}

export default installHerdrPresentation;
