import { randomUUID } from 'node:crypto';
import type { ExtensionAPI, ExtensionContext, Theme } from '@earendil-works/pi-coding-agent';
import { mixColors, stripTerminalSequences, truncateToWidth } from '@earendil-works/pi-tui';
import { composerColors, type ComposerActivity } from './presentation.ts';

type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue => value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value.slice(0, 64) : [];
const text = (value: unknown, fallback = '') => typeof value === 'string' ? stripTerminalSequences(value).replace(/[\x00-\x1f\x7f-\x9f]/g, ' ').slice(0, 200) : fallback;
const time = (value: unknown, fallback: number) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : fallback;
const running = (state: string) => state === 'running';
const terminal = (state: string) => ['complete', 'failed', 'partial', 'stopped', 'rejected'].includes(state);
export interface WorkerRow {
  key: string; agent: string; label: string; state: string; activity: ComposerActivity;
  detail: string; model?: string; thinking?: string; startedAt: number; endedAt?: number; lastActivityAt?: number;
}

/** Public async nodes carry activity; opaque fleet keys are never parsed as run IDs. */
export function workerRows(data: unknown, now: number): WorkerRow[] {
  const value = record(data), snapshot = record(value.asyncSnapshot), fleet = record(value.fleet);
  const rows: WorkerRow[] = [];
  const representedRuns = new Set<string>();
  const visit = (input: unknown, path: string, depth: number) => {
    if (depth > 5 || rows.length >= 64) return;
    const node = record(input), children = list(node.children);
    const key = `${path}/${text(node.id)}`;
    const runId = text(node.runId);
    if (runId) representedRuns.add(runId);
    if (children.length) { children.forEach(child => visit(child, key, depth + 1)); return; }
    if (node.kind === 'host-step') return;
    const state = text(node.state, 'unknown'), activity = record(node.activity);
    const tool = text(activity.currentTool);
    const waiting = !terminal(state) && (activity.state === 'needs_attention' || state === 'queued' || state === 'paused');
    const colour: ComposerActivity = ['failed', 'partial', 'rejected'].includes(state) ? 'error'
      : waiting ? 'waiting' : running(state) && tool ? 'tool' : 'idle';
    rows.push({ key, agent: text(node.agent, text(node.label, 'worker')), label: text(node.label), state,
      model: text(node.model) || undefined, thinking: text(node.thinking) || undefined,
      activity: colour, detail: waiting ? (state === 'queued' ? 'Queued' : 'Needs attention')
        : running(state) ? tool ? `Tool: ${tool}` : 'Running · activity unavailable' : state,
      startedAt: time(node.startedAt, now),
      endedAt: terminal(state) ? time(node.endedAt, time(node.updatedAt, now)) : undefined,
      lastActivityAt: typeof activity.lastActivityAt === 'number' ? time(activity.lastActivityAt, now) : undefined });
  };
  if (snapshot.version === 1 && snapshot.kind === 'pi-subagents.async-status-snapshot') {
    list(snapshot.runs).forEach(node => visit(node, 'async', 0));
  }
  // Only explicit run identities can suppress fleet rows. Foreground entries
  // have no asyncRunId and must survive even with identical agent/start values.
  if (fleet.version === 1) for (const input of list(fleet.entries)) {
    const entry = record(input), agent = text(entry.agent, 'worker'), startedAt = time(entry.startedAt, now);
    const asyncRunId = text(entry.asyncRunId);
    if (asyncRunId && representedRuns.has(asyncRunId)) continue;
    rows.push({ key: text(entry.key), agent, label: text(entry.goal, text(entry.role)), state: 'running', activity: 'idle',
      model: text(entry.model) || undefined, thinking: text(entry.effort) || undefined,
      detail: 'Running · activity unavailable', startedAt });
  }
  return rows;
}

export function renderWorkers(rows: WorkerRow[], theme: Theme, sessionId: string, width: number, now: number, stale = false): string[] {
  const retained = rows.filter(row => row.state !== 'complete' || now - (row.endedAt ?? now) < 5000);
  if (width <= 0 || !retained.length) return [];
  const active = retained.filter(row => !terminal(row.state));
  const recent = retained.filter(row => terminal(row.state)).sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0));
  const visible = [...active, ...recent.slice(0, 2)].slice(0, 6);
  const lines = [theme.fg('muted', `Workers · ${active.length} active${stale ? ' · status unavailable' : ''} · /subagents-fleet`)];
  for (const row of visible) {
    const { target } = composerColors(sessionId, theme.appearance, stale ? 'waiting' : row.activity);
    const pulse = running(row.state) && row.activity !== 'waiting' && !stale ? 0.55 + 0.45 * (1 + Math.sin(now * Math.PI / 1200)) / 2 : 1;
    // Breathe toward the theme's dim foreground; no assumed widget background.
    const crow = theme.style('\uedea', { fg: mixColors(theme.colors.dim, target, pulse, 'srgb') });
    const glyph = stale ? '?' : row.activity === 'error' ? '!' : row.activity === 'waiting' ? '?' : row.state === 'complete' ? '✓' : running(row.state) ? '●' : '■';
    const status = theme.style(glyph, { fg: target });
    const elapsed = Math.floor(Math.max(0, (row.endedAt ?? now) - row.startedAt) / 1000);
    const quietSeconds = row.lastActivityAt !== undefined ? Math.floor(Math.max(0, now - row.lastActivityAt) / 1000) : 0;
    const age = !stale && running(row.state) && quietSeconds >= 20 ? ` · quiet ${quietSeconds}s` : '';
    const label = row.label && row.label !== row.agent ? truncateToWidth(text(row.label), Math.max(8, Math.min(28, Math.floor(width / 4))), '…') : '';
    const model = row.model ? `${text(row.model)} · ${text(row.thinking, 'reasoning pending')}` : 'model pending';
    const modelLabel = truncateToWidth(model, Math.max(12, Math.min(56, Math.floor(width / 2))), '…');
    const detail = stale ? 'Status unavailable' : row.detail === 'Running · activity unavailable' ? 'activity unknown' : row.detail;
    lines.push(`${crow} ${status} ${theme.fg('text', text(row.agent))}${theme.fg('muted', `${label ? ` · ${label}` : ''} · ${modelLabel} · ${detail}${age} · ${elapsed}s`)}`);
  }
  if (retained.length > visible.length) lines.push(theme.fg('dim', `+${retained.length - visible.length} more · /subagents-fleet`));
  return lines.map(line => truncateToWidth(line, width, ''));
}

export default function workersExtension(pi: ExtensionAPI) {
  let ctx: ExtensionContext | undefined;
  let rows: WorkerRow[] = [];
  let pollSafe = false, unavailable = false, lastReply = 0, lastPoll = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  let pending: { dispose(): void } | undefined;
  let repaint: (() => void) | undefined;
  let mounted = false;
  const reset = () => {
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
    pending?.dispose(); pending = undefined;
    ctx = undefined; repaint = undefined; rows = []; mounted = false; pollSafe = false; unavailable = false; lastReply = 0; lastPoll = 0;
  };
  const paint = () => {
    if (!ctx) return;
    if (!rows.length) {
      if (mounted) ctx.ui.setWidget('huginn-workers', undefined);
      mounted = false; repaint = undefined; return;
    }
    if (!mounted) {
      mounted = true;
      ctx.ui.setWidget('huginn-workers', tui => {
        repaint = () => tui.requestRender();
        return {
          render: width => ctx ? renderWorkers(rows, ctx.ui.theme, ctx.sessionManager.getSessionId(), width, Date.now(), unavailable || Date.now() - lastReply > 8000) : [],
          invalidate() {},
          dispose() { repaint = undefined; },
        };
      }, { placement: 'aboveEditor' });
    }
    repaint?.();
  };
  const request = (method: 'ping' | 'status') => {
    if (!ctx || pending) return;
    const owner = ctx, requestId = randomUUID();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let off: (() => void) | undefined;
    const dispose = () => { off?.(); if (timeout !== undefined) clearTimeout(timeout); if (pending?.dispose === dispose) pending = undefined; };
    pending = { dispose };
    off = pi.events.on(`subagents:rpc:v1:reply:${requestId}`, payload => {
      dispose();
      if (ctx !== owner) return;
      const reply = record(payload);
      if (reply.version !== 1 || reply.success !== true) { pollSafe = false; unavailable = true; paint(); return; }
      const data = record(reply.data);
      if (method === 'ping') {
        const capabilities = record(data.capabilities);
        if (record(capabilities.fleetStatus).version === 1 && record(capabilities.statusProjection).version === 1) request('status');
        return;
      }
      // This exact public summary proves the session-matched in-memory branch ran.
      // If restoration has not finished, retry on lifecycle events, not a timer.
      pollSafe = typeof data.text === 'string' && data.text.startsWith('In-memory subagent status:');
      rows = workerRows(data, Date.now());
      unavailable = false; lastReply = Date.now(); paint();
    });
    timeout = setTimeout(() => { dispose(); pollSafe = false; unavailable = true; paint(); }, 3000);
    timeout.unref();
    lastPoll = Date.now();
    pi.events.emit('subagents:rpc:v1:request', { version: 1, requestId, method });
  };
  pi.events.on('subagents:rpc:v1:ready', () => { pending?.dispose(); request('ping'); });
  for (const event of ['subagent:async-started', 'subagent:async-complete', 'subagent:child-status']) {
    pi.events.on(event, () => request('status'));
  }
  pi.on('tool_execution_start', () => request('status'));
  pi.on('tool_execution_end', () => request('status'));
  pi.on('agent_settled', () => request('status'));
  pi.on('session_shutdown', () => { ctx?.ui.setWidget('huginn-workers', undefined); reset(); });
  pi.on('session_start', (_event, context) => {
    reset();
    if (context.mode !== 'tui') return;
    ctx = context;
    request('ping');
    timer = setInterval(() => {
      rows = rows.filter(row => row.state !== 'complete' || Date.now() - (row.endedAt ?? Date.now()) < 5000);
      if (pollSafe && Date.now() - lastPoll >= 2000) request('status');
      if (rows.length) repaint?.();
      else paint();
    }, 250);
    timer.unref();
  });
}
