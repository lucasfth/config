import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

export type CacheTelemetry = { read?: true; write?: true };
type UsageMessage = { provider: string; model: string; responseId?: string; usage: { input: number; output: number; cacheRead: number; cacheWrite: number } };
type Entry = { type: string; message?: unknown };
const HISTORY_LIMIT = 20;

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : {};
}

/** Presence only: normalized counters alone cannot distinguish absent from explicit zero. */
export function cacheTelemetry(data: unknown): CacheTelemetry {
  const event = object(data);
  const usage = object(event.usage ?? object(event.message).usage ?? object(event.response).usage);
  const counts = [object(usage.prompt_tokens_details).cached_tokens, object(usage.input_tokens_details).cached_tokens,
    usage.prompt_cache_hit_tokens, usage.cached_tokens, usage.cache_read_input_tokens];
  const valid = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
  return {
    ...(counts.some(valid) ? { read: true as const } : {}),
    ...(valid(usage.cache_creation_input_tokens) ? { write: true as const } : {}),
  };
}

function key(message: Pick<UsageMessage, 'provider' | 'model' | 'responseId'>): string {
  return `${message.provider}/${message.model}/${message.responseId}`;
}

export function formatCacheReport(entries: readonly Entry[], telemetry: ReadonlyMap<string, CacheTelemetry>): string {
  const messages = entries.filter(entry => entry.type === 'message' && object(entry.message).role === 'assistant')
    .map(entry => entry.message as UsageMessage).slice(-HISTORY_LIMIT);
  const lines = messages.map(message => {
    const seen = telemetry.get(key(message));
    const read = seen?.read || message.usage.cacheRead > 0 ? message.usage.cacheRead : 'unknown';
    const write = seen?.write || message.usage.cacheWrite > 0 ? message.usage.cacheWrite : 'unknown';
    return `${message.provider}/${message.model} · input ${message.usage.input} · output ${message.usage.output} · cache read ${read} · write ${write}`;
  });
  return [lines.length ? `Recent branch usage (${lines.length}):\n${lines.join('\n')}` : 'No completed assistant usage on this branch.',
    'Unknown = cache field not observed or not attributable; zero is not assumed. Raw-field observations are session-local, limited to 20 response IDs.',
    'Miss estimates remain native: /settings → showCacheMissNotices. No miss attribution or savings inferred here.',
    'Main assistant messages only; nested summary/advisor calls and cache warming are not included.'].join('\n\n');
}

export default function cacheReport(pi: ExtensionAPI): void {
  const telemetry = new Map<string, CacheTelemetry>();
  const reset = () => { telemetry.clear(); };
  pi.on('session_start', reset);
  pi.on('session_shutdown', reset);
  pi.on('provider_stream_event', event => {
    const data = object(event.data);
    const responseId = object(data.response).id ?? object(data.message).id ?? data.id ?? data.response_id;
    const seen = cacheTelemetry(data);
    // A same-model nested completion must never establish evidence for the main response.
    if (typeof responseId !== 'string' || !responseId || responseId.length > 512 || (!seen.read && !seen.write)) return;
    const id = key({ provider: event.provider, model: event.model, responseId });
    telemetry.set(id, { ...telemetry.get(id), ...seen });
    while (telemetry.size > HISTORY_LIMIT) telemetry.delete(telemetry.keys().next().value!);
  });
  pi.registerCommand('cache-report', {
    description: 'Show recent branch token usage and whether raw provider cache fields were observed; no model call',
    handler: async (_args, ctx) => {
      const report = formatCacheReport(ctx.sessionManager.getBranch(), telemetry);
      if (ctx.hasUI) ctx.ui.notify(report, 'info');
      else console.log(report);
    },
  });
}
