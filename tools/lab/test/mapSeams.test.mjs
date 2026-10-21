// A map's seams (page/mapSeams.ts): the reads across its edges against the same reads inside it, and the canary's
// ramp.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { edgeReadOf, lineReads, seamsOf, withRamp } from '../page/mapSeams.ts';

const SIZE = 64;

/** A grey map `SIZE` square, each pixel `grey(x, y)` (0-255) in its albedo and its height. */
function mapOf(grey) {
  const albedo = new Uint8ClampedArray(SIZE * SIZE * 4);
  const rough = new Uint8ClampedArray(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const k = (y * SIZE + x) * 4;
      albedo.fill(grey(x, y), k, k + 3);
      albedo[k + 3] = 255;
      rough[k] = grey(x, y);
    }
  }
  return { size: SIZE, albedo, rough };
}

/** waves that repeat a whole number of times across the map, both ways */
const tiling = (x, y) => 128 + 60 * Math.sin((x / SIZE) * 6 * Math.PI) * Math.cos((y / SIZE) * 4 * Math.PI);

const seamsAt = (map) => seamsOf(map).filter((step) => step.seam).map((step) => `${step.channel} ${step.edge}`);

test('a map whose waves repeat across it has no seam', () => {
  assert.deepEqual(seamsAt(mapOf(tiling)), []);
});

test('a flat map has no seam', () => {
  assert.deepEqual(seamsAt(mapOf(() => 90)), []);
});

test('waves that stop short of a whole number across u leave a seam across u alone', () => {
  const short = (x, y) => 128 + 60 * Math.sin((x / SIZE) * 5.4 * Math.PI) * Math.cos((y / SIZE) * 4 * Math.PI);
  assert.deepEqual(seamsAt(mapOf(short)), ['albedo u', 'height u']);
});

test('the canary\'s ramp is a seam across u, on both channels, and none across v', () => {
  assert.deepEqual(seamsAt(withRamp(mapOf(tiling))), ['albedo u', 'height u']);
});

test('sharp lines inside the map, one at its edge, are no seam', () => {
  const stripes = (x) => (x % 16 === 0 ? 40 : 200);
  assert.deepEqual(seamsAt(mapOf(stripes)), []);
});

/** slabs 16 px wide between bevelled joints (60 deep over 3 px a side) at 8, 24, 40 and 56, each its own shade */
const slabs = (shades) => (x) => {
  const joint = Math.min(...[8, 24, 40, 56].map((at) => Math.abs(x - at)));
  const shade = shades[Math.floor((x + 8) / 16)];
  return shade - Math.max(0, 3 - joint) * 20;
};

test('a slab shaded otherwise either side of the edge is a seam, though its joints step further', () => {
  assert.deepEqual(seamsAt(mapOf(slabs([150, 120, 160, 130, 165]))), ['albedo u', 'height u']);
});

test('slabs whose shades meet again at the edge have no seam', () => {
  assert.deepEqual(seamsAt(mapOf(slabs([150, 120, 160, 130, 150]))), []);
});

test('each line\'s step is to the next, the last one\'s round to the first', () => {
  const values = [0, 1, 3, 6, 10, 15, 21, 28];
  // (two rows: 0 1 3 6 and 10 15 21 28)
  assert.deepEqual([...lineReads(values, 4, 2, 'u').steps], [3, 4, 5, 12]);
  assert.deepEqual([...lineReads(values, 4, 2, 'v').steps], [16, 16]);
});

test('a step past both its neighbours\' steps is a jump', () => {
  const values = [10, 10, 10, 10, 30, 30, 30, 30];
  assert.deepEqual([...lineReads(values, 8, 1, 'u').jumps], [0, 0, 0, 1, 0, 0, 0, 1]);
});

test('an edge\'s read is a seam\'s only past every line inside and twice their median', () => {
  assert.equal(edgeReadOf([2, 2, 2, 5], 1).seam, true);
  assert.equal(edgeReadOf([2, 2, 6, 5], 1).seam, false);
  assert.equal(edgeReadOf([2, 2, 2, 3.5], 1).seam, false);
  assert.equal(edgeReadOf([0.1, 0.1, 0.1, 0.5], 1).seam, false);
});
