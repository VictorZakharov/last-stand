// `Maths` against values worked by hand, and `seededRandom` against three 0.187's own numbers.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Maths } from './maths.ts';
import { assertNear } from './testing.ts';

test('clamp, lerp, inverseLerp and mapLinear', () => {
  assert.equal(Maths.clamp(5, 0, 2), 2);
  assert.equal(Maths.clamp(-1, 0, 2), 0);
  assert.equal(Maths.lerp(2, 6, 0.25), 3);
  assert.equal(Maths.inverseLerp(2, 6, 3), 0.25);
  assert.equal(Maths.inverseLerp(2, 2, 3), 0);
  assert.equal(Maths.mapLinear(5, 0, 10, 100, 200), 150);
});

test('euclideanModulo and pingpong keep the divisor\'s sign', () => {
  assert.equal(Maths.euclideanModulo(-1, 3), 2);
  assert.equal(Maths.euclideanModulo(7, 3), 1);
  assert.equal(Maths.pingpong(3, 2), 1);
  assert.equal(Maths.pingpong(5, 2), 1);
  assert.equal(Maths.pingpong(0.5), 0.5);
});

test('smoothstep and smootherstep: 0 and 1 at the ends, a half at the middle', () => {
  assert.equal(Maths.smoothstep(0, 1, 3), 0);
  assert.equal(Maths.smoothstep(2, 1, 3), 0.5);
  assert.equal(Maths.smoothstep(1.5, 1, 3), 0.15625);
  assert.equal(Maths.smoothstep(4, 1, 3), 1);
  assert.equal(Maths.smootherstep(2, 1, 3), 0.5);
  assert.equal(Maths.smootherstep(1.5, 1, 3), 0.103515625);
});

test('damp eases by 1 - e^(-lambda dt)', () => {
  assertNear([Maths.damp(0, 10, 1, Math.LN2)], [5]);
  assert.equal(Maths.damp(3, 10, 0, 1), 3);
});

test('degrees and radians', () => {
  assert.equal(Maths.degToRad(180), Math.PI);
  assert.equal(Maths.radToDeg(Math.PI / 2), 90);
  assertNear([Maths.DEG2RAD * Maths.RAD2DEG], [1]);
});

test('powers of two', () => {
  assert.equal(Maths.isPowerOfTwo(64), true);
  assert.equal(Maths.isPowerOfTwo(0), false);
  assert.equal(Maths.isPowerOfTwo(48), false);
  assert.equal(Maths.ceilPowerOfTwo(33), 64);
  assert.equal(Maths.floorPowerOfTwo(33), 32);
  assert.equal(Maths.ceilPowerOfTwo(32), 32);
});

test('seededRandom gives three\'s numbers for a seed (read off three 0.187)', () => {
  assert.equal(Maths.seededRandom(42), 0.6011037519201636);
  assert.equal(Maths.seededRandom(), 0.44829055899754167);
});

test('the random ones stay in their ranges', () => {
  for (let i = 0; i < 200; i++) {
    const whole = Maths.randInt(2, 4);
    assert.ok(Number.isInteger(whole) && whole >= 2 && whole <= 4);
    const float = Maths.randFloat(-1, 1);
    assert.ok(float >= -1 && float < 1);
    const spread = Maths.randFloatSpread(4);
    assert.ok(spread > -2 && spread <= 2);
  }
});

test('generateUUID is a version 4 UUID, each new', () => {
  const uuid = Maths.generateUUID();
  assert.match(uuid, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(Maths.generateUUID(), uuid);
});
