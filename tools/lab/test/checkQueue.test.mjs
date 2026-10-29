// A check's tasks and the order the sessions take them in (node/checkQueue.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jobsOf } from '../node/check.mjs';
import { CheckQueue, pageOf, taskName, tasksOf } from '../node/checkQueue.mjs';

const names = (tasks) => tasks.map(taskName);
const jobs = () => jobsOf({ classes: ['warrior', 'mage'], ab: 'abc1234' }, { carry: null, swing: null });

test('the other sides not kept first, then every job on this tree, each side the longest last time first', () => {
  const durations = { 'carry-warrior': 60, 'swing-warrior': 300, 'carry-mage': 90, 'swing-mage@other': 10 };
  const runsOther = (job) => job.name.startsWith('swing');
  const tasks = tasksOf(jobs(), runsOther, durations);
  assert.deepEqual(names(tasks), [
    'swing-warrior@other', 'swing-mage@other',
    'swing-mage', 'swing-warrior', 'carry-mage', 'carry-warrior',
  ]);
});

test('a session takes the first task on the page it has up, else the first there is', () => {
  const queue = new CheckQueue(tasksOf(jobs(), () => false, {}));
  const first = queue.next(null).task;
  assert.equal(taskName(first), 'carry-warrior');
  const mage = queue.next('mine:mage:shared').task;
  assert.equal(pageOf(mage), 'mine:mage:shared');
  assert.equal(taskName(mage), 'carry-mage');
  assert.equal(taskName(queue.next('mine:mage:shared').task), 'swing-mage', 'the same hero\'s page, another command');
  assert.equal(taskName(queue.next('mine:mage:shared').task), 'swing-warrior');
  assert.equal(queue.next('mine:mage:shared'), null);
});

test('a job on this tree only once its other side is handed out, and then after it finishes', async () => {
  const queue = new CheckQueue(tasksOf(jobs().slice(0, 2), () => true, {}));
  assert.equal(taskName(queue.next('mine:mage:shared').task), 'carry-warrior@other', 'the other sides first');
  const other = queue.next('mine:mage:shared').task;
  assert.equal(taskName(other), 'carry-mage@other');
  let finish;
  queue.started(other, new Promise((resolve) => {
    finish = resolve;
  }));
  const { task, before } = queue.next('mine:mage:shared');
  assert.equal(taskName(task), 'carry-mage');
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
