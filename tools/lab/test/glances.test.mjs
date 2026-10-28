// A head's glances read from its turn (page/glances.ts): the runs turned aside, their spacing, a loop, speed and
// jerks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fastest, gapsBetween, glancesIn, jerksIn, joinAcross, largestJerk, looped, spread, startsApart,
} from '../page/glances.ts';

/** `count` frames of a turn held at `degrees`. */
const held = (count, degrees) => Array.from({ length: count }, () => degrees);

test('a turn past the bar either way is a glance, with its peak and side', () => {
  const turns = [...held(5, 0), 12, 30, 25, 4, ...held(3, 0), -11, -20, 0];
  const glances = glancesIn(turns, 10);
  assert.equal(glances.length, 2);
  assert.deepEqual(glances[0], { start: 5, end: 7, peak: 30, side: 1 });
  assert.deepEqual(glances[1], { start: 12, end: 13, peak: -20, side: -1 });
});

test('the idle sway under the bar is no glance', () => {
  assert.deepEqual(glancesIn([2, -3, 4, -1, 9.9], 10), []);
});

test('glances are spaced by their starts and by the gaps between them', () => {
  const glances = [{ start: 0, end: 60 }, { start: 300, end: 360 }, { start: 420, end: 480 }];
  assert.deepEqual(startsApart(glances, 60), [5, 2]);
  assert.deepEqual(gapsBetween(glances, 60), [4, 1]);
});

test('glances evenly apart are a loop, random ones are not', () => {
  assert.equal(looped([4, 4.1, 3.9, 4]), true);
  assert.equal(looped([3, 6.5, 4.2, 8]), false);
  assert.equal(looped([4, 4]), false, 'two gaps are too few to call a loop');
  assert.ok(spread([3, 6.5, 4.2, 8]) > 1);
  assert.equal(spread([4, 4, 4]), 0);
});

test('the fastest turn is its largest move a frame times the rate', () => {
  assert.deepEqual(fastest([0, 1, 3, 4], 60), { speed: 120, index: 2 });
});

test('a glance carried across to the other side is one glance; one after a wait is another', () => {
  const left = { start: 0, end: 100, peak: 30, side: 1 };
  const across = { start: 120, end: 200, peak: -40, side: -1 };
  assert.deepEqual(joinAcross([left, across], 60), [{ start: 0, end: 200, peak: -40, side: 1 }]);
  const later = { start: 400, end: 450, peak: -20, side: -1 };
  assert.equal(joinAcross([left, later], 60).length, 2);
  const sameSide = { start: 120, end: 200, peak: 25, side: 1 };
  assert.equal(joinAcross([left, sameSide], 60).length, 2);
});

test('a smooth turn has no jerk; a frame kicked out and back has one', () => {
  const smooth = Array.from({ length: 60 }, (_, i) => 30 * (1 - Math.cos((i / 59) * Math.PI)) / 2);
  assert.deepEqual(jerksIn(smooth, 0.6), []);
  const kicked = [...smooth];
  kicked[30] += 3;
  const jerks = jerksIn(kicked, 0.6);
  assert.ok(jerks.some((jerk) => jerk.index === 31 && jerk.jerk > 5));
  assert.ok(largestJerk(kicked).jerk > 5);
});
