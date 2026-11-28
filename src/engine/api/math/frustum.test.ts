// `Frustum` against three 0.187's planes (read once, said where) and views worked by hand.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Box3 } from './box3.ts';
import { Frustum } from './frustum.ts';
import { Mat4 } from './mat4.ts';
import { Sphere } from './sphere.ts';
import { Vec3 } from './vec3.ts';
import { WebGLCoordinateSystem, WebGPUCoordinateSystem } from './types.ts';
import { assertNear } from './testing.ts';

/** a frustum's six planes, four numbers each */
function numbers(frustum: Frustum): number[] {
  return frustum.planes.flatMap((plane) => [...plane.normal.toArray(), plane.constant]);
}

test('the planes of a WebGPU projection are three\'s (read off three 0.187)', () => {
  const projection = new Mat4().makePerspective(-1, 1, 0.5, -0.5, 0.1, 100, WebGPUCoordinateSystem);
  const frustum = new Frustum().setFromProjectionMatrix(projection, WebGPUCoordinateSystem);
  const expected = [
    -0.09950371902099893, 0, -0.9950371902099893, 0, 0.09950371902099893, 0, -0.9950371902099893, 0,
    0, 0.19611613513818404, -0.9805806756909201, 0, 0, -0.19611613513818404, -0.9805806756909201, 0,
    0, 0, 1, 100.00000000001334, 0, 0, -1, -0.1,
  ];
  assertNear(numbers(frustum), expected, 1e-9);
});

test('WebGL\'s and a reversed depth\'s near and far planes stand where they should', () => {
  for (const reversed of [false, true]) {
    const projection = new Mat4().makePerspective(-1, 1, 1, -1, 1, 10, WebGLCoordinateSystem, reversed);
    const frustum = new Frustum().setFromProjectionMatrix(projection, WebGLCoordinateSystem, reversed);
    assert.ok(frustum.containsPoint(new Vec3(0, 0, -1.01)));
    assert.ok(frustum.containsPoint(new Vec3(0, 0, -9.99)));
    assert.ok(!frustum.containsPoint(new Vec3(0, 0, -0.99)));
    assert.ok(!frustum.containsPoint(new Vec3(0, 0, -10.01)));
  }
});

test('spheres and boxes in, out, and across its sides', () => {
  const projection = new Mat4().makePerspective(-1, 1, 1, -1, 1, 10);
  const frustum = new Frustum().setFromProjectionMatrix(projection);
  assert.ok(frustum.intersectsSphere(new Sphere(new Vec3(0, 0, -5), 1)));
  assert.ok(frustum.intersectsSphere(new Sphere(new Vec3(5.5, 0, -5), 1)));
  assert.ok(!frustum.intersectsSphere(new Sphere(new Vec3(8, 0, -5), 1)));
  assert.ok(frustum.intersectsBox(new Box3(new Vec3(4, -1, -6), new Vec3(6, 1, -4))));
  assert.ok(!frustum.intersectsBox(new Box3(new Vec3(7, -1, -6), new Vec3(8, 1, -4))));
  assert.ok(!frustum.intersectsBox(new Box3(new Vec3(-1, -1, 1), new Vec3(1, 1, 2))));
  const copy = new Frustum().copy(frustum);
  assertNear(numbers(copy), numbers(frustum));
  assertNear(numbers(frustum.clone()), numbers(frustum));
  const planes = frustum.planes;
  assertNear(numbers(new Frustum().set(planes[0], planes[1], planes[2], planes[3], planes[4], planes[5])),
    numbers(frustum));
});
