// `Vec2` against values worked by hand.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Mat3 } from './mat3.ts';
import { Vec2 } from './vec2.ts';
import { assertNear } from './testing.ts';

test('Vec2: in place and chainable', () => {
  const vector = new Vec2(1, 2);
  assert.equal(vector.add(new Vec2(2, 2)).multiplyScalar(2), vector);
  assertNear(vector.toArray(), [6, 8]);
  assert.equal(vector.length(), 10);
  assertNear(vector.clone().normalize().toArray(), [0.6, 0.8]);
  assertNear(vector.clone().setLength(5).toArray(), [3, 4]);
  assertNear(vector.clone().sub(new Vec2(6, 8)).toArray(), [0, 0]);
  assertNear(new Vec2().subVectors(new Vec2(3, 3), new Vec2(1, 2)).toArray(), [2, 1]);
  assertNear(new Vec2().addVectors(new Vec2(3, 3), new Vec2(1, 2)).toArray(), [4, 5]);
  assertNear(new Vec2(1, 1).addScaledVector(new Vec2(1, 2), 3).toArray(), [4, 7]);
  assertNear(new Vec2(2, 3).multiply(new Vec2(2, -1)).negate().divideScalar(2).toArray(), [-2, 1.5]);
  assert.equal(new Vec2(1, 2).dot(new Vec2(3, 4)), 11);
  assert.equal(new Vec2(1, 0).cross(new Vec2(0, 1)), 1);
  assert.equal(new Vec2(0, 0).distanceTo(new Vec2(3, 4)), 5);
  assert.equal(new Vec2(0, 0).distanceToSquared(new Vec2(3, 4)), 25);
  assertNear(new Vec2(0, 0).lerp(new Vec2(10, 20), 0.25).toArray(), [2.5, 5]);
  assertNear(new Vec2().lerpVectors(new Vec2(1, 1), new Vec2(3, 5), 0.5).toArray(), [2, 3]);
  assertNear(new Vec2().setScalar(3).toArray(), [3, 3]);
});

test('Vec2: angles and turns', () => {
  assertNear([new Vec2(0, 1).angle()], [Math.PI / 2]);
  assertNear([new Vec2(0, -1).angle()], [Math.PI * 1.5]);
  assertNear(new Vec2(2, 1).rotateAround(new Vec2(1, 1), Math.PI / 2).toArray(), [1, 2], 1e-15);
  const uv = new Mat3().set(2, 0, 0.5, 0, 3, 0.25, 0, 0, 1);
  assertNear(new Vec2(1, 1).applyMatrix3(uv).toArray(), [2.5, 3.25]);
});

test('Vec2: arrays, attributes and flags', () => {
  const vector = new Vec2().fromArray([9, 1, 2], 1);
  assert.ok(vector.equals(new Vec2(1, 2)));
  assert.deepEqual(vector.toArray([0, 0, 0], 1), [0, 1, 2]);
  const attribute = { count: 1, getX: () => 7, getY: () => 8, getZ: () => 0, getW: () => 0 };
  assertNear(new Vec2().fromBufferAttribute(attribute, 0).toArray(), [7, 8]);
  assert.equal(vector.isVec2, true);
  assert.ok(vector.clone().equals(vector) && new Vec2().copy(vector).equals(vector));
});
