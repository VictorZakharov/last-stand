// The neck's measures (page/neckMeasure.ts): the free neck up a line, the ridges and shelves on it, the seams where
// the head's skin takes over from the neck's, a ring's girth and the colours' difference.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deltaE, freeNecks, girthOf, ridgeOf, seamsOf, shelfOf } from '../page/neckMeasure.ts';

const SKIN = [0.5, 0.3, 0.2];

/** A line's samples, a row each 2 mm up from `y0`: `rows` of [radius, tilt, kind], kind 'neck' unless given. */
function line(rows, y0 = -40) {
  return rows.map(([r, tilt, kind = 'neck', colour = SKIN], row) => ({ y: y0 + 2 * row, r, tilt, kind, colour }));
}

/** A straight column of skin `count` rows long. */
const column = (count, kind = 'neck') => Array.from({ length: count }, () => [65, 0, kind]);

test('the free neck runs from the first skin over the clothes up to the hair', () => {
  const samples = line([[80, 0, 'cloth'], [80, 0, 'cloth'], ...column(5), [70, 0, 'hair'], [65, 0]]);
  assert.deepEqual(freeNecks(samples), [[2, 6]]);
});

test('the free neck stops where the jaw stands out over it', () => {
  const samples = line([...column(4), [66, -30], [100, -10, 'face'], [101, 0, 'face']]);
  assert.deepEqual(freeNecks(samples), [[0, 4]]);
});

test('a beard over the neck leaves no free neck, the lips over it the face\'s', () => {
  const samples = line([[80, 0, 'cloth'], [90, 0, 'hair'], [90, 0, 'hair'], [92, 0, 'face'], [92, 40, 'face']]);
  assert.deepEqual(freeNecks(samples), []);
});

test('the neck in a slot under the collar and above it are two runs', () => {
  const samples = line([[80, 0, 'cloth'], ...column(3), [75, 0, 'cloth'], [75, 0, 'cloth'], ...column(4)]);
  assert.deepEqual(freeNecks(samples), [[1, 3], [6, 9]]);
});

test('a line with no skin has no free neck', () => {
  assert.deepEqual(freeNecks(line([[80, 0, 'cloth'], [90, 0, 'hair']])), []);
});

test('a straight column has no ridge and faces up nowhere', () => {
  const samples = line(column(12));
  const run = freeNecks(samples)[0];
  assert.equal(ridgeOf(samples, run).turn, 0);
  assert.equal(shelfOf(samples, run).tilt, 0);
});

test('a neck turning down into the skull has no ridge', () => {
  const samples = line([...column(6), [66, -10], [68, -25], [71, -40], [75, -50]]);
  assert.equal(ridgeOf(samples, freeNecks(samples)[0]).turn, 0);
});

test('a ledge standing out of the skin reads as a ridge and a shelf where it is', () => {
  // (the column neck's flat top under the ranger's ears: level, then facing up 48 and 60 degrees, then back in)
  const samples = line([...column(6), [70, -8, 'face'], [67, 48, 'face'], [62, 60, 'face'], [62, 12, 'face'],
    [62, -5, 'face'], [63, -20, 'face']]);
  const run = freeNecks(samples)[0];
  const ridge = ridgeOf(samples, run);
  assert.ok(ridge.turn >= 60, `ridge ${ridge.turn}`);
  assert.equal(ridge.at, 6);
  assert.deepEqual(shelfOf(samples, run), { tilt: 60, at: 8 });
});

test('a seam where the head\'s skin stands out over the neck\'s reads its step and the paints\' difference', () => {
  const pale = [0.6, 0.4, 0.3];
  const samples = line([...column(4), [67.5, 0, 'face', pale], [67.5, 0, 'face', pale], [67.5, 0, 'face', pale]]);
  const seams = seamsOf(samples, freeNecks(samples)[0]);
  assert.equal(seams.length, 1);
  assert.equal(seams[0].at, 3);
  assert.ok(Math.abs(seams[0].step - 2.5) < 1e-9, `step ${seams[0].step}`);
  assert.ok(seams[0].dE > 3, `dE ${seams[0].dE}`);
});

test('a seam the skins meet smoothly at reads no step and no colour', () => {
  const samples = line([...column(4), ...column(4, 'face')]);
  const [seam] = seamsOf(samples, freeNecks(samples)[0]);
  assert.equal(seam.step, 0);
  assert.equal(seam.dE, 0);
});

test('a ring of points round a circle is its circumference', () => {
  const degrees = Array.from({ length: 360 }, (_, k) => k * Math.PI / 180);
  const points = degrees.map((angle) => [50 * Math.sin(angle), 50 * Math.cos(angle)]);
  assert.ok(Math.abs(girthOf(points) - 2 * Math.PI * 50) < 0.01);
});

test('a colour is no different from itself, and black from white by 100', () => {
  assert.equal(deltaE(SKIN, SKIN), 0);
  assert.ok(Math.abs(deltaE([0, 0, 0], [1, 1, 1]) - 100) < 0.01);
});
