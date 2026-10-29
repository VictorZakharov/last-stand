// The processes above the lab, which it stops with (node/running.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ancestorsIn, isAlive, starters } from '../node/running.mjs';

const processes = (rows) => new Map(rows.map(([pid, parent, started]) => [pid, { parent, started }]));

test('every process above, the parent first, up to one that is gone', () => {
  const listed = processes([[50, 40, 5], [40, 30, 4], [30, 20, 3], [20, 999, 2]]);
  assert.deepEqual(ancestorsIn(listed, 50), [40, 30, 20]);
});

test('a parent started after its child is another process that took a dead parent\'s id', () => {
  const listed = processes([[50, 40, 5], [40, 30, 4], [30, 20, 3], [20, 1, 9]]);
  assert.deepEqual(ancestorsIn(listed, 50), [40, 30]);
});

test('this process\'s starters are alive, its parent among them', () => {
  const above = starters();
  assert.ok(above.includes(process.ppid));
  assert.ok(above.every(isAlive));
});
