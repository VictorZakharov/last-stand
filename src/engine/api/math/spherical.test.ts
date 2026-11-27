// `Spherical` against values worked by hand.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Spherical } from './spherical.ts';
import { Vec3 } from './vec3.ts';
import { assertNear } from './testing.ts';

/** a spherical's three numbers */
function numbers(spherical: Spherical): number[] {
  return [spherical.radius, spherical.phi, spherical.theta];
}

test('from a point: phi down from +y, theta round from +z towards +x', () => {
  assertNear(numbers(new Spherical().setFromVector3(new Vec3(0, 2, 0))), [2, 0, 0]);
  assertNear(numbers(new Spherical().setFromCartesianCoords(3, 0, 0)), [3, Math.PI / 2, Math.PI / 2]);
  assertNear(numbers(new Spherical().setFromCartesianCoords(0, 0, -1)), [1, Math.PI / 2, Math.PI]);
  assertNear(numbers(new Spherical().setFromCartesianCoords(0, 0, 0)), [0, 0, 0]);
  const point = new Vec3(1, -2, 3);
  const back = new Vec3().setFromSpherical(new Spherical().setFromVector3(point));
  assertNear(back.toArray(), point.toArray(), 1e-15);
});

test('makeSafe keeps phi off the poles; set, copy, clone', () => {
  assert.equal(new Spherical(1, 0, 0).makeSafe().phi, 0.000001);
  assert.equal(new Spherical(1, Math.PI, 0).makeSafe().phi, Math.PI - 0.000001);
  const spherical = new Spherical().set(2, 0.5, 1);
  assert.deepEqual(numbers(new Spherical().copy(spherical)), [2, 0.5, 1]);
  assert.deepEqual(numbers(spherical.clone()), [2, 0.5, 1]);
});
