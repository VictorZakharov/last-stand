// `Ray` against hits worked by hand.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Box3 } from './box3.ts';
import { Mat4 } from './mat4.ts';
import { Plane } from './plane.ts';
import { Ray } from './ray.ts';
import { Sphere } from './sphere.ts';
import { Vec3 } from './vec3.ts';
import { assertNear } from './testing.ts';

/** a ray from (0, 0, 5) down -z */
function downZ(): Ray {
  return new Ray(new Vec3(0, 0, 5), new Vec3(0, 0, -1));
}

test('points along it, and nearest a point', () => {
  const ray = downZ();
  assertNear(ray.at(2, new Vec3()).toArray(), [0, 0, 3]);
  assertNear(ray.closestPointToPoint(new Vec3(1, 0, 0), new Vec3()).toArray(), [0, 0, 0]);
  assertNear(ray.closestPointToPoint(new Vec3(1, 0, 9), new Vec3()).toArray(), [0, 0, 5]);
  assert.equal(ray.distanceToPoint(new Vec3(3, 4, 0)), 5);
  assert.equal(ray.distanceSqToPoint(new Vec3(0, 3, 9)), 25);
  assertNear(ray.clone().recast(5).origin.toArray(), [0, 0, 0]);
  assertNear(downZ().lookAt(new Vec3(0, 3, 1)).direction.toArray(), [0, 0.6, -0.8]);
});

test('spheres: from outside, from inside, missed, behind', () => {
  const sphere = new Sphere(new Vec3(0, 0, 0), 1);
  assertNear(downZ().intersectSphere(sphere, new Vec3())!.toArray(), [0, 0, 1]);
  const inside = new Ray(new Vec3(0, 0, 0), new Vec3(0, 0, -1));
  assertNear(inside.intersectSphere(sphere, new Vec3())!.toArray(), [0, 0, -1]);
  const beside = new Ray(new Vec3(2, 0, 5), new Vec3(0, 0, -1));
  assert.equal(beside.intersectSphere(sphere, new Vec3()), null);
  assert.equal(new Ray(new Vec3(0, 0, -5), new Vec3(0, 0, -1)).intersectSphere(sphere, new Vec3()), null);
  assert.ok(downZ().intersectsSphere(sphere));
  assert.ok(!beside.intersectsSphere(sphere));
});

test('boxes: the near face, the far one from inside, missed', () => {
  const box = new Box3(new Vec3(-1, -1, -1), new Vec3(1, 1, 1));
  assertNear(downZ().intersectBox(box, new Vec3())!.toArray(), [0, 0, 1]);
  const inside = new Ray(new Vec3(0, 0, 0), new Vec3(1, 0, 0));
  assertNear(inside.intersectBox(box, new Vec3())!.toArray(), [1, 0, 0]);
  const slanted = new Ray(new Vec3(-3, 0.5, 0), new Vec3(1, 0, 0));
  assertNear(slanted.intersectBox(box, new Vec3())!.toArray(), [-1, 0.5, 0]);
  assert.equal(new Ray(new Vec3(0, 3, 5), new Vec3(0, 0, -1)).intersectBox(box, new Vec3()), null);
  assert.ok(downZ().intersectsBox(box));
  assert.ok(!new Ray(new Vec3(0, 0, 5), new Vec3(0, 0, 1)).intersectsBox(box));
});

test('planes: ahead, behind, along it', () => {
  const floor = new Plane(new Vec3(0, 0, 1), 0);
  assert.equal(downZ().distanceToPlane(floor), 5);
  assertNear(downZ().intersectPlane(floor, new Vec3())!.toArray(), [0, 0, 0]);
  assert.equal(new Ray(new Vec3(0, 0, 5), new Vec3(0, 0, 1)).distanceToPlane(floor), null);
  assert.equal(new Ray(new Vec3(0, 0, 0), new Vec3(1, 0, 0)).distanceToPlane(floor), 0);
  assert.equal(new Ray(new Vec3(0, 0, 1), new Vec3(1, 0, 0)).intersectPlane(floor, new Vec3()), null);
});

test('triangles: its front, its back when culled, beside it', () => {
  const cornerA = new Vec3(-1, -1, 0);
  const cornerB = new Vec3(1, -1, 0);
  const cornerC = new Vec3(0, 1, 0);
  assertNear(downZ().intersectTriangle(cornerA, cornerB, cornerC, true, new Vec3())!.toArray(), [0, 0, 0]);
  const fromBelow = new Ray(new Vec3(0, 0, -5), new Vec3(0, 0, 1));
  assert.equal(fromBelow.intersectTriangle(cornerA, cornerB, cornerC, true, new Vec3()), null);
  assertNear(fromBelow.intersectTriangle(cornerA, cornerB, cornerC, false, new Vec3())!.toArray(), [0, 0, 0]);
  const beside = new Ray(new Vec3(0.9, 0.9, 5), new Vec3(0, 0, -1));
  assert.equal(beside.intersectTriangle(cornerA, cornerB, cornerC, false, new Vec3()), null);
  const away = new Ray(new Vec3(0, 0, 5), new Vec3(0, 0, 1));
  assert.equal(away.intersectTriangle(cornerA, cornerB, cornerC, false, new Vec3()), null);
});

test('moved by a matrix, copies, equality', () => {
  const ray = downZ().applyMatrix4(new Mat4().makeRotationX(Math.PI / 2).setPosition(0, 1, 0));
  assertNear(ray.origin.toArray(), [0, -4, 0], 1e-15);
  assertNear(ray.direction.toArray(), [0, 1, 0], 1e-15);
  assert.ok(ray.clone().equals(ray) && new Ray().copy(ray).equals(ray));
  assert.ok(new Ray().set(new Vec3(1, 2, 3), new Vec3(0, 1, 0)).equals(new Ray(new Vec3(1, 2, 3), new Vec3(0, 1, 0))));
});
