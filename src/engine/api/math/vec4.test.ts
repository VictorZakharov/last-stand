// `Vec4` against values worked by hand.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Mat4 } from './mat4.ts';
import { Vec4 } from './vec4.ts';
import { assertNear } from './testing.ts';

test('Vec4: a point times a matrix keeps its w; lerp, length and arrays', () => {
  const point = new Vec4(1, 2, 3, 1).applyMatrix4(new Mat4().makeTranslation(1, 1, 1));
  assertNear(point.toArray(), [2, 3, 4, 1]);
  const direction = new Vec4(1, 2, 3, 0).applyMatrix4(new Mat4().makeTranslation(1, 1, 1));
  assertNear(direction.toArray(), [1, 2, 3, 0]);
  assertNear(new Vec4(0, 0, 0, 0).lerp(new Vec4(4, 8, 12, 16), 0.25).toArray(), [1, 2, 3, 4]);
  assert.equal(new Vec4(1, 1, 1, 1).length(), 2);
  assertNear(new Vec4(2, 0, 0, 0).normalize().toArray(), [1, 0, 0, 0]);
  assertNear(new Vec4(1, 1, 1, 1).add(new Vec4(1, 2, 3, 4)).multiplyScalar(2).toArray(), [4, 6, 8, 10]);
  assertNear(new Vec4().addScaledVector(new Vec4(1, 1, 1, 1), 2).toArray(), [2, 2, 2, 3]);
  assert.ok(new Vec4().fromArray([0, 1, 2, 3, 4], 1).equals(new Vec4(1, 2, 3, 4)));
  assert.deepEqual(new Vec4().setScalar(2).toArray(), [2, 2, 2, 2]);
  const attribute = { count: 1, getX: () => 1, getY: () => 2, getZ: () => 3, getW: () => 4 };
  assert.ok(new Vec4().fromBufferAttribute(attribute, 0).equals(new Vec4(1, 2, 3, 4)));
  assert.equal(new Vec4().isVec4, true);
  assert.ok(new Vec4(1, 2, 3, 4).clone().equals(new Vec4().copy(new Vec4(1, 2, 3, 4))));
});
