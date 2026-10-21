import crypto from 'node:crypto';

function encodeTask(id, agent, contextId, key) {
  const body = Buffer.from(JSON.stringify({ id, agent, contextId, expires: Date.now() + 86400000 })).toString('base64url');
  return body + '.' + crypto.createHmac('sha256', key).update(body).digest('base64url');
}
function decodeTask(token, agent, contextId, key) {
  if (typeof token !== 'string' || token.length > 2048) throw Error('invalid_task_token');
  const [body, signature, extra] = token.split('.');
  if (!body || !signature || extra) throw Error('invalid_task_token');
  const expected = crypto.createHmac('sha256', key).update(body).digest();
  const supplied = Buffer.from(signature, 'base64url');
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) throw Error('invalid_task_token');
  const data = JSON.parse(Buffer.from(body, 'base64url').toString());
  if (data.agent !== agent || data.contextId !== contextId || data.expires < Date.now() || typeof data.id !== 'string' || !data.id) throw Error('invalid_task_token');
  return data.id;
}

export async function klausTask({ agent, contextId, key, url, prompt, taskToken, fetchImpl = fetch }) {
  if (Boolean(prompt) === Boolean(taskToken) || (prompt && (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 12000))) throw Error('invalid_arguments');
  const taskId = taskToken ? decodeTask(taskToken, agent, contextId, key) : undefined;
  const request = {
    jsonrpc: '2.0', id: crypto.randomUUID(), method: taskId ? 'GetTask' : 'SendMessage',
    params: taskId ? { id: taskId } : {
      message: { messageId: crypto.randomUUID(), role: 'ROLE_USER', contextId, parts: [{ text: prompt }] },
      configuration: { returnImmediately: true },
    },
  };
  // Submission is never retried automatically: a transport error can follow acceptance.
  const response = await fetchImpl(url, {
    method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(request), redirect: 'error', signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) { await response.body?.cancel(); throw Error('a2a_unavailable'); }
  const reader = response.body?.getReader();
  if (!reader) throw Error('a2a_unavailable');
  const parts = []; let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > 131072) { await reader.cancel(); throw Error('a2a_response_budget'); }
      parts.push(Buffer.from(value));
    }
  } finally { reader.releaseLock(); }
  const body = JSON.parse(Buffer.concat(parts).toString());
  const task = body?.result?.task ?? (taskId ? body?.result : undefined);
  if (body.error || !task || typeof task.id !== 'string' || task.contextId !== contextId || (taskId && task.id !== taskId)) throw Error('a2a_task_identity_invalid');
  const state = task.status?.state;
  if (state === 'TASK_STATE_COMPLETED') {
    const text = task.artifacts?.flatMap(x => x.parts ?? []).filter(x => typeof x.text === 'string').map(x => x.text).join('\n').trim();
    if (!text || Buffer.byteLength(text) > 65536) throw Error('a2a_no_final_reply');
    return { status: 'completed', text };
  }
  if (['TASK_STATE_FAILED', 'TASK_STATE_CANCELED', 'TASK_STATE_REJECTED'].includes(state)) return { status: 'failed', reason: 'remote_task_failed' };
  if (!['TASK_STATE_SUBMITTED', 'TASK_STATE_WORKING', 'TASK_STATE_INPUT_REQUIRED', 'TASK_STATE_AUTH_REQUIRED'].includes(state)) throw Error('a2a_unknown_task_state');
  return {
    status: state === 'TASK_STATE_INPUT_REQUIRED' ? 'input_required' : state === 'TASK_STATE_AUTH_REQUIRED' ? 'auth_required' : 'pending',
    task_token: taskToken ?? encodeTask(task.id, agent, contextId, key),
    instruction: 'Keep this task_token. Check this same task with task_token only; do not resubmit the prompt. Pending is not a completed reply. No automatic delivery to a human is implied.',
  };
}
