// `Box3` against values worked by hand, and its turned box against three 0.187's numbers.
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

test('an empty box grows round its points; centre and size', () => {
  const box = new Box3();
  assert.ok(box.isEmpty());
  assertNear(box.getCenter(new Vec3()).toArray(), [0, 0, 0]);
  box.setFromPoints([new Vec3(1, 2, 3), new Vec3(-1, 0, 5)]);
  assertNear(corners(box), [-1, 0, 3, 1, 2, 5]);
  assertNear(box.getCenter(new Vec3()).toArray(), [0, 1, 4]);
  assertNear(box.getSize(new Vec3()).toArray(), [2, 2, 2]);
  assertNear(corners(box.clone().expandByScalar(1)), [-2, -1, 2, 2, 3, 6]);
  const attribute = { count: 2, getX: (i: number) => i, getY: (i: number) => -i, getZ: () => 7, getW: () => 1 };
  assertNear(corners(new Box3().setFromBufferAttribute(attribute)), [0, -1, 7, 1, 0, 7]);
  assert.ok(!new Box3().setFromPoints([new Vec3()]).isEmpty());
});

test('contains, meets, distance', () => {
  const box = new Box3(new Vec3(0, 0, 0), new Vec3(2, 2, 2));
  assert.ok(box.containsPoint(new Vec3(2, 1, 0)));
  assert.ok(!box.containsPoint(new Vec3(2.1, 1, 0)));
  assert.ok(box.containsBox(new Box3(new Vec3(0.5, 0.5, 0.5), new Vec3(1, 1, 1))));
  assert.ok(box.intersectsBox(new Box3(new Vec3(2, 2, 2), new Vec3(3, 3, 3))));
  assert.ok(!box.intersectsBox(new Box3(new Vec3(2.1, 0, 0), new Vec3(3, 3, 3))));
  assert.ok(box.intersectsSphere(new Sphere(new Vec3(3, 1, 1), 1)));
  assert.ok(!box.intersectsSphere(new Sphere(new Vec3(3, 3, 1), 1)));
  assert.equal(box.distanceToPoint(new Vec3(5, 6, 1)), 5);
  assert.equal(box.distanceToPoint(new Vec3(1, 1, 1)), 0);
  assertNear(box.clampPoint(new Vec3(-1, 1, 3), new Vec3()).toArray(), [0, 1, 2]);
  const sphere = box.getBoundingSphere(new Sphere());
  assertNear([...sphere.center.toArray(), sphere.radius], [1, 1, 1, Math.sqrt(3)]);
  assert.ok(new Box3().getBoundingSphere(new Sphere()).isEmpty());
});

test('union, translate, and the box round its turned corners (read off three 0.187)', () => {
  const box = new Box3(new Vec3(-1, -1, -1), new Vec3(1, 2, 1));
  const turned = box.clone().applyMatrix4(new Mat4().makeRotationY(0.5));
  const expected = [-1.3570081004945758, -1, -1.3570081004945758, 1.3570081004945758, 2, 1.3570081004945758];
  assertNear(corners(turned), expected);
  assert.ok(new Box3().applyMatrix4(new Mat4().makeTranslation(1, 1, 1)).isEmpty());
  assertNear(corners(box.clone().translate(new Vec3(1, 0, 0))), [0, -1, -1, 2, 2, 1]);
  assertNear(corners(box.clone().union(new Box3(new Vec3(0, 0, 0), new Vec3(3, 0, 0)))), [-1, -1, -1, 3, 2, 1]);
  assert.ok(box.clone().equals(box) && new Box3().copy(box).equals(box));
  assert.ok(box.clone().makeEmpty().isEmpty());
});
