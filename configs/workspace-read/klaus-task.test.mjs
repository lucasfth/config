import test from 'node:test';
import assert from 'node:assert/strict';
import { klausTask } from './klaus-task.mjs';
const config = { agent: 'kristian', contextId: 'mini-kristian-main-v1', key: 'test-key', url: 'https://example.invalid/a2a/v1' };
const task = state => ({ id: 'task-123', contextId: config.contextId, status: { state } });

test('submit once, return task reference, then fetch the same completed task', async () => {
  const requests = [];
  const fetchImpl = async (_url, options) => {
    assert.equal(options.redirect, 'error');
    const request = JSON.parse(options.body); requests.push(request);
    if (requests.length === 1) return Response.json({ result: { task: task('TASK_STATE_WORKING') } });
    return Response.json({ result: { task: { ...task('TASK_STATE_COMPLETED'), artifacts: [{ parts: [{ text: 'KLAUS_OK' }] }] } } });
  };
  const pending = await klausTask({ ...config, prompt: 'hello', fetchImpl });
  assert.equal(pending.status, 'pending');
  assert.equal(requests[0].params.configuration.returnImmediately, true);
  const done = await klausTask({ ...config, taskToken: pending.task_token, fetchImpl });
  assert.deepEqual(done, { status: 'completed', text: 'KLAUS_OK' });
  assert.equal(requests[1].method, 'GetTask');
  assert.deepEqual(requests[1].params, { id: 'task-123' });
});

test('task reference cannot be forged, reused by another agent or changed context', async () => {
  const pending = await klausTask({ ...config, prompt: 'hello', fetchImpl: async () => Response.json({ result: { task: task('TASK_STATE_WORKING') } }) });
  const fetchImpl = () => { throw Error('must_not_fetch'); };
  for (const override of [{ agent: 'other' }, { contextId: 'different' }, { taskToken: pending.task_token + 'x' }]) {
    await assert.rejects(klausTask({ ...config, taskToken: pending.task_token, ...override, fetchImpl }), /invalid_task_token/);
  }
});

test('reject remote task with mismatching identity', async () => {
  await assert.rejects(klausTask({ ...config, prompt: 'hello', fetchImpl: async () => Response.json({ result: { task: { ...task('TASK_STATE_WORKING'), contextId: 'other' } } }) }), /a2a_task_identity_invalid/);
});

test('submission transport failure is not replayed', async () => {
  let count = 0;
  await assert.rejects(klausTask({ ...config, prompt: 'hello', fetchImpl: async () => { count++; throw Error('transport'); } }), /transport/);
  assert.equal(count, 1);
});

test('bounded response rejects oversized payload', async () => {
  await assert.rejects(klausTask({ ...config, prompt: 'hello', fetchImpl: async () => new Response('x'.repeat(131073)) }), /a2a_response_budget/);
});

test('missing, duplicate action and remote terminal failure are explicit', async () => {
  for (const args of [{}, { prompt: 'hello', taskToken: 'invalid' }]) await assert.rejects(klausTask({ ...config, ...args }), /invalid_arguments/);
  const result = await klausTask({ ...config, prompt: 'hello', fetchImpl: async () => Response.json({ result: { task: task('TASK_STATE_FAILED') } }) });
  assert.deepEqual(result, { status: 'failed', reason: 'remote_task_failed' });
});
