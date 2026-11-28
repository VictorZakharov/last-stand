// `--sweep`'s axes (node/sweep.mjs): each target a tunable's path or some of its numbers, each with its values.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linesAsked, sweepAxes } from '../node/sweep.mjs';

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

test('the lines asked of a run are those holding any of the words', () => {
  const text = ['booted', '  the page work 7.0: the render 4.1', '  draws 311', 'handed over: 586 records'].join('\n');
  const asked = linesAsked(text, 'work|records');
  assert.deepEqual(asked, ['  the page work 7.0: the render 4.1', 'handed over: 586 records']);
  assert.deepEqual(linesAsked(text, ''), []);
});
