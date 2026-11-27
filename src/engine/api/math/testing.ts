// What the maths' tests share: numbers compared to a tolerance.
import assert from 'node:assert/strict';

/** asserts each of `actual` is within `tolerance` of `expected`'s, naming the first that isn't */
export function assertNear(actual: ArrayLike<number>, expected: ArrayLike<number>, tolerance = 1e-12): void {
  assert.equal(actual.length, expected.length, 'lengths differ');
  for (let i = 0; i < expected.length; i++) {
    const off = Math.abs(actual[i] - expected[i]);
    assert.ok(off <= tolerance, `[${i}]: ${actual[i]} is not ${expected[i]} (off by ${off})`);
  }
}
