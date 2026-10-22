// Which way a mesh's faces point (page/windingParts.ts): a mesh split into its parts, each part's signed volume.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { facingOf, partsOf } from '../page/windingParts.ts';

/** a unit cube's corners, and its twelve triangles wound to face out */
const CUBE = [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1];
const CUBE_OUT = [
  0, 2, 1, 0, 3, 2, // bottom (z 0), facing -z
  4, 5, 6, 4, 6, 7, // top (z 1), facing +z
  0, 1, 5, 0, 5, 4, // y 0, facing -y
  2, 3, 7, 2, 7, 6, // y 1, facing +y
  1, 2, 6, 1, 6, 5, // x 1, facing +x
  0, 4, 7, 0, 7, 3, // x 0, facing -x
];

/** `index` with each triangle wound the other way */
const turned = (index) => index.map((_, i) => index[i - (i % 3) + [0, 2, 1][i % 3]]);
/** `positions` moved by `by` */
const moved = (positions, by) => positions.map((value, i) => value + by[i % 3]);

test('a cube whose faces point out encloses its volume', () => {
  const [part] = partsOf(CUBE, CUBE_OUT);
  assert.ok(Math.abs(part.volume - 1) < 1e-9, `${part.volume}`);
  assert.equal(part.triangles, 12);
  assert.equal(facingOf(part), 'out');
});

test('a cube wound inside out encloses minus its volume', () => {
  const [part] = partsOf(CUBE, turned(CUBE_OUT));
  assert.equal(facingOf(part), 'in');
});

test('two cubes merged are two parts, each judged alone', () => {
  const positions = [...CUBE, ...moved(CUBE, [3, 0, 0])];
  const index = [...CUBE_OUT, ...turned(CUBE_OUT).map((corner) => corner + 8)];
  const facings = partsOf(positions, index).map(facingOf).sort();
  assert.deepEqual(facings, ['in', 'out']);
});

test('a mesh with no index (its corners three a triangle) splits by the corners it shares in place', () => {
  const positions = CUBE_OUT.flatMap((corner) => CUBE.slice(corner * 3, corner * 3 + 3));
  const parts = partsOf(positions, null);
  assert.equal(parts.length, 1);
  assert.equal(facingOf(parts[0]), 'out');
});

test('a cube with one face left off is still judged (a tube open at its foot)', () => {
  const [part] = partsOf(CUBE, CUBE_OUT.slice(6));
  assert.equal(part.openEdges, 4);
  assert.equal(facingOf(part), 'out');
});

test('a groove (a cube with its top and two sides off) is open, though it reads below 0 about its middle', () => {
  const groove = [...CUBE_OUT.slice(0, 6), ...CUBE_OUT.slice(12, 18), ...CUBE_OUT.slice(30, 36)];
  const [part] = partsOf(CUBE, groove);
  assert.equal(facingOf(part), 'open');
});

test('a flat card is open: neither way', () => {
  const card = [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0];
  const [part] = partsOf(card, [0, 1, 2, 0, 2, 3]);
  assert.equal(facingOf(part), 'open');
});
