// A check's tasks and the order the sessions take them in (node/checkQueue.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jobsOf } from '../node/check.mjs';
import { CheckQueue, pageOf, taskName, tasksOf } from '../node/checkQueue.mjs';

const names = (tasks) => tasks.map(taskName);
const jobs = () => jobsOf({ commands: ['range', 'stops'], classes: ['warrior', 'mage'], ab: 'abc1234' });

test('the other sides not kept first, then every job on this tree, each side the longest last time first', () => {
  const durations = { 'range-warrior': 60, 'stops-warrior': 300, 'range-mage': 90, 'stops-mage@other': 10 };
  const runsOther = (job) => job.name.startsWith('stops');
  const tasks = tasksOf(jobs(), runsOther, durations);
  assert.deepEqual(names(tasks), [
    'stops-warrior@other', 'stops-mage@other',
    'stops-mage', 'stops-warrior', 'range-mage', 'range-warrior',
  ]);
});

test('a session takes the first task on the page it has up, else the first there is', () => {
  const queue = new CheckQueue(tasksOf(jobs(), () => false, {}));
  const first = queue.next(null).task;
  assert.equal(taskName(first), 'range-warrior');
  const mage = queue.next('mine:mage:range').task;
  assert.equal(pageOf(mage), 'mine:mage:range');
  assert.equal(taskName(mage), 'range-mage');
  assert.equal(taskName(queue.next('mine:mage:range').task), 'stops-warrior', 'no page of another command kept');
  assert.equal(taskName(queue.next('mine:mage:stops').task), 'stops-mage');
  assert.equal(queue.next('mine:mage:stops'), null);
});

test('a job on this tree only once its other side is handed out, and then after it finishes', async () => {
  const queue = new CheckQueue(tasksOf(jobs().slice(0, 2), () => true, {}));
  assert.equal(taskName(queue.next('mine:mage:range').task), 'range-warrior@other', 'the other sides first');
  const other = queue.next('mine:mage:range').task;
  assert.equal(taskName(other), 'range-mage@other');
  let finish;
  queue.started(other, new Promise((resolve) => {
    finish = resolve;
  }));
  const { task, before } = queue.next('mine:mage:range');
  assert.equal(taskName(task), 'range-mage');
  let waited = false;
  const waiting = before.then(() => {
    waited = true;
  });
  await Promise.resolve();
  assert.equal(waited, false);
  finish();
  await waiting;
  assert.equal(waited, true);
});
