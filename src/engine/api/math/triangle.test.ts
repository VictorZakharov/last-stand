// `Triangle` against values worked by hand.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Triangle } from './triangle.ts';
import { Vec2 } from './vec2.ts';
import { Vec3 } from './vec3.ts';
import { assertNear } from './testing.ts';

/** the right triangle (0, 0, 0), (2, 0, 0), (0, 2, 0), facing +z */
function right(): Triangle {
  return new Triangle(new Vec3(0, 0, 0), new Vec3(2, 0, 0), new Vec3(0, 2, 0));
}

test('normal, area, middle, facing', () => {
  const triangle = right();
  assertNear(triangle.getNormal(new Vec3()).toArray(), [0, 0, 1]);
  assert.equal(triangle.getArea(), 2);
  assertNear(triangle.getMidpoint(new Vec3()).toArray(), [2 / 3, 2 / 3, 0]);
  assert.ok(triangle.isFrontFacing(new Vec3(0, 0, -1)));
  assert.ok(!triangle.isFrontFacing(new Vec3(0, 0, 1)));
  const flat = new Triangle(new Vec3(), new Vec3(1, 1, 1), new Vec3(2, 2, 2));
  assertNear(flat.getNormal(new Vec3()).toArray(), [0, 0, 0]);
});

test('barycentric weights, containment, and a blend at a point', () => {
  const triangle = right();
  assertNear(triangle.getBarycoord(new Vec3(0.5, 1, 0), new Vec3())!.toArray(), [0.25, 0.25, 0.5]);
  assert.ok(triangle.containsPoint(new Vec3(1, 1, 0)));
  assert.ok(!triangle.containsPoint(new Vec3(1.5, 1, 0)));
  const uv = Triangle.getInterpolation(new Vec3(0.5, 1, 0), triangle.a, triangle.b, triangle.c,
    new Vec2(0, 0), new Vec2(1, 0), new Vec2(0, 1), new Vec2());
  assertNear(uv!.toArray(), [0.25, 0.5]);
  const flat = new Triangle(new Vec3(), new Vec3(1, 1, 1), new Vec3(2, 2, 2));
  assert.equal(flat.getBarycoord(new Vec3(), new Vec3()), null);
  assert.ok(!flat.containsPoint(new Vec3()));
  const none = Triangle.getInterpolation(new Vec3(), flat.a, flat.b, flat.c, new Vec2(1, 1), new Vec2(1, 1),
    new Vec2(1, 1), new Vec2(5, 5));
  assert.equal(none, null);
});

test('the nearest point from each region: corner, edge, face', () => {
  const triangle = right();
  const nearest = (x: number, y: number, z: number): number[] =>
    triangle.closestPointToPoint(new Vec3(x, y, z), new Vec3()).toArray();
  assertNear(nearest(-1, -1, 0), [0, 0, 0]);
  assertNear(nearest(3, -1, 0), [2, 0, 0]);
  assertNear(nearest(-1, 3, 0), [0, 2, 0]);
  assertNear(nearest(1, -1, 0), [1, 0, 0]);
  assertNear(nearest(-1, 1, 0), [0, 1, 0]);
  assertNear(nearest(2, 2, 0), [1, 1, 0]);
  assertNear(nearest(0.5, 0.5, 3), [0.5, 0.5, 0]);
});

test('set, copies, equality', () => {
  const points = [new Vec3(9, 9, 9), new Vec3(0, 0, 0), new Vec3(2, 0, 0), new Vec3(0, 2, 0)];
  const triangle = new Triangle().setFromPointsAndIndices(points, 1, 2, 3);
  assert.ok(triangle.equals(right()));
  assert.ok(triangle.clone().equals(triangle) && new Triangle().copy(triangle).equals(triangle));
});
