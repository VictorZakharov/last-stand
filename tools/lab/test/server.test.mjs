// The lab's server's plumbing (node/server.mjs): whom it answers, and its work done in order.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Queue, refusal } from '../node/server.mjs';

const PORT = 5196;

/** A request as the lab's command line sends it, with `changes` made. */
function requestWith(changes = {}) {
  const headers = { host: `127.0.0.1:${PORT}`, 'content-type': 'application/json', ...changes.headers };
  return { method: changes.method ?? 'POST', headers };
}

test("answers the lab's command line", () => {
  assert.equal(refusal(requestWith(), PORT), null);
  assert.equal(refusal(requestWith({ headers: { host: `localhost:${PORT}` } }), PORT), null);
});

test('refuses what a web page could send', () => {
  assert.equal(refusal(requestWith({ headers: { origin: 'https://example.com' } }), PORT), 'not from a web page');
  assert.equal(refusal(requestWith({ headers: { 'content-type': 'text/plain' } }), PORT), 'only JSON');
  assert.equal(refusal(requestWith({ method: 'GET' }), PORT), 'only POST');
  assert.equal(refusal(requestWith({ method: 'OPTIONS' }), PORT), 'only POST');
  // (a web page's own name pointed at 127.0.0.1)
  assert.match(refusal(requestWith({ headers: { host: `evil.example:${PORT}` } }), PORT), /^not for host/);
});

test('work runs one piece at a time, in order, past failures', async () => {
  const queue = new Queue();
  const order = [];
  const slow = queue.add(async () => {
    await new Promise((resolveWait) => setTimeout(resolveWait, 20));
    order.push('slow');
  });
  const failing = queue.add(() => {
    order.push('failing');
    throw new Error('it failed');
  });
  const fast = queue.add(() => order.push('fast'));
  await slow;
  await assert.rejects(failing, /it failed/);
  await fast;
  assert.deepEqual(order, ['slow', 'failing', 'fast']);
});
