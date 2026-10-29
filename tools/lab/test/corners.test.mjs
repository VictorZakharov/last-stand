// A mesh's distinct corners (page/corners.ts): the first point at each place, found once until the geometry changes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distinctCorners } from '../page/corners.ts';

/** Positions holding `points` ([x, y, z] each), at `version`. */
function positionsOf(points, version = 0) {
  return {
    count: points.length,
    version,
    getX: (i) => points[i][0],
    getY: (i) => points[i][1],
    getZ: (i) => points[i][2],
  };
}

test('each place once, at its first point, in their order', () => {
  const positions = positionsOf([[0, 0, 0], [1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 0, 0]]);
  assert.deepEqual(distinctCorners(positions), [0, 1, 3]);
});

test('places apart by their last bit are apart', () => {
  const positions = positionsOf([[0.1, 0, 0], [0.1 + 2 ** -56, 0, 0]]);
  assert.deepEqual(distinctCorners(positions), [0, 1]);
});

test('found again once the geometry changes', () => {
  const points = [[0, 0, 0], [0, 0, 0]];
  const positions = positionsOf(points);
  assert.deepEqual(distinctCorners(positions), [0]);
  points[1] = [2, 0, 0];
  assert.deepEqual(distinctCorners(positions), [0], 'kept while its version stands');
  positions.version++;
  assert.deepEqual(distinctCorners(positions), [0, 1]);
});
