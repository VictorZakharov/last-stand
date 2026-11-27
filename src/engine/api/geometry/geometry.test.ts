// Attributes and geometries against values worked by hand: normalized reads and writes, versions, update ranges,
// copies; a geometry's versions, moves, bounds, groups, draw range, clones and its dispose hook.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Mat4, Vec3 } from '../math/index.ts';
import { Attribute, InstancedAttribute, floats, indexOf } from './attribute.ts';
import { Geometry, InstancedGeometry } from './geometry.ts';
import { assertNear } from '../shapes/testing.ts';

test('a plain array is made a Float32Array; floats always copies', () => {
  const values = new Float32Array([1, 2, 3, 4, 5, 6]);
  const held = new Attribute(values, 3);
  assert.equal(held.array, values);
  assert.equal(held.count, 2);
  assert.ok(new Attribute([1, 2], 2).array instanceof Float32Array);
  const copied = floats(values, 3);
  assert.notEqual(copied.array, values);
  assert.deepEqual(Array.from(copied.array), [1, 2, 3, 4, 5, 6]);
  assert.equal(floats(6, 2).count, 3);
});

test('normalized integers read and write as shares of their type\'s largest', () => {
  const bytes = new Attribute(new Uint8Array([255, 0, 51, 102]), 4, true);
  assert.equal(bytes.getX(0), 1);
  assert.equal(bytes.getZ(0), 0.2);
  bytes.setY(0, 0.5);
  assert.equal(bytes.array[1], 128);
  const signed = new Attribute(new Int16Array([-32768, 32767]), 1, true);
  assert.equal(signed.getX(0), -1);
  assert.equal(signed.getX(1), 1);
  const plain = new Attribute(new Uint8Array([7]), 1);
  assert.equal(plain.getX(0), 7);
});

test('needsUpdate moves the version; update ranges add up and clear', () => {
  const attribute = floats([0, 0, 0], 3);
  attribute.needsUpdate = true;
  attribute.needsUpdate = false;
  assert.equal(attribute.version, 1);
  attribute.addUpdateRange(0, 3);
  attribute.addUpdateRange(6, 3);
  assert.deepEqual(attribute.updateRanges, [{ start: 0, count: 3 }, { start: 6, count: 3 }]);
  attribute.clearUpdateRanges();
  assert.equal(attribute.updateRanges.length, 0);
});

test('setXYZW, copyAt, clone and an instanced attribute\'s step', () => {
  const attribute = floats(8, 4).setXYZW(1, 1, 2, 3, 4);
  assert.deepEqual(Array.from(attribute.array), [0, 0, 0, 0, 1, 2, 3, 4]);
  attribute.copyAt(0, attribute, 1);
  assert.equal(attribute.getW(0), 4);
  const instanced = new InstancedAttribute(new Float32Array(4), 2, false, 3);
  const clone = instanced.clone();
  assert.ok(clone instanceof InstancedAttribute);
  assert.equal(clone.meshPerAttribute, 3);
  assert.notEqual(clone.array, instanced.array);
});

test('an index is 16-bit until a value reaches 65535', () => {
  assert.ok(indexOf([0, 1, 65534]).array instanceof Uint16Array);
  assert.ok(indexOf([0, 1, 65535]).array instanceof Uint32Array);
});

test('versions: replacing an attribute or the index moves version, the range and groups rangeVersion', () => {
  const geometry = new Geometry();
  geometry.setAttribute('position', floats([0, 0, 0], 3));
  geometry.setIndex([0, 0, 0]);
  geometry.deleteAttribute('position');
  assert.equal(geometry.version, 3);
  geometry.setDrawRange(0, 3);
  geometry.addGroup(0, 3, 1);
  geometry.clearGroups();
  assert.equal(geometry.rangeVersion, 3);
  const instanced = new InstancedGeometry();
  instanced.instanceCount = 5;
  instanced.instanceCount = 5;
  assert.equal(instanced.rangeVersion, 1);
  assert.ok(instanced.isInstancedGeometry && instanced.isGeometry);
});

test('moves and bounds: translate, scale, the box and the sphere follow', () => {
  const geometry = new Geometry().setFromPoints([new Vec3(-1, 0, 0), new Vec3(1, 2, 0), { x: 0, y: 0 }]);
  geometry.computeBoundingBox();
  geometry.translate(1, 0, 0).scale(2, 1, 1);
  const box = geometry.boundingBox;
  assert.ok(box);
  assertNear([box.min.x, box.min.y, box.max.x, box.max.y], [0, 0, 4, 2], 'box');
  geometry.computeBoundingSphere();
  const sphere = geometry.boundingSphere;
  assert.ok(sphere);
  assertNear([sphere.center.x, sphere.center.y, sphere.radius], [2, 1, Math.sqrt(5)], 'sphere');
  geometry.center();
  assertNear(Array.from(geometry.attributes.position.array), [-2, -1, 0, 2, 1, 0, 0, -1, 0], 'centred');
});

test('applyMatrix4 turns the normals by the normal matrix and keeps them unit', () => {
  const geometry = new Geometry();
  geometry.setAttribute('position', floats([1, 0, 0], 3));
  geometry.setAttribute('normal', floats([1, 1, 0].map((value) => value / Math.SQRT2), 3));
  geometry.applyMatrix4(new Mat4().makeScale(2, 1, 1));
  const normal = geometry.attributes.normal;
  assertNear([normal.getX(0), normal.getY(0)], [1 / Math.sqrt(5), 2 / Math.sqrt(5)], 'normal');
});

test('clone keeps its kind, copies its attributes and shares its userData; dispose calls its hooks', () => {
  const geometry = new InstancedGeometry();
  geometry.setAttribute('position', floats([1, 2, 3], 3));
  geometry.addGroup(0, 3, 2);
  geometry.instanceCount = 4;
  geometry.userData.shared = true;
  const clone = geometry.clone();
  assert.ok(clone instanceof InstancedGeometry);
  assert.equal(clone.instanceCount, 4);
  assert.notEqual(clone.attributes.position, geometry.attributes.position);
  assert.deepEqual(clone.groups, [{ start: 0, count: 3, materialIndex: 2 }]);
  assert.equal(clone.userData, geometry.userData);
  let told = 0;
  const stop = geometry.onDispose(() => told++);
  geometry.dispose();
  stop();
  geometry.dispose();
  assert.equal(told, 1);
});

test('toNonIndexed lays it out a vertex a corner; unindexed already, it is itself', () => {
  const geometry = new Geometry();
  geometry.setAttribute('position', floats([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  geometry.setIndex([2, 1, 0]);
  const laid = geometry.toNonIndexed();
  assert.equal(laid.index, null);
  assert.deepEqual(Array.from(laid.attributes.position.array), [0, 1, 0, 1, 0, 0, 0, 0, 0]);
  assert.equal(laid.toNonIndexed(), laid);
});
