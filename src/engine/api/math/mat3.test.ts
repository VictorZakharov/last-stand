// `Mat3` against three 0.187's numbers (read once, said where) and matrices worked by hand.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Euler } from './euler.ts';
import { Mat3 } from './mat3.ts';
import { Mat4 } from './mat4.ts';
import { Quat } from './quat.ts';
import { Vec3 } from './vec3.ts';
import { assertNear } from './testing.ts';

test('getNormalMatrix gives three\'s numbers (read off three 0.187)', () => {
  const turn = new Quat().setFromEuler(new Euler(0.3, -0.7, 1.1, 'YXZ'));
  const matrix = new Mat4().compose(new Vec3(1, 2, 3), turn, new Vec3(2, 0.5, 1.5));
  const expected = [
    0.0886309885091941, 0.4257014552219958, 0.24682548267502338, -1.5359766373238577, 0.8666738522474065,
    -0.9432137633781312, -0.4102964423721824, -0.1970134711075596, 0.48712109995700825,
  ];
  assertNear(new Mat3().getNormalMatrix(matrix).elements, expected);
});

test('set takes rows; invert, transpose, determinant by hand', () => {
  const matrix = new Mat3().set(2, 0, 0, 0, 4, 0, 1, 0, 1);
  assert.deepEqual(matrix.elements, [2, 0, 1, 0, 4, 0, 0, 0, 1]);
  assert.equal(matrix.determinant(), 8);
  assertNear(matrix.clone().invert().elements, [0.5, 0, -0.5, 0, 0.25, 0, 0, 0, 1]);
  assertNear(matrix.clone().multiply(matrix.clone().invert()).elements, new Mat3().elements);
  assert.deepEqual(matrix.clone().transpose().elements, [2, 0, 0, 0, 4, 0, 1, 0, 1]);
  assert.deepEqual(new Mat3().set(1, 2, 3, 2, 4, 6, 0, 0, 1).invert().elements, new Array<number>(9).fill(0));
});

test('multiply applies its argument first; premultiply after; from a Mat4\'s upper part', () => {
  const scale = new Mat3().set(2, 0, 0, 0, 1, 0, 0, 0, 1);
  const swap = new Mat3().set(0, 1, 0, 1, 0, 0, 0, 0, 1);
  assertNear(new Vec3(1, 0, 0).applyMatrix3(scale.clone().multiply(swap)).toArray(), [0, 1, 0]);
  assertNear(new Vec3(1, 0, 0).applyMatrix3(scale.clone().premultiply(swap)).toArray(), [0, 2, 0]);
  assertNear(new Mat3().multiplyMatrices(scale, swap).elements, scale.clone().multiply(swap).elements);
  const upper = new Mat3().setFromMatrix4(new Mat4().makeScale(2, 3, 4).setPosition(5, 6, 7));
  assert.deepEqual(upper.elements, [2, 0, 0, 0, 3, 0, 0, 0, 4]);
  assert.deepEqual(upper.clone().multiplyScalar(2).elements, [4, 0, 0, 0, 6, 0, 0, 0, 8]);
});

test('arrays, copies, equality', () => {
  const matrix = new Mat3(1, 2, 3, 4, 5, 6, 7, 8, 9);
  assert.deepEqual(matrix.toArray(), [1, 4, 7, 2, 5, 8, 3, 6, 9]);
  assert.ok(new Mat3().fromArray([0, ...matrix.elements], 1).equals(matrix));
  assert.ok(matrix.clone().equals(matrix) && new Mat3().copy(matrix).equals(matrix));
  assert.ok(matrix.identity().equals(new Mat3()));
});
