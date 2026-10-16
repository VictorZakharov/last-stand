// A weapon's jumps between frames (page/jumps.ts): a frame it moved in many times as far as round it, against the
// median of the moves round it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jumpsIn, jumpsOf, median, stillestFrame } from '../page/jumps.ts';

const LEAST = 0.1;

/** A place `x` along a line. */
const along = (x) => ({ x, y: 0, z: 0 });
/** Frames of a tip at `places` along a line, each near the frame where `near` says. */
const framesAt = (places, near = () => true) =>
  places.map((x, i) => ({ frame: i, tip: along(x), weapon: 'right', near: near(i) }));
const REST = { frame: -1, tip: along(0), weapon: 'right', near: true };

test('the median of an odd count is its middle, of an even one the mean of the middle two', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([]), 0);
});

test('a blow that builds and falls over frames is no jump', () => {
  const moves = [0.02, 0.08, 0.25, 0.5, 0.75, 0.7, 0.45, 0.2, 0.05];
  assert.deepEqual(jumpsIn(moves, LEAST), []);
});

test('a short, fast blow is no jump, however still round it', () => {
  // (a dual wielder's cut as measured: three fast frames, the frame before the other hand's)
  const moves = [0.06, null, 0.22, 0.35, 0.23, 0.05, 0.09];
  assert.deepEqual(jumpsIn(moves, LEAST), []);
});

test('a leap to a new place in a frame is a jump', () => {
  // (Steel Tempest's turn through the eyes, as measured: 67 m/s between frames at 6 to 22)
  const moves = [0.36, 0.21, 0.18, 1.12, 0.1, 0.3, 0.25];
  const jumps = jumpsIn(moves, LEAST);
  assert.equal(jumps.length, 1);
  assert.equal(jumps[0].index, 3);
  assert.equal(jumps[0].moved, 1.12);
});

test('a blade out and back again in a frame is a jump, both ways', () => {
  const moves = [0.02, 0.03, 0.02, 0.3, 0.3, 0.02, 0.03, 0.02];
  assert.deepEqual(jumpsIn(moves, LEAST).map((jump) => jump.index), [3, 4]);
});

test('a move under the least is no jump, however still round it', () => {
  const moves = [0, 0, 0, 0.05, 0, 0, 0];
  assert.deepEqual(jumpsIn(moves, LEAST), []);
});

test('a jump at the start is measured against the frames after it', () => {
  const moves = [0.5, 0.02, 0.03, 0.02];
  assert.deepEqual(jumpsIn(moves, LEAST).map((jump) => jump.index), [0]);
});

test('a jump is seen with the weapon near the frame before it or at it, else unseen', () => {
  const places = [0, 0.02, 0.04, 0.06, 1.06, 1.08, 1.1, 1.12];
  const seenThere = jumpsOf(framesAt(places, (i) => i === 4), REST, LEAST);
  assert.deepEqual(seenThere.seen.map((jump) => jump.frame), [4]);
  const outOfIt = jumpsOf(framesAt(places, () => false), REST, LEAST);
  assert.deepEqual(outOfIt.seen, []);
  assert.deepEqual(outOfIt.unseen.map((jump) => jump.frame), [4]);
});

test('the stillest frame is the one whose moves round it are least, in or near the frame', () => {
  // (still from frame 6 on, but frame 9 hasn't a full round after it)
  const places = [0, 0.3, 0.6, 0.9, 1.2, 1.5, 1.6, 1.61, 1.62, 1.63, 1.64, 1.65];
  assert.equal(stillestFrame(framesAt(places), REST), 8);
  // (near up to frame 5 alone: its round is still slowing, the least of those)
  assert.equal(stillestFrame(framesAt(places, (i) => i < 6), REST), 5);
  assert.equal(stillestFrame(framesAt(places, () => false), REST), -1);
});

test('the tip passed to the other hand is no jump, nor counted round the next', () => {
  // (a blade in each hand: the tip on the left from frame 4, a metre across the view)
  const places = [0, 0.02, 0.04, 0.06, 1.06, 1.08, 1.1, 1.12];
  const frames = framesAt(places).map((frame, i) => ({ ...frame, weapon: i < 4 ? 'right' : 'left' }));
  assert.deepEqual(jumpsOf(frames, REST, LEAST), { seen: [], unseen: [] });
});
