import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

// The fixture's session_start writes this file. Unlike PTY event subscriptions,
// a durable marker cannot be lost if the child becomes ready before we wait.
export async function waitForSessionReady(file, timeoutMs = 15000) {
  const deadline = performance.now() + timeoutMs;
  while (true) {
    try { const id = await readFile(file, 'utf8'); if (id) return id; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (performance.now() >= deadline) throw new Error('PTY session-start file was not ready before deadline');
    await delay(20);
  }
}
