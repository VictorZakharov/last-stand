// The half floats against three 0.187's `DataUtils` (its bits read once for these values).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromHalfFloat, toHalfFloat } from './halfFloat.ts';

/** each value and the bits three's `toHalfFloat` gives it */
const THREES: [number, number][] = [
  [0, 0], [1, 15360], [0.5, 14336], [0.1, 11878], [1 / 3, 13653], [65504, 31743], [1e-5, 167], [1e-7, 1],
  [-2.75, 49536], [0.999, 15357],
];

test('a number made a half float has three bits', () => {
  for (const [value, bits] of THREES) assert.equal(toHalfFloat(value), bits, `${value}`);
});

test('a half float read back is the number three reads', () => {
  assert.equal(fromHalfFloat(15357), 0.99853515625);
  assert.equal(fromHalfFloat(167), 0.000009953975677490234);
  assert.equal(fromHalfFloat(49536), -2.75);
});
