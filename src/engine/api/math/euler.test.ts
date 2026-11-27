// `Euler` against three 0.187's numbers (read once, said where), and back and forth through quaternions.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Euler } from './euler.ts';
import type { EulerOrder } from './euler.ts';
import { Mat4 } from './mat4.ts';
import { Quat } from './quat.ts';
import { assertNear } from './testing.ts';

const ORDERS: EulerOrder[] = ['XYZ', 'YXZ', 'ZXY', 'ZYX', 'YZX', 'XZY'];

/** an Euler's three angles */
function angles(euler: Euler): number[] {
  return [euler.x, euler.y, euler.z];
}

test('setFromQuaternion in another order gives three\'s numbers (read off three 0.187)', () => {
  const quaternion = new Quat().setFromEuler(new Euler(0.3, -0.7, 1.1, 'YXZ'));
  const zxy = [-0.491112148054882, -0.5941640414212538, 1.057078960465098];
  assertNear(angles(new Euler().setFromQuaternion(quaternion, 'ZXY')), zxy, 1e-14);
  const xzy = [-0.8276628490797944, -1.2903638623003575, 0.875694233393826];
  const rotation = new Mat4().makeRotationFromQuaternion(quaternion);
  assertNear(angles(new Euler().setFromRotationMatrix(rotation, 'XZY')), xzy, 1e-14);
});

test('every order comes back as it went: angles to a quaternion and back', () => {
  for (const order of ORDERS) {
    const euler = new Euler(0.4, -0.9, 1.2, order);
    const back = new Euler().setFromQuaternion(new Quat().setFromEuler(euler), order);
    assertNear(angles(back), angles(euler), 1e-14);
    assert.equal(back.order, order);
  }
});

test('locked: a right angle in the middle turn puts the rest in one', () => {
  for (const order of ORDERS) {
    const euler = new Euler(0, 0, 0, order);
    const middle = order[1] === 'X' ? 'x' : order[1] === 'Y' ? 'y' : 'z';
    euler[middle] = Math.PI / 2;
    const turn = new Quat().setFromEuler(euler);
    const back = new Euler().setFromQuaternion(turn, order);
    assertNear(new Quat().setFromEuler(back).toArray().map(Math.abs), turn.toArray().map(Math.abs), 1e-7);
  }
});

test('set keeps its order unless given one; copy, clone and equals', () => {
  const euler = new Euler(1, 2, 3, 'ZYX');
  euler.set(4, 5, 6);
  assert.equal(euler.order, 'ZYX');
  euler.set(4, 5, 6, 'XYZ');
  assert.equal(euler.order, 'XYZ');
  const copy = new Euler().copy(euler);
  assert.ok(copy.equals(euler));
  assert.ok(euler.clone().equals(euler));
  assert.ok(!euler.equals(new Euler(4, 5, 6, 'YXZ')));
});
