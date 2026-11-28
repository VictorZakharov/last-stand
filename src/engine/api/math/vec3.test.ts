// `Vec3` against values worked by hand, and its turns against three 0.187's numbers (read once, said where).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Euler } from './euler.ts';
import { Mat3 } from './mat3.ts';
import { Mat4 } from './mat4.ts';
import { Quat } from './quat.ts';
import { Spherical } from './spherical.ts';
import { Vec3 } from './vec3.ts';
import { assertNear } from './testing.ts';

test('in place and chainable: add, sub, scale, cross, dot', () => {
  const vector = new Vec3(1, 2, 3);
  assert.equal(vector.add(new Vec3(1, 1, 1)).multiplyScalar(2), vector);
  assertNear(vector.toArray(), [4, 6, 8]);
  assertNear(vector.clone().sub(new Vec3(4, 6, 8)).toArray(), [0, 0, 0]);
  assertNear(new Vec3(1, 0, 0).cross(new Vec3(0, 1, 0)).toArray(), [0, 0, 1]);
  assertNear(new Vec3().crossVectors(new Vec3(0, 1, 0), new Vec3(0, 0, 1)).toArray(), [1, 0, 0]);
  assert.equal(new Vec3(1, 2, 3).dot(new Vec3(4, -5, 6)), 12);
  assertNear(new Vec3(1, 1, 1).addScaledVector(new Vec3(1, 2, 3), 2).toArray(), [3, 5, 7]);
  assertNear(new Vec3().addVectors(new Vec3(1, 2, 3), new Vec3(1, 1, 1)).toArray(), [2, 3, 4]);
  assertNear(new Vec3().subVectors(new Vec3(1, 2, 3), new Vec3(1, 1, 1)).toArray(), [0, 1, 2]);
  assertNear(new Vec3(2, 4, 6).divideScalar(2).toArray(), [1, 2, 3]);
  assertNear(new Vec3(1, 2, 3).multiply(new Vec3(2, 2, -1)).negate().toArray(), [-2, -4, 3]);
  assertNear(new Vec3(1, 5, 3).min(new Vec3(2, 4, 3)).toArray(), [1, 4, 3]);
  assertNear(new Vec3(1, 5, 3).max(new Vec3(2, 4, 3)).toArray(), [2, 5, 3]);
  assertNear(new Vec3(1, 2, 3).addScalar(1).toArray(), [2, 3, 4]);
});

test('lengths, distances and angles', () => {
  const vector = new Vec3(3, 4, 0);
  assert.equal(vector.length(), 5);
  assert.equal(vector.lengthSq(), 25);
  assertNear(vector.clone().normalize().toArray(), [0.6, 0.8, 0]);
  assertNear(new Vec3().normalize().toArray(), [0, 0, 0]);
  assertNear(vector.clone().setLength(10).toArray(), [6, 8, 0]);
  assert.equal(vector.distanceTo(new Vec3(3, 4, 12)), 12);
  assert.equal(vector.distanceToSquared(new Vec3(3, 4, 12)), 144);
  assertNear([new Vec3(1, 0, 0).angleTo(new Vec3(0, 3, 0))], [Math.PI / 2]);
  assertNear([new Vec3(1, 0, 0).angleTo(new Vec3(-2, 0, 0))], [Math.PI]);
  assert.equal(new Vec3().angleTo(new Vec3(1, 0, 0)), Math.PI / 2);
});

test('lerp and projections', () => {
  assertNear(new Vec3(0, 0, 0).lerp(new Vec3(10, 20, 30), 0.1).toArray(), [1, 2, 3]);
  assertNear(new Vec3().lerpVectors(new Vec3(1, 1, 1), new Vec3(3, 5, 7), 0.5).toArray(), [2, 3, 4]);
  assertNear(new Vec3(2, 3, 4).projectOnPlane(new Vec3(0, 1, 0)).toArray(), [2, 0, 4]);
  assertNear(new Vec3(2, 3, 4).projectOnVector(new Vec3(0, 2, 0)).toArray(), [0, 3, 0]);
});

test('turns: a quarter turn about y takes +x to -z', () => {
  const quarter = new Quat().setFromAxisAngle(new Vec3(0, 1, 0), Math.PI / 2);
  assertNear(new Vec3(1, 0, 0).applyQuaternion(quarter).toArray(), [0, 0, -1], 1e-15);
  assertNear(new Vec3(1, 0, 0).applyAxisAngle(new Vec3(0, 0, 1), Math.PI / 2).toArray(), [0, 1, 0], 1e-15);
  assertNear(new Vec3(0, 1, 0).applyEuler(new Euler(Math.PI / 2, 0, 0)).toArray(), [0, 0, 1], 1e-15);
});

test('applyQuaternion gives three\'s numbers (read off three 0.187)', () => {
  const quaternion = new Quat().setFromEuler(new Euler(0.3, -0.7, 1.1, 'YXZ'));
  const turned = new Vec3(1, -2, 0.5).applyQuaternion(quaternion);
  assertNear(turned.toArray(), [1.4055162825631085, -0.16303104513408476, 1.8022055536959338]);
});

test('matrices: a point moves, a direction turns alone', () => {
  const matrix = new Mat4().compose(new Vec3(1, 2, 3), new Quat(), new Vec3(2, 2, 2));
  assertNear(new Vec3(1, 1, 1).applyMatrix4(matrix).toArray(), [3, 4, 5]);
  assertNear(new Vec3(0, 0, 5).transformDirection(matrix).toArray(), [0, 0, 1]);
  assertNear(new Vec3(1, 2, 3).applyMatrix3(new Mat3().set(0, 1, 0, 1, 0, 0, 0, 0, 2)).toArray(), [2, 1, 6]);
  assertNear(new Vec3().setFromMatrixPosition(matrix).toArray(), [1, 2, 3]);
  assertNear(new Vec3().setFromMatrixScale(matrix).toArray(), [2, 2, 2]);
  assertNear(new Vec3().setFromMatrixColumn(matrix, 3).toArray(), [1, 2, 3]);
});

test('project and unproject undo each other', () => {
  const projection = new Mat4().makePerspective(-1, 1, 1, -1, 1, 100);
  const world = new Mat4().makeTranslation(0, 0, 10);
  const camera = {
    matrixWorld: world,
    matrixWorldInverse: world.clone().invert(),
    projectionMatrix: projection,
    projectionMatrixInverse: projection.clone().invert(),
  };
  const point = new Vec3(0.5, -0.25, 0);
  const clip = point.clone().project(camera);
  assertNear([clip.x, clip.y], [0.05, -0.025]);
  assertNear(clip.unproject(camera).toArray(), point.toArray(), 1e-12);
});

test('spherical coordinates: phi down from +y, theta round from +z', () => {
  assertNear(new Vec3().setFromSphericalCoords(2, Math.PI / 2, 0).toArray(), [0, 0, 2], 1e-15);
  assertNear(new Vec3().setFromSphericalCoords(2, Math.PI / 2, Math.PI / 2).toArray(), [2, 0, 0], 1e-15);
  assertNear(new Vec3().setFromSpherical(new Spherical(3, 0, 1)).toArray(), [0, 3, 0], 1e-15);
});

test('components, arrays and attributes', () => {
  const vector = new Vec3().setX(1).setY(2).setZ(3);
  assert.equal(vector.getComponent(2), 3);
  vector.setComponent(0, 9);
  assert.equal(vector.x, 9);
  assert.throws(() => vector.getComponent(3));
  assert.deepEqual(vector.toArray(), [9, 2, 3]);
  const into = new Float32Array(5);
  assert.equal(vector.toArray(into, 2), into);
  assert.deepEqual([...into], [0, 0, 9, 2, 3]);
  assertNear(new Vec3().fromArray([0, 4, 5, 6], 1).toArray(), [4, 5, 6]);
  const attribute = { count: 1, getX: () => 7, getY: () => 8, getZ: () => 9, getW: () => 1 };
  assertNear(new Vec3().fromBufferAttribute(attribute, 0).toArray(), [7, 8, 9]);
  assert.ok(vector.equals(new Vec3(9, 2, 3)));
  assert.equal(vector.isVec3, true);
  assert.ok(vector.clone() instanceof Vec3 && vector.clone() !== vector);
  assertNear(new Vec3().setScalar(4).toArray(), [4, 4, 4]);
  assertNear(new Vec3().setFromEuler(new Euler(1, 2, 3)).toArray(), [1, 2, 3]);
});
