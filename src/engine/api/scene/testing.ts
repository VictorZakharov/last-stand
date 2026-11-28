// What the scene's tests share: numbers compared to a tolerance, the geometries three made for them.
import assert from 'node:assert/strict';
import { Attribute, Geometry } from '../geometry/index.ts';
import { BOX_INDEX, BOX_NORMAL, BOX_POSITION, BOX_UV, SPHERE_INDEX, SPHERE_POSITION } from './raycast.fixtures.ts';

/** Asserts `actual` matches `expected` number by number within `within`. */
export function near(actual: ArrayLike<number>, expected: readonly number[], within = 1e-6, what = ''): void {
  assert.equal(actual.length, expected.length, `${what}: length`);
  for (let i = 0; i < expected.length; i++) {
    const off = Math.abs(actual[i] - expected[i]);
    assert.ok(off <= within, `${what}[${i}]: ${actual[i]} is not ${expected[i]} (within ${within})`);
  }
}

/** three 0.187's `BoxGeometry(2, 2, 2)`, as numbers it made. */
export function threeBox(): Geometry {
  const geometry = new Geometry();
  geometry.setAttribute('position', new Attribute(new Float32Array(BOX_POSITION), 3));
  geometry.setAttribute('normal', new Attribute(new Float32Array(BOX_NORMAL), 3));
  geometry.setAttribute('uv', new Attribute(new Float32Array(BOX_UV), 2));
  geometry.setIndex(BOX_INDEX);
  return geometry;
}

/** three 0.187's `SphereGeometry(1, 8, 6)`'s positions and index. */
export function threeSphere(): Geometry {
  const geometry = new Geometry();
  geometry.setAttribute('position', new Attribute(new Float32Array(SPHERE_POSITION), 3));
  geometry.setIndex(SPHERE_INDEX);
  return geometry;
}
