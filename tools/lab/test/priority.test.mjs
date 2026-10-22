// The lab lowers its own priority as it starts (node/priority.mjs, #283).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { constants, getPriority } from 'node:os';
import { LAB_PRIORITY, lowerPriority, priorityName } from '../node/priority.mjs';

test('the priorities are named as Windows names them', () => {
  assert.equal(priorityName(constants.priority.PRIORITY_BELOW_NORMAL), 'below normal');
  assert.equal(priorityName(constants.priority.PRIORITY_NORMAL), 'normal');
  assert.equal(priorityName(3), 'nice 3');
});

test('a process at a higher priority is lowered to the lab\'s, and says so', () => {
  const said = lowerPriority();
  // (a lower number is a higher priority: lowered to the lab's, or left where it already was below it)
  assert.ok(getPriority() >= LAB_PRIORITY, `still at ${priorityName(getPriority())}`);
  assert.equal(said, priorityName(getPriority()));
});
