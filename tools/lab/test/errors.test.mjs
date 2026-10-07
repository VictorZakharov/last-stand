// A failed command's error as the lab reports it (node/errors.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeError, labError } from '../node/errors.mjs';

const pageStack = [
  '    at sheet (http://localhost:5190/tools/lab/page/sheet.ts:67:21)',
  '    at probe (http://localhost:5190/.tmp/mine.ts?t=1759821234567:3:9)',
].join('\n');

test("the lab's own errors from the page are their message alone", () => {
  const error = new Error(`page.evaluate: Error: lab: no state nope (the states: stand, walk, full)\n${pageStack}`);
  assert.equal(describeError(error), 'lab: no state nope (the states: stand, walk, full)');
});

test('anything else from the page keeps its stack, the addresses shortened', () => {
  const error = new Error(`page.evaluate: TypeError: x is undefined\n${pageStack}`);
  assert.equal(describeError(error), [
    'x is undefined',
    '    at sheet (tools/lab/page/sheet.ts:67:21)',
    '    at probe (.tmp/mine.ts:3:9)',
  ].join('\n'));
});

test("Node's own errors: the lab's alone, a bug with its stack", () => {
  assert.equal(describeError(labError('--at: two numbers')), 'lab: --at: two numbers');
  const bug = describeError(new TypeError('cannot read x'));
  assert.match(bug, /^cannot read x\n {4}at /);
});
