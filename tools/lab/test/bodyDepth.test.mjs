// The depth of a point in a part of the body (page/bodyDepth.ts): in a capsule and in an ellipsoid.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { capsuleDepth, ellipsoidDepth } from '../page/bodyDepth.ts';

const point = (x, y, z) => ({ x, y, z });
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} is not ${expected}`);

test('a point on a capsule\'s line is as deep as its radius', () => {
  near(capsuleDepth(point(0, 0.5, 0), point(0, 0, 0), point(0, 1, 0), 0.1), 0.1);
});

test('a point beside a capsule is outside it by its distance past the radius', () => {
  near(capsuleDepth(point(0.3, 0.5, 0), point(0, 0, 0), point(0, 1, 0), 0.1), -0.2);
});

test('past a capsule\'s end, the distance is from the end', () => {
  near(capsuleDepth(point(0, 1.05, 0), point(0, 0, 0), point(0, 1, 0), 0.1), 0.05);
  near(capsuleDepth(point(0, -0.3, 0), point(0, 0, 0), point(0, 1, 0), 0.1), -0.2);
});

test('a capsule whose ends meet is a sphere', () => {
  near(capsuleDepth(point(0.04, 0, 0), point(0, 0, 0), point(0, 0, 0), 0.1), 0.06);
});

test('a point inside an ellipsoid is as deep as its surface is further out that way', () => {
  near(ellipsoidDepth(point(0.1, 0, 0), point(0.3, 0.5, 0.2)), 0.2);
  near(ellipsoidDepth(point(0, -0.2, 0), point(0.3, 0.5, 0.2)), 0.3);
});

test('a point outside an ellipsoid has no depth', () => {
  assert.ok(ellipsoidDepth(point(0, 0, 0.4), point(0.3, 0.5, 0.2)) < 0);
});

test('its centre is as deep as its shortest half-axis', () => {
  near(ellipsoidDepth(point(0, 0, 0), point(0.3, 0.5, 0.2)), 0.2);
});
