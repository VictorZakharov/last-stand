// `--sweep`'s axes (node/sweep.mjs): each target a tunable's path or some of its numbers, each with its values.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sweepAxes } from '../node/sweep.mjs';

test('each axis is a target and its values', () => {
  const axes = sweepAxes('warriorSwings.twoBack[37,43]=-19|-24;warriorEyes.held=8,0,1,0,0|40,0,1,0,0');
  assert.deepEqual(axes, [
    { target: 'warriorSwings.twoBack[37,43]', values: ['-19', '-24'] },
    { target: 'warriorEyes.held', values: ['8,0,1,0,0', '40,0,1,0,0'] },
  ]);
});

test('an axis with no values, or no tunable named, is refused', () => {
  assert.throws(() => sweepAxes('warriorSwings.twoBack='), /isn't name\.field=a\|b\|c/);
  assert.throws(() => sweepAxes('twoBack=1|2'), /isn't name\.field=a\|b\|c/);
  assert.throws(() => sweepAxes('warriorSwings.twoBack'), /isn't name\.field=a\|b\|c/);
});
