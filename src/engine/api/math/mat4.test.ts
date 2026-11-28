// `Mat4` against three 0.187's numbers (read once, said where) and matrices worked by hand.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Euler } from './euler.ts';
import { Mat4 } from './mat4.ts';
import { Quat } from './quat.ts';
import { Vec3 } from './vec3.ts';
import { WebGPUCoordinateSystem } from './types.ts';
import { assertNear } from './testing.ts';

/** the turn the three numbers were read with: `setFromEuler(new Euler(0.3, -0.7, 1.1, 'YXZ'))` */
const turn = new Quat().setFromEuler(new Euler(0.3, -0.7, 1.1, 'YXZ'));
/** three 0.187's `compose((1, 2, 3), turn, (2, 0.5, 1.5)).elements` */
const COMPOSED = [
  0.35452395403677617, 1.7028058208879828, 0.9873019307000932, 0, -0.3839941593309642, 0.21666846306185156,
  -0.23580344084453278, 0, -0.9231669953374102, -0.4432803099920093, 1.0960224749032688, 0, 1, 2, 3, 1,
];
/** three 0.187's inverse of `COMPOSED` */
const INVERTED = [
  0.0886309885091941, -1.5359766373238577, -0.4102964423721824, 0, 0.4257014552219958, 0.8666738522474065,
  -0.1970134711075596, 0, 0.24682548267502338, -0.9432137633781312, 0.48712109995700825, 0, -1.6805103469782556,
  2.632270222963439, -0.6570399152837232, 1,
];

/** `COMPOSED` made again */
function composed(): Mat4 {
  return new Mat4().compose(new Vec3(1, 2, 3), turn, new Vec3(2, 0.5, 1.5));
}

test('compose and invert give three\'s numbers (read off three 0.187)', () => {
  assertNear(composed().elements, COMPOSED);
  assertNear(composed().invert().elements, INVERTED);
  assertNear(composed().multiply(new Mat4().fromArray(INVERTED)).elements, new Mat4().elements, 1e-15);
  assertNear([composed().determinant()], [2 * 0.5 * 1.5], 1e-15);
});

test('decompose undoes compose, a mirror in x scale\'s sign', () => {
  const position = new Vec3();
  const quaternion = new Quat();
  const scale = new Vec3();
  composed().decompose(position, quaternion, scale);
  assertNear(position.toArray(), [1, 2, 3]);
  assertNear(quaternion.toArray(), turn.toArray(), 1e-15);
  assertNear(scale.toArray(), [2, 0.5, 1.5], 1e-15);
  new Mat4().makeScale(-2, 1, 1).decompose(position, quaternion, scale);
  assertNear(scale.toArray(), [-2, 1, 1]);
  new Mat4().makeScale(0, 1, 1).decompose(position, quaternion, scale);
  assertNear([...scale.toArray(), ...quaternion.toArray()], [1, 1, 1, 0, 0, 0, 1]);
});

test('set takes rows; elements are columns', () => {
  const matrix = new Mat4().set(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16);
  assert.deepEqual(matrix.elements, [1, 5, 9, 13, 2, 6, 10, 14, 3, 7, 11, 15, 4, 8, 12, 16]);
  assert.deepEqual(new Mat4(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16).elements, matrix.elements);
  assert.deepEqual(matrix.clone().transpose().elements, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
  assert.equal(matrix.determinant(), 0);
  assert.deepEqual(matrix.clone().invert().elements, new Array<number>(16).fill(0));
});

test('multiply applies its argument first', () => {
  const move = new Mat4().makeTranslation(1, 0, 0);
  const turnZ = new Mat4().makeRotationZ(Math.PI / 2);
  assertNear(new Vec3(1, 0, 0).applyMatrix4(move.clone().multiply(turnZ)).toArray(), [1, 1, 0], 1e-15);
  assertNear(new Vec3(1, 0, 0).applyMatrix4(move.clone().premultiply(turnZ)).toArray(), [0, 2, 0], 1e-15);
  assertNear(new Mat4().multiplyMatrices(move, turnZ).elements, move.clone().multiply(turnZ).elements);
});

test('the rotations about each axis, and about any', () => {
  const axisTurn = (matrix: Mat4, vector: Vec3): number[] => vector.applyMatrix4(matrix).toArray();
  assertNear(axisTurn(new Mat4().makeRotationX(Math.PI / 2), new Vec3(0, 1, 0)), [0, 0, 1], 1e-15);
  assertNear(axisTurn(new Mat4().makeRotationY(Math.PI / 2), new Vec3(0, 0, 1)), [1, 0, 0], 1e-15);
  assertNear(axisTurn(new Mat4().makeRotationZ(Math.PI / 2), new Vec3(1, 0, 0)), [0, 1, 0], 1e-15);
  const axis = new Vec3(1, 1, 1).normalize();
  const byAxis = new Mat4().makeRotationAxis(axis, 2 * Math.PI / 3);
  assertNear(axisTurn(byAxis, new Vec3(1, 0, 0)), [0, 1, 0], 1e-15);
  const fromEuler = new Mat4().makeRotationFromEuler(new Euler(0.3, -0.7, 1.1, 'YXZ'));
  assertNear(fromEuler.elements, new Mat4().makeRotationFromQuaternion(turn).elements, 1e-15);
});

test('lookAt points -z from eye to target, y up', () => {
  const matrix = new Mat4().lookAt(new Vec3(0, 0, 5), new Vec3(0, 0, 0), new Vec3(0, 1, 0));
  assertNear(matrix.elements, new Mat4().elements);
  const down = new Mat4().lookAt(new Vec3(0, 5, 0), new Vec3(0, 0, 0), new Vec3(0, 1, 0));
  assertNear(new Vec3(0, 0, -1).transformDirection(down).toArray(), [0, -1, 0], 1e-4);
});

test('extractRotation, getMaxScaleOnAxis, setPosition and the basis', () => {
  const rotation = new Mat4().extractRotation(composed());
  assertNear(rotation.elements, new Mat4().makeRotationFromQuaternion(turn).elements, 1e-15);
  assertNear([composed().getMaxScaleOnAxis()], [2], 1e-15);
  const matrix = new Mat4().setPosition(new Vec3(4, 5, 6));
  assert.deepEqual(matrix.elements.slice(12), [4, 5, 6, 1]);
  assert.deepEqual(new Mat4().copyPosition(matrix).setPosition(7, 8, 9).elements.slice(12), [7, 8, 9, 1]);
  const x = new Vec3(0, 1, 0);
  const y = new Vec3(-1, 0, 0);
  const z = new Vec3(0, 0, 1);
  const basis = new Mat4().makeBasis(x, y, z);
  assertNear(basis.elements, new Mat4().makeRotationZ(Math.PI / 2).elements, 1e-15);
  const [xAxis, yAxis, zAxis] = [new Vec3(), new Vec3(), new Vec3()];
  basis.extractBasis(xAxis, yAxis, zAxis);
  assert.ok(xAxis.equals(x) && yAxis.equals(y) && zAxis.equals(z));
  assert.deepEqual(new Mat4().makeTranslation(1, 2, 3).elements.slice(12), [1, 2, 3, 1]);
  assert.deepEqual(new Mat4().makeScale(2, 3, 4).elements.filter((element) => element !== 0), [2, 3, 4, 1]);
});

test('makePerspective for WebGPU gives three\'s numbers (read off three 0.187); orthographic by hand', () => {
  const perspective = new Mat4().makePerspective(-1, 1, 0.5, -0.5, 0.1, 100, WebGPUCoordinateSystem);
  const expected = [0.1, 0, 0, 0, 0, 0.2, 0, 0, 0, 0, -1.0010010010010009, -1, 0, 0, -0.10010010010010009, 0];
  assertNear(perspective.elements, expected);
  const ortho = new Mat4().makeOrthographic(-2, 2, 1, -1, 1, 11);
  assertNear(ortho.elements, [0.5, 0, 0, 0, 0, 1, 0, 0, 0, 0, -0.2, 0, 0, 0, -1.2, 1]);
  const near = new Vec3(0, 0, -1).applyMatrix4(ortho);
  const far = new Vec3(0, 0, -11).applyMatrix4(ortho);
  assertNear([near.z, far.z], [-1, 1]);
});

test('arrays and equality', () => {
  const matrix = composed();
  const into = new Float32Array(18);
  matrix.toArray(into, 2);
  assertNear(new Mat4().fromArray(into, 2).elements, COMPOSED, 1e-6);
  assert.ok(matrix.equals(composed()));
  assert.ok(!matrix.equals(new Mat4()));
  assert.ok(matrix.clone().equals(matrix) && matrix.clone() !== matrix);
  assert.deepEqual(new Mat4().copy(matrix).elements, matrix.elements);
  assert.deepEqual(matrix.identity().elements, new Mat4().elements);
});
