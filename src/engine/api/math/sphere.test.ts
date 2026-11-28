// `Sphere` against values worked by hand, and its growth against three 0.187's numbers.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Box3 } from './box3.ts';
import { Mat4 } from './mat4.ts';
import { Sphere } from './sphere.ts';
import { Vec3 } from './vec3.ts';
import { assertNear } from './testing.ts';

/** a box's six numbers */
function corners(box: Box3): number[] {
  return [...box.min.toArray(), ...box.max.toArray()];
}

test('a sphere grows round its points as three\'s does (read off three 0.187)', () => {
  const sphere = new Sphere();
  assert.ok(sphere.isEmpty());
  for (const point of [new Vec3(1, 0, 0), new Vec3(-1, 0, 0), new Vec3(0, 3, 0)]) sphere.expandByPoint(point);
  assertNear([...sphere.center.toArray(), sphere.radius], [0, 1, 0, 2]);
  const round = new Sphere().setFromPoints([new Vec3(1, 0, 0), new Vec3(-1, 0, 0), new Vec3(0, 2, 0)]);
  assertNear([...round.center.toArray(), round.radius], [0, 1, 0, Math.SQRT2]);
  const about = new Sphere().setFromPoints([new Vec3(3, 0, 0)], new Vec3(0, 0, 0));
  assert.equal(about.radius, 3);
});

test('a sphere: tests, union, moves', () => {
  const sphere = new Sphere(new Vec3(0, 0, 0), 2);
  assert.ok(sphere.containsPoint(new Vec3(0, 2, 0)));
  assert.equal(sphere.distanceToPoint(new Vec3(5, 0, 0)), 3);
  assert.ok(sphere.intersectsSphere(new Sphere(new Vec3(3, 0, 0), 1)));
  assert.ok(!sphere.intersectsSphere(new Sphere(new Vec3(3.1, 0, 0), 1)));
  assert.ok(sphere.intersectsBox(new Box3(new Vec3(1, 1, 1), new Vec3(2, 2, 2))));
  const united = sphere.clone().union(new Sphere(new Vec3(4, 0, 0), 1));
  assertNear([...united.center.toArray(), united.radius], [1.5, 0, 0, 3.5]);
  assertNear([sphere.clone().union(new Sphere(new Vec3(), 3)).radius], [3]);
  assert.equal(sphere.clone().union(new Sphere()).radius, 2);
  const moved = sphere.clone().applyMatrix4(new Mat4().makeScale(1, 3, 2).setPosition(1, 0, 0));
  assertNear([...moved.center.toArray(), moved.radius], [1, 0, 0, 6]);
  assertNear(sphere.clone().translate(new Vec3(0, 1, 0)).center.toArray(), [0, 1, 0]);
  const box = sphere.getBoundingBox(new Box3());
  assertNear(corners(box), [-2, -2, -2, 2, 2, 2]);
  assert.ok(sphere.clone().equals(sphere) && sphere.clone().makeEmpty().isEmpty());
  assert.ok(new Sphere().copy(sphere).set(new Vec3(1, 1, 1), 1).equals(new Sphere(new Vec3(1, 1, 1), 1)));
});
