// `Quat` against three 0.187's numbers (read once, said where) and turns worked by hand.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Euler } from './euler.ts';
import { Mat4 } from './mat4.ts';
import { Quat } from './quat.ts';
import { Vec3 } from './vec3.ts';
import { assertNear } from './testing.ts';

/** three 0.187's `new Quaternion().setFromEuler(new Euler(0.3, -0.7, 1.1, 'YXZ'))` */
const THREE_YXZ = [-0.057539988180335414, -0.36242009435522565, 0.5291698089444968, 0.7650621793484506];

test('setFromEuler by order gives three\'s numbers (read off three 0.187)', () => {
  assertNear(new Quat().setFromEuler(new Euler(0.3, -0.7, 1.1, 'YXZ')).toArray(), THREE_YXZ);
  const xyz = [-0.057539988180335414, -0.36242009435522565, 0.4417996722272436, 0.8186292656554958];
  assertNear(new Quat().setFromEuler(new Euler(0.3, -0.7, 1.1)).toArray(), xyz);
});

test('setFromRotationMatrix undoes makeRotationFromQuaternion', () => {
  const quaternion = new Quat(...(THREE_YXZ as [number, number, number, number]));
  const matrix = new Mat4().makeRotationFromQuaternion(quaternion);
  assertNear(new Quat().setFromRotationMatrix(matrix).toArray(), THREE_YXZ, 1e-15);
  for (const angle of [Math.PI * 0.9, -Math.PI * 0.95]) {
    for (const axis of [new Vec3(1, 0, 0), new Vec3(0, 1, 0), new Vec3(0, 0, 1)]) {
      const turn = new Quat().setFromAxisAngle(axis, angle);
      const back = new Quat().setFromRotationMatrix(new Mat4().makeRotationFromQuaternion(turn));
      assertNear([Math.abs(back.dot(turn))], [1], 1e-14);
    }
  }
});

test('slerp gives three\'s numbers (read off three 0.187), and its ends', () => {
  const quaternion = new Quat(...(THREE_YXZ as [number, number, number, number]));
  const to = new Quat(0.1125087900926024, 0.7875615306482168, -0.2250175801852048, 0.562543950463012);
  const expected = [-0.0004155840895693347, 0.03280626447510565, 0.3672689650136546, 0.9295359506973643];
  assertNear(quaternion.clone().slerp(to, 0.3).toArray(), expected);
  assertNear(quaternion.clone().slerp(to, 0).toArray(), THREE_YXZ, 1e-15);
  assertNear([Math.abs(quaternion.clone().slerp(to, 1).dot(to))], [1], 1e-15);
  assertNear(new Quat().slerpQuaternions(quaternion, to, 0.3).toArray(), expected);
});

test('a half turn: setFromUnitVectors opposite ways, angleTo, rotateTowards', () => {
  const flip = new Quat().setFromUnitVectors(new Vec3(1, 0, 0), new Vec3(-1, 0, 0));
  assertNear(new Vec3(1, 0, 0).applyQuaternion(flip).toArray(), [-1, 0, 0], 1e-15);
  const quarter = new Quat().setFromUnitVectors(new Vec3(1, 0, 0), new Vec3(0, 1, 0));
  assertNear(quarter.toArray(), [0, 0, Math.SQRT1_2, Math.SQRT1_2]);
  assertNear([new Quat().angleTo(quarter)], [Math.PI / 2]);
  const step = new Quat().rotateTowards(quarter, 0.1);
  assertNear([new Quat().angleTo(step)], [0.1], 1e-12);
  assertNear(new Quat().rotateTowards(quarter, 5).toArray(), quarter.toArray());
});

test('multiply applies its argument first; premultiply after', () => {
  const aboutX = new Quat().setFromAxisAngle(new Vec3(1, 0, 0), Math.PI / 2);
  const aboutY = new Quat().setFromAxisAngle(new Vec3(0, 1, 0), Math.PI / 2);
  const yThenX = aboutX.clone().multiply(aboutY);
  assertNear(new Vec3(0, 0, 1).applyQuaternion(yThenX).toArray(), [1, 0, 0], 1e-15);
  const xThenY = aboutX.clone().premultiply(aboutY);
  assertNear(new Vec3(0, 0, 1).applyQuaternion(xThenY).toArray(), [0, -1, 0], 1e-15);
  assertNear(new Quat().multiplyQuaternions(aboutX, aboutY).toArray(), yThenX.toArray());
});

test('invert, normalize, identity and arrays', () => {
  const quaternion = new Quat(1, 2, 3, 4).normalize();
  assertNear([quaternion.length()], [1]);
  assertNear(quaternion.clone().multiply(quaternion.clone().invert()).toArray(), [0, 0, 0, 1], 1e-15);
  assertNear(new Quat(0, 0, 0, 0).normalize().toArray(), [0, 0, 0, 1]);
  assertNear(quaternion.identity().toArray(), [0, 0, 0, 1]);
  assert.equal(new Quat(1, 2, 3, 4).lengthSq(), 30);
  assert.ok(new Quat().fromArray([9, 1, 2, 3, 4], 1).equals(new Quat(1, 2, 3, 4)));
  assert.deepEqual(new Quat(1, 2, 3, 4).toArray(new Array<number>(6).fill(0), 1), [0, 1, 2, 3, 4, 0]);
});
