import { createHash } from 'node:crypto';
import { closeSync, constants, fstatSync, openSync, readFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fleetDefaults } from '../fleet-defaults.mjs';
import { getAgentDir, type ExtensionAPI, type ExtensionContext } from '@earendil-works/pi-coding-agent';

type FleetConfig = { endpoint: string; hostId: 'gimle' | 'macbook'; token: string };
type State = 'working' | 'idle' | 'blocked' | 'error' | 'done' | 'ended' | 'unknown';
export type FleetReport = {
  schemaVersion: 1; hostId: FleetConfig['hostId']; sessionId: string; label: string; state: State;
  observedAt: string; lastToolCompletedAt: string | null; startedAt: string; sequence: number;
  workingSince: string | null; toolsInFlight: number;
};
type ConfigResult = { status: string; config?: FleetConfig };

export function safeFleetLabel(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 80 && value === value.trim()
    && /^[A-Za-z0-9 ._-]+$/.test(value);
}

export function loadFleetConfig(filename: string, allowTestLoopback = false, hostname = os.hostname()): ConfigResult {
  let fd: number | undefined;
  try {
    fd = openSync(filename, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const stat = fstatSync(fd);
    if (!stat.isFile() || (stat.mode & 0o777) !== 0o600 || (process.getuid && stat.uid !== process.getuid())) {
      return { status: 'disabled: fleet.json must be an owned private regular file (0600)' };
    }
    if (stat.size > 4096) return { status: 'disabled: invalid fleet.json' };
    const stored = JSON.parse(readFileSync(fd, 'utf8'));
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) throw new Error();
    const keys = Object.keys(stored).sort().join(',');
    const defaults = fleetDefaults(hostname);
    const value = keys === 'token' && defaults ? { ...defaults, token: stored.token } : stored;
    if ((keys !== 'endpoint,hostId,token' && !(keys === 'token' && defaults))
      || !['gimle', 'macbook'].includes(value.hostId) || typeof value.token !== 'string'
      || !/^[A-Za-z0-9_-]{32,256}$/.test(value.token) || typeof value.endpoint !== 'string') throw new Error();
    const url = new URL(value.endpoint);
    const testLoopback = allowTestLoopback && url.protocol === 'http:' && ['127.0.0.1', '[::1]'].includes(url.hostname);
    if ((!testLoopback && url.protocol !== 'https:') || url.username || url.password || url.search || url.hash
      || url.pathname !== '/api/admin/fleet/report') throw new Error();
    return { status: 'configured', config: value };
  } catch (error) {
    return { status: (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'disabled: no fleet.json' : 'disabled: invalid fleet.json' };
  } finally { if (fd !== undefined) closeSync(fd); }
}

/** One latest snapshot, no retry queue. Heartbeat is process liveness, not task progress. */
export class FleetReporter {
  private report: FleetReport;
  private heartbeat: NodeJS.Timeout;
  private scheduled?: NodeJS.Timeout;
  private active?: Promise<void>;
  private controller?: AbortController;
  private dirty = false;
  private closed = false;
  private lastSend = 0;
  status = 'configured; awaiting receipt';

  constructor(private config: FleetConfig, nativeId: string, label?: string,
    private timing = { heartbeatMs: 30_000, coalesceMs: 1000, timeoutMs: 5000 }) {
    const sessionId = createHash('sha256').update(nativeId).digest('hex').slice(0, 32);
    const now = new Date().toISOString();
    this.report = { schemaVersion: 1, hostId: config.hostId, sessionId,
      label: safeFleetLabel(label) ? label : `Pi session ${sessionId.slice(0, 8)}`, state: 'idle',
      observedAt: now, startedAt: now, lastToolCompletedAt: null, sequence: 0, workingSince: null, toolsInFlight: 0 };
    this.heartbeat = setInterval(() => this.update({}), timing.heartbeatMs);
    this.heartbeat.unref();
    this.update({});
  }

  update(change: { state?: State; label?: string; toolCompleted?: boolean; toolsInFlight?: number }): void {
    if (this.closed) return;
    if (change.state) {
      if (change.state === 'working') this.report.workingSince ??= this.timestamp();
      else { this.report.workingSince = null; this.report.toolsInFlight = 0; }
      this.report.state = change.state;
    }
    if (change.toolsInFlight !== undefined && this.report.state === 'working') this.report.toolsInFlight = Math.min(256, change.toolsInFlight);
    if (safeFleetLabel(change.label)) this.report.label = change.label;
    if (change.toolCompleted) this.report.lastToolCompletedAt = this.timestamp();
    this.dirty = true;
    this.schedule();
  }

  private timestamp(): string {
    return new Date(Math.max(Date.now(), Date.parse(this.report.observedAt), Date.parse(this.report.lastToolCompletedAt ?? this.report.startedAt), Date.parse(this.report.workingSince ?? this.report.startedAt))).toISOString();
  }

  private schedule(): void {
    if (this.closed || this.active || this.scheduled || !this.dirty) return;
    this.scheduled = setTimeout(() => {
      this.scheduled = undefined;
      this.active = this.send(this.timing.timeoutMs).finally(() => {
        this.active = undefined;
        this.schedule();
      });
    }, Math.max(0, this.lastSend + this.timing.coalesceMs - Date.now()));
    this.scheduled.unref();
  }

  private async send(timeoutMs: number): Promise<void> {
    this.dirty = false;
    this.lastSend = Date.now();
    this.report.observedAt = this.timestamp();
    const body = JSON.stringify({ ...this.report, sequence: this.report.sequence++ });
    const controller = new AbortController();
    this.controller = controller;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    timeout.unref();
    try {
      const response = await fetch(this.config.endpoint, {
        method: 'POST', redirect: 'error', signal: controller.signal,
        headers: { Authorization: `Bearer ${this.config.token}`, 'Content-Type': 'application/json' }, body,
      });
      this.status = response.ok ? 'receiver acknowledged; not task success' : 'unavailable: receiver rejected report';
      // Never read or log response/error bodies, even when a receiver echoes secrets.
      await response.body?.cancel();
    } catch { this.status = 'unavailable: report failed or timed out'; }
    finally { clearTimeout(timeout); if (this.controller === controller) this.controller = undefined; }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.heartbeat);
    clearTimeout(this.scheduled);
    this.controller?.abort();
    await this.active;
    this.report.state = 'ended';
    this.report.workingSince = null;
    this.report.toolsInFlight = 0;
    // Best effort, bounded shutdown only; ordinary agent events never await network I/O.
    await this.send(250);
  }
}

type FactoryOptions = { configPath?: string; allowTestLoopback?: boolean; timing?: { heartbeatMs: number; coalesceMs: number; timeoutMs: number } };
export function createFleetExtension(options: FactoryOptions = {}) {
  return (pi: ExtensionAPI): void => {
    let reporter: FleetReporter | undefined;
    let status = 'disabled: session not started';
    let runError = false;
    let runAborted = false;
    const activeTools = new Set<string>();
    const notify = (ctx: ExtensionContext, message: string) => {
      if (ctx.hasUI) ctx.ui.notify(message, 'info');
      else console.log(message);
    };
    const branchLabel = (ctx: ExtensionContext): string => {
      const sessionId = createHash('sha256').update(ctx.sessionManager.getSessionId()).digest('hex').slice(0, 32);
      let label = `Pi session ${sessionId.slice(0, 8)}`;
      for (const entry of ctx.sessionManager.getBranch()) {
        if (entry.type === 'custom' && entry.customType === 'fleet-label') {
          const candidate = (entry.data as { label?: unknown } | undefined)?.label;
          if (safeFleetLabel(candidate)) label = candidate;
        }
      }
      return label;
    };
    pi.on('session_start', async (_event, ctx) => {
      await reporter?.close();
      reporter = undefined;
      activeTools.clear(); runError = false; runAborted = false;
      const loaded = loadFleetConfig(options.configPath ?? path.join(getAgentDir(), 'fleet.json'), options.allowTestLoopback);
      status = loaded.status;
      if (!loaded.config) return;
      reporter = new FleetReporter(loaded.config, ctx.sessionManager.getSessionId(), branchLabel(ctx), options.timing);
      // Reloading a busy session cannot reconstruct its original work-start/tool IDs.
      reporter.update({ state: ctx.isIdle() ? 'idle' : 'unknown' });
    });
    pi.on('session_tree', (_event, ctx) => { reporter?.update({ label: branchLabel(ctx) }); });
    pi.on('agent_start', () => { runError = false; runAborted = false; reporter?.update({ state: 'working' }); });
    pi.on('tool_execution_start', event => {
      activeTools.add(event.toolCallId);
      reporter?.update({ toolsInFlight: activeTools.size });
    });
    pi.on('tool_execution_end', event => {
      activeTools.delete(event.toolCallId);
      reporter?.update({ toolCompleted: true, toolsInFlight: activeTools.size });
    });
    pi.on('message_end', event => {
      if (event.message.role !== 'assistant') return;
      if (event.message.stopReason === 'error') runError = true;
      if (event.message.stopReason === 'aborted') runAborted = true;
    });
    pi.on('agent_settled', event => {
      activeTools.clear();
      reporter?.update({ state: event.aborted || runAborted ? 'unknown' : runError ? 'error' : 'idle' });
    });
    pi.on('session_shutdown', async () => { await reporter?.close(); reporter = undefined; });
    pi.registerCommand('fleet-name', {
      description: 'Approve a short private fleet display label (no prompts, paths or secrets)',
      handler: async (args, ctx) => {
        if (!safeFleetLabel(args)) { notify(ctx, 'Fleet label must be 1–80 trimmed ASCII characters: letters, digits, space, period, underscore or hyphen.'); return; }
        pi.appendEntry('fleet-label', { label: args });
        reporter?.update({ label: args });
        notify(ctx, 'Fleet label saved. Only use operator-approved display names, never private content.');
      },
    });
    pi.registerCommand('fleet-status', {
      description: 'Show local reporting configuration/receipt status without secrets or model calls',
      handler: async (_args, ctx) => { notify(ctx, `Fleet reporting: ${reporter?.status ?? status}. Configuration changes require a normal relaunch or reload.`); },
    });
  };
}

export default createFleetExtension();
