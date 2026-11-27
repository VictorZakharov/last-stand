// `Line3` against values worked by hand.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Line3 } from './line3.ts';
import { Mat4 } from './mat4.ts';
import { Vec3 } from './vec3.ts';
import { assertNear } from './testing.ts';

/** the segment (0, 0, 0) to (4, 0, 0) */
function along(): Line3 {
  return new Line3(new Vec3(0, 0, 0), new Vec3(4, 0, 0));
}

test('middle, length, points along it', () => {
  const line = along();
  assertNear(line.getCenter(new Vec3()).toArray(), [2, 0, 0]);
  assertNear(line.delta(new Vec3()).toArray(), [4, 0, 0]);
  assert.equal(line.distance(), 4);
  assert.equal(line.distanceSq(), 16);
  assertNear(line.at(0.25, new Vec3()).toArray(), [1, 0, 0]);
  assertNear(line.at(1.5, new Vec3()).toArray(), [6, 0, 0]);
});

test('the nearest point, kept to the segment or not', () => {
  const line = along();
  assert.equal(line.closestPointToPointParameter(new Vec3(1, 3, 0), true), 0.25);
  assert.equal(line.closestPointToPointParameter(new Vec3(6, 3, 0), false), 1.5);
  assert.equal(line.closestPointToPointParameter(new Vec3(6, 3, 0), true), 1);
  assertNear(line.closestPointToPoint(new Vec3(-2, 1, 0), true, new Vec3()).toArray(), [0, 0, 0]);
  assertNear(line.closestPointToPoint(new Vec3(-2, 1, 0), false, new Vec3()).toArray(), [-2, 0, 0]);
  const point = new Line3(new Vec3(1, 1, 1), new Vec3(1, 1, 1));
  assert.equal(point.closestPointToPointParameter(new Vec3(5, 5, 5), false), 0);
});

test('moved by a matrix, copies, equality', () => {
  const moved = along().applyMatrix4(new Mat4().makeTranslation(0, 1, 0));
  assertNear([...moved.start.toArray(), ...moved.end.toArray()], [0, 1, 0, 4, 1, 0]);
  assert.ok(moved.clone().equals(moved) && new Line3().copy(moved).equals(moved));
  assert.ok(new Line3().set(moved.start, moved.end).equals(moved));
});
