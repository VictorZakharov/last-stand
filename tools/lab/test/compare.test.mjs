// An A/B's verdict on two reports (node/compare.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeDifferences, lineEdits } from '../node/compare.mjs';

const kinds = (edits) => edits.map((edit) => `${edit.kind[0]}${edit.line}`).join(' ');

test('a report against itself agrees', () => {
  const report = 'stand: 0 of 70 frames clip\n  string: clear';
  assert.equal(describeDifferences('a', report, 'b', report), 'A/B: the two sides agree, line for line');
});

test('edits keep the order of both sides', () => {
  assert.equal(kinds(lineEdits(['a', 'b', 'c'], ['a', 'x', 'c'])), 'sa rb ax sc');
  assert.equal(kinds(lineEdits(['a'], ['a', 'b'])), 'sa ab');
  assert.equal(kinds(lineEdits(['a', 'b'], ['b'])), 'ra sb');
  assert.equal(kinds(lineEdits([], [])), '');
});

test('long reports with a change in the middle', () => {
  const before = Array.from({ length: 5000 }, (_, i) => `line ${i}`);
  const after = [...before];
  after[2500] = 'changed';
  const edits = lineEdits(before, after);
  assert.equal(edits.length, 5001);
  assert.deepEqual(edits.filter((edit) => edit.kind !== 'same').map((edit) => edit.line), ['line 2500', 'changed']);
});

test('the lines that differ are shown under their section', () => {
  const before = 'stand: 0 of 70 frames clip\n  string: clear\nwalk: 2 of 70 frames clip\n  string: clear';
  const after = 'stand: 0 of 70 frames clip\n  string: clear\nwalk: 2 of 70 frames clip\n  string: hips 1.0 cm';
  const verdict = describeDifferences('main', before, 'this tree', after).split('\n');
  assert.deepEqual(verdict, [
    'A/B: 2 lines differ (- main, + this tree)',
    '  walk: 2 of 70 frames clip',
    '-   string: clear',
    '+   string: hips 1.0 cm',
  ]);
});
