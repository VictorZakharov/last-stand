// `Plane` against values worked by hand.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Mat4 } from './mat4.ts';
import { Plane } from './plane.ts';
import { Sphere } from './sphere.ts';
import { Vec3 } from './vec3.ts';
import { assertNear } from './testing.ts';

/** a plane's four numbers */
function numbers(plane: Plane): number[] {
  return [...plane.normal.toArray(), plane.constant];
}

test('made from points or a normal and a point', () => {
  const plane = new Plane().setFromCoplanarPoints(new Vec3(0, 0, 2), new Vec3(1, 0, 2), new Vec3(0, 1, 2));
  assertNear(numbers(plane), [0, 0, 1, -2]);
  assertNear(numbers(new Plane().setFromNormalAndCoplanarPoint(new Vec3(0, 1, 0), new Vec3(5, 3, 1))), [0, 1, 0, -3]);
  assertNear(numbers(new Plane().setComponents(0, 2, 0, 4).normalize()), [0, 1, 0, 2]);
  assertNear(numbers(new Plane(new Vec3(1, 0, 0), 1).negate()), [-1, 0, 0, -1]);
});

test('distances and projections', () => {
  const floor = new Plane(new Vec3(0, 1, 0), -1);
  assert.equal(floor.distanceToPoint(new Vec3(4, 3, 4)), 2);
  assert.equal(floor.distanceToSphere(new Sphere(new Vec3(0, 3, 0), 0.5)), 1.5);
  assertNear(floor.projectPoint(new Vec3(4, 3, 4), new Vec3()).toArray(), [4, 1, 4]);
  assertNear(floor.coplanarPoint(new Vec3()).toArray(), [0, 1, 0]);
});

test('moved by a matrix and translated', () => {
  const floor = new Plane(new Vec3(0, 1, 0), 0);
  const turned = floor.clone().applyMatrix4(new Mat4().makeRotationZ(Math.PI / 2).setPosition(3, 0, 0));
  assertNear(numbers(turned), [-1, 0, 0, 3], 1e-15);
  assertNear(numbers(floor.clone().translate(new Vec3(0, 2, 0))), [0, 1, 0, -2]);
  assert.ok(floor.clone().equals(floor) && new Plane().copy(floor).equals(floor));
  assert.ok(new Plane().set(new Vec3(0, 1, 0), 0).equals(floor));
});
