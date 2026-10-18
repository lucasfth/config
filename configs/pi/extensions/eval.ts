import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ExtensionAPI, ExtensionToolContext } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';

const WORKERS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../workers');
const DEFAULT_TIMEOUT = 30_000;
const MAX_TIMEOUT = 120_000;
const MAX_OUTPUT = 12_000;
type Language = 'py' | 'js';
type WorkerMessage = Record<string, unknown> & { type: string };
type PendingCall = { resolve: (message: WorkerMessage) => void; reject: (error: Error) => void };
type Kernel = {
  child: ChildProcess;
  pending: Map<string, PendingCall>;
  queue: Promise<void>;
  nextId: number;
  closed: boolean;
  errorOutput: string;
  closedPromise: Promise<void>;
  context?: ExtensionToolContext;
  signal?: AbortSignal;
};
type SessionState = { kernels: Map<Language, Kernel> };

function messageOf(error: unknown): string { return error instanceof Error ? error.message : String(error); }

function bound(text: string): string {
  return text.length <= MAX_OUTPUT ? text : `${text.slice(0, MAX_OUTPUT)}\n… output truncated (${text.length - MAX_OUTPUT} characters omitted)`;
}

function toolText(result: unknown): string {
  if (!result || typeof result !== 'object' || !('content' in result) || !Array.isArray(result.content)) return 'Tool returned no content.';
  const text = result.content.map((part: unknown) => {
    if (!part || typeof part !== 'object' || !('type' in part)) return '';
    if (part.type === 'text' && 'text' in part && typeof part.text === 'string') return part.text;
    if (part.type === 'image') {
      const mime = 'mimeType' in part && typeof part.mimeType === 'string' ? part.mimeType : 'unknown image format';
      const size = 'data' in part && typeof part.data === 'string' ? ` (${part.data.length} base64 characters)` : '';
      return `[image result ${mime}${size}; image data omitted from text output]`;
    }
    return `[${String(part.type)} result omitted]`;
  }).filter(Boolean).join('\n');
  return text || 'Tool returned no text content.';
}

function send(kernel: Kernel, message: Record<string, unknown>): void {
  if (kernel.closed || !kernel.child.stdin?.writable) throw new Error('Eval worker has stopped; its in-memory state is unavailable.');
  kernel.child.stdin.write(`${JSON.stringify(message)}\n`);
}

async function stop(kernel: Kernel): Promise<void> {
  const alreadyClosed = kernel.closed;
  kernel.closed = true;
  if (!alreadyClosed) {
    const pid = kernel.child.pid;
    if (pid) {
      try {
        if (process.platform === 'win32') kernel.child.kill('SIGTERM');
        else process.kill(-pid, 'SIGTERM');
      } catch { kernel.child.kill('SIGTERM'); }
      const forceKill = setTimeout(() => {
        if (kernel.child.exitCode !== null || kernel.child.signalCode !== null) return;
        try {
          if (process.platform === 'win32') kernel.child.kill('SIGKILL');
          else if (pid) process.kill(-pid, 'SIGKILL');
        } catch { kernel.child.kill('SIGKILL'); }
      }, 150);
      forceKill.unref();
    }
  }
  await kernel.closedPromise;
}

async function nestedTool(kernel: Kernel, message: WorkerMessage): Promise<void> {
  const id = typeof message.id === 'string' ? message.id : '';
  try {
    if (!id || typeof message.name !== 'string' || typeof message.args !== 'object' || message.args === null) throw new Error('Malformed nested tool request.');
    if (message.name === 'eval') throw new Error('Recursive eval tool calls are not supported; evaluate directly in the current cell.');
    if (!kernel.context) throw new Error('Nested tool context is not available.');
    const outcome = await kernel.context.executeTool(message.name, message.args, { signal: kernel.signal });
    const text = toolText(outcome.result);
    send(kernel, { type: 'tool_result', id, outcome: { isError: outcome.isError, error: outcome.isError ? text : undefined, result: { content: [{ type: 'text', text }] } } });
  } catch (error) {
    try { send(kernel, { type: 'tool_result', id, outcome: { isError: true, error: messageOf(error), result: { content: [{ type: 'text', text: messageOf(error) }] } } }); }
    catch { /* Worker has exited. */ }
  }
}

function start(language: Language, cwd: string): Kernel {
  const executable = language === 'py' ? process.env.PI_EVAL_PYTHON || 'python3' : process.env.PI_EVAL_NODE || process.execPath;
  const worker = language === 'py' ? 'python_worker.py' : 'javascript_worker.mjs';
  const child = spawn(executable, [path.join(WORKERS, worker)], {
    cwd, stdio: ['pipe', 'pipe', 'pipe', 'pipe'], detached: process.platform !== 'win32',
    env: { ...process.env, PYTHONUNBUFFERED: '1' },
  });
  const { promise: closedPromise, resolve: closed } = Promise.withResolvers<void>();
  const kernel: Kernel = { child, pending: new Map(), queue: Promise.resolve(), nextId: 0, closed: false, errorOutput: '', closedPromise };
  const channel = child.stdio[3];
  if (!(channel instanceof Readable)) throw new Error('Eval worker protocol pipe was not created.');
  const messages = createInterface({ input: channel, crlfDelay: Infinity });
  messages.on('line', line => {
    let message: WorkerMessage;
    try {
      const parsed: unknown = JSON.parse(line);
      if (!parsed || typeof parsed !== 'object' || !('type' in parsed) || typeof parsed.type !== 'string') throw new Error('message shape is invalid');
      message = parsed as WorkerMessage;
    } catch (error) {
      kernel.errorOutput = `Invalid worker protocol: ${messageOf(error)}`;
      void stop(kernel);
      return;
    }
    if (message.type === 'tool_call') { void nestedTool(kernel, message); return; }
    if (message.type === 'eval_result' && typeof message.id === 'string') {
      const pending = kernel.pending.get(message.id);
      if (pending) { kernel.pending.delete(message.id); pending.resolve(message); }
      return;
    }
    if (message.type === 'protocol_error') kernel.errorOutput = String(message.error ?? 'worker protocol error');
  });
  child.stdout?.on('data', chunk => { kernel.errorOutput = `${kernel.errorOutput}${String(chunk)}`.slice(0, 4000); });
  child.stderr?.on('data', chunk => { kernel.errorOutput = `${kernel.errorOutput}${String(chunk)}`.slice(0, 4000); });
  child.once('error', error => {
    kernel.errorOutput = error.message;
    kernel.closed = true;
    for (const call of kernel.pending.values()) call.reject(error);
    kernel.pending.clear();
    closed();
  });
  child.once('close', () => {
    kernel.closed = true;
    const error = new Error(kernel.errorOutput || 'Eval worker exited; its in-memory state was lost.');
    for (const call of kernel.pending.values()) call.reject(error);
    kernel.pending.clear();
    closed();
  });
  return kernel;
}

function clearSession(sessions: Map<string, SessionState>, id: string): Promise<void> {
  const state = sessions.get(id);
  if (!state) return Promise.resolve();
  sessions.delete(id);
  return Promise.all([...state.kernels.values()].map(stop)).then(() => undefined);
}

async function execute(state: SessionState, language: Language, code: string, timeout: number, signal: AbortSignal | undefined, context: ExtensionToolContext): Promise<{ text: string; isError: boolean }> {
  let kernel = state.kernels.get(language);
  if (!kernel || kernel.closed) { if (kernel) await kernel.closedPromise; kernel = start(language, context.cwd); state.kernels.set(language, kernel); }
  const active = kernel;
  const cell = async (): Promise<{ text: string; isError: boolean }> => {
    if (signal?.aborted) throw new Error('Evaluation aborted; worker state is unavailable.');
    if (active.closed) throw new Error(`Eval worker is unavailable${active.errorOutput ? `: ${active.errorOutput}` : '; its state was lost.'}`);
    const id = `${process.pid}-${++active.nextId}`;
    const controller = new AbortController();
    const { promise, resolve, reject } = Promise.withResolvers<WorkerMessage>();
    active.pending.set(id, { resolve, reject });
    active.context = context;
    active.signal = controller.signal;
    const abort = () => {
      const pending = active.pending.get(id);
      if (!pending) return;
      controller.abort();
      active.pending.delete(id);
      pending.reject(new Error('Evaluation aborted; the worker was terminated and its in-memory state was lost.'));
      void stop(active);
    };
    const timer = setTimeout(() => {
      const pending = active.pending.get(id);
      if (!pending) return;
      controller.abort();
      active.pending.delete(id);
      pending.reject(new Error(`Evaluation exceeded ${timeout} ms; the worker was terminated and its in-memory state was lost.`));
      void stop(active);
    }, timeout);
    signal?.addEventListener('abort', abort, { once: true });
    try {
      send(active, { type: 'eval', id, code });
      const result = await promise;
      const output = [
        typeof result.stdout === 'string' && result.stdout ? `stdout:\n${result.stdout}` : '',
        typeof result.stderr === 'string' && result.stderr ? `stderr:\n${result.stderr}` : '',
        result.ok ? (typeof result.result === 'string' && result.result ? `result:\n${result.result}` : '') : `error:\n${String(result.error ?? 'Evaluation failed.')}`,
      ].filter(Boolean).join('\n');
      return { text: bound(output || '(no output)'), isError: result.ok !== true };
    } finally {
      clearTimeout(timer);
      controller.abort();
      signal?.removeEventListener('abort', abort);
      active.pending.delete(id);
      active.context = undefined;
      active.signal = undefined;
    }
  };
  const queued = active.queue.then(cell, cell);
  active.queue = queued.then(() => undefined, () => undefined);
  try { return await queued; }
  catch (error) {
    if (active.closed) { await active.closedPromise; if (state.kernels.get(language) === active) state.kernels.delete(language); }
    throw error;
  }
}

export default function evalExtension(pi: ExtensionAPI): void {
  const sessions = new Map<string, SessionState>();
  pi.on('session_start', async (_event, ctx) => {
    const current = ctx.sessionManager.getSessionId();
    await Promise.all([...sessions.keys()].filter(id => id !== current).map(id => clearSession(sessions, id)));
  });
  pi.on('session_shutdown', async (_event, ctx) => { await clearSession(sessions, ctx.sessionManager.getSessionId()); });
  pi.registerTool({
    name: 'eval', label: 'Eval', exposure: 'deferred', executionMode: 'sequential',
    description: 'Run code in persistent, session-scoped Python or JavaScript interpreters. Kernels start on first call, serialize evaluations per language, and reset on session replacement/shutdown. JS supports top-level await; Python host-tool calls are synchronous (`tools.read(path="README.md")`), JS calls are async (`await tools.read({path:"README.md"})`). Not a sandbox: code has this user’s filesystem, network, and process permissions. Use only trusted code. Output is bounded. Timeout/abort kills the worker and loses its state.',
    promptSnippet: 'Persistent Python/JavaScript evaluation with session-scoped globals and host tool access.',
    promptGuidelines: ['This is not a sandbox; evaluate only trusted code.', 'Persistent JavaScript REPL lexical declarations cannot be redeclared; use `var` or fresh names.', 'Python tool calls are synchronous: `tools.read(path="README.md")`; JavaScript calls are asynchronous: `await tools.read({path:"README.md"})`.'],
    parameters: Type.Object({ language: Type.Union([Type.Literal('py'), Type.Literal('js')]), code: Type.String({ minLength: 1, maxLength: 100_000 }), timeout: Type.Optional(Type.Integer({ minimum: 100, maximum: MAX_TIMEOUT })), reset: Type.Optional(Type.Boolean()) }),
    async execute(_id, params, signal, _onUpdate, ctx) {
      const id = ctx.sessionManager.getSessionId();
      let state = sessions.get(id);
      if (!state) { state = { kernels: new Map() }; sessions.set(id, state); }
      if (params.reset) {
        const previous = state.kernels.get(params.language);
        state.kernels.delete(params.language);
        if (previous) await stop(previous);
      }
      try {
        const result = await execute(state, params.language, params.code, params.timeout ?? DEFAULT_TIMEOUT, signal, ctx);
        return { content: [{ type: 'text', text: result.text }], details: { language: params.language, state: 'retained', reset: Boolean(params.reset) }, isError: result.isError };
      } catch (error) {
        const lost = !state.kernels.has(params.language) || state.kernels.get(params.language)?.closed;
        return { content: [{ type: 'text', text: `${messageOf(error)}${lost ? '\nWorker state is unavailable and will not be replayed; retry starts a fresh interpreter.' : ''}` }], details: { language: params.language, state: lost ? 'lost' : 'retained', reset: Boolean(params.reset) }, isError: true };
      }
    },
  });
  pi.registerCommand('eval-reset', {
    description: 'Terminate persistent eval kernels for this session: /eval-reset [py|js|all]',
    handler: async (args, ctx) => {
      const target = args.trim() || 'all';
      if (!['py', 'js', 'all'].includes(target)) { ctx.ui.notify('Usage: /eval-reset [py|js|all]', 'warning'); return; }
      const id = ctx.sessionManager.getSessionId();
      const state = sessions.get(id);
      if (!state) { ctx.ui.notify('No eval kernels are running.', 'info'); return; }
      const languages: Language[] = target === 'all' ? ['py', 'js'] : [target as Language];
      await Promise.all(languages.map(async language => {
        const kernel = state.kernels.get(language);
        state.kernels.delete(language);
        if (kernel) await stop(kernel);
      }));
      if (state.kernels.size === 0) sessions.delete(id);
      ctx.ui.notify(`Eval kernel state cleared: ${target}.`, 'info');
    },
  });
}
