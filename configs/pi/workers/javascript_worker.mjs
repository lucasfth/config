import { writeSync } from 'node:fs';
import { PassThrough } from 'node:stream';
import { createInterface } from 'node:readline';
import repl from 'node:repl';
import { inspect } from 'node:util';

const protocol = { write: message => writeSync(3, message) };
const input = new PassThrough();
const output = new PassThrough();
const outputChunks = [];
let outputLength = 0;
output.on('data', chunk => { const text = String(chunk).slice(0, Math.max(0, 48000 - outputLength)); if (text) { outputChunks.push(text); outputLength += text.length; } });
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
const pendingTools = new Map();
let sequence = 0;
let active = false;
let stdout = '';
let stderr = '';
const send = message => protocol.write(`${JSON.stringify(message)}\n`);

const tools = new Proxy(Object.create(null), {
  get(_target, name) {
    if (typeof name !== 'string') return undefined;
    return args => {
      const { promise, resolve, reject } = Promise.withResolvers();
      const id = `tool-${++sequence}`;
      pendingTools.set(id, { resolve, reject });
      send({ type: 'tool_call', id, name, args });
      return promise;
    };
  },
});

const server = repl.start({
  prompt: '', input, output, terminal: false, useGlobal: false, ignoreUndefined: true,
  writer: value => inspect(value, { depth: 3, maxArrayLength: 100, maxStringLength: 20_000 }),
});
server.context.tools = tools;
const evaluate = server.eval;
let activeFailure;
const nativeHandleError = server._handleError?.bind(server);
server._handleError = error => { if (activeFailure) { activeFailure(error); return; } return nativeHandleError?.(error); };
server.on('error', error => activeFailure?.(error));

function restoreStreams(originalOut, originalErr) {
  process.stdout.write = originalOut;
  process.stderr.write = originalErr;
}

function run(message) {
  active = true;
  stdout = '';
  stderr = '';
  outputChunks.length = 0;
  outputLength = 0;
  const originalOut = process.stdout.write.bind(process.stdout);
  const originalErr = process.stderr.write.bind(process.stderr);
  process.stdout.write = (chunk, ..._args) => { stdout = (stdout + String(chunk)).slice(0, 48000); return true; };
  process.stderr.write = (chunk, ..._args) => { stderr = (stderr + String(chunk)).slice(0, 48000); return true; };
  const complete = (error, value) => {
    if (!active) return;
    restoreStreams(originalOut, originalErr);
    active = false;
    activeFailure = undefined;
    if (error) {
      send({ type: 'eval_result', id: message.id, ok: false, error: error.stack ?? String(error), stdout, stderr });
      return;
    }
    const replOutput = outputChunks.join('');
    const result = value === undefined ? '' : inspect(value, { depth: 3, maxArrayLength: 100, maxStringLength: 20_000 });
    send({ type: 'eval_result', id: message.id, ok: true, result, stdout: stdout || replOutput, stderr });
  };
  activeFailure = error => complete(error);
  try { evaluate.call(server, message.code + '\n', server.context, '<pi-eval>', complete); }
  catch (error) { complete(error); }
}

lines.on('line', line => {
  let message;
  try { message = JSON.parse(line); }
  catch (error) { send({ type: 'protocol_error', error: String(error) }); return; }
  if (message.type === 'tool_result') {
    const pending = pendingTools.get(message.id);
    if (!pending) return;
    pendingTools.delete(message.id);
    if (message.outcome?.isError) pending.reject(new Error(message.outcome.error ?? 'Tool call failed'));
    else pending.resolve(message.outcome?.result);
    return;
  }
  if (message.type === 'shutdown') {
    for (const pending of pendingTools.values()) pending.reject(new Error('Eval worker is shutting down.'));
    pendingTools.clear();
    server.close();
    process.exit(0);
  }
  if (message.type !== 'eval' || active) {
    send({ type: 'protocol_error', error: 'unexpected or concurrent eval request' });
    return;
  }
  run(message);
});
