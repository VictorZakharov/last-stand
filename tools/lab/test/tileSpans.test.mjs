// A map's tile on a surface (page/tileSpans.ts): the metres a tile covers along u and v on a triangle, and a reading's
// spread over a surface's triangles weighed by their area.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spreadOf, stretchOf, triangleTile, weightedShares } from '../page/tileSpans.ts';

/** a board 2 m along x and 0.5 m along z, as its first triangle's corners: in the world, and in the map (0 to 1) */
const BOARD = [0, 0, 0, 2, 0, 0, 2, 0, 0.5];
const BOARD_MAP = [0, 0, 1, 0, 1, 1];

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} is not ${expected}`);

test('a board with the map laid once across it has a tile its size', () => {
  const tile = triangleTile(BOARD, BOARD_MAP);
  near(tile.u, 2);
  near(tile.v, 0.5);
  near(tile.area, 0.5);
  near(stretchOf(tile), 4);
});

test('the map repeated twice along u has a tile half as long', () => {
  const tile = triangleTile(BOARD, BOARD_MAP.map((t, i) => (i % 2 === 0 ? 2 * t : t)));
  near(tile.u, 1);
  near(tile.v, 0.5);
});

test('a tile is the same however the board is turned in the world and whichever corner comes first', () => {
  const turned = [0, 0, 0, 0, 2, 0, 0, 2, 0.5];
  const world = [...turned.slice(3), ...turned.slice(0, 3)];
  const tile = triangleTile(world, [...BOARD_MAP.slice(2), ...BOARD_MAP.slice(0, 2)]);
  near(tile.u, 2);
  near(tile.v, 0.5);
});

test('a triangle sheared in the map still reads its tile', () => {
  // u runs along x, v along z, and the map's corners sheared: (0,0), (1,0), (0.5,1)
  const tile = triangleTile([0, 0, 0, 3, 0, 0, 1.5, 0, 2], [0, 0, 1, 0, 0.5, 1]);
  near(tile.u, 3);
  near(tile.v, 2);
});

test('corners on a line in the map give no tile', () => {
  assert.equal(triangleTile(BOARD, [0, 0, 0.5, 0.5, 1, 1]), undefined);
});

test('a share of the weight is found where the weights add up to it', () => {
  assert.deepEqual(weightedShares([3, 1, 2], [8, 1, 1], [0.1, 0.2, 0.5]), [1, 2, 3]);
  assert.deepEqual(weightedShares([5], [1], [0, 0.5, 1]), [5, 5, 5]);
});

test('a spread is its values at a tenth, half and nine tenths of the weight', () => {
  const values = Array.from({ length: 100 }, (_, i) => i + 1);
  assert.deepEqual(spreadOf(values, values.map(() => 1)), { low: 10, mid: 50, high: 90 });
});
