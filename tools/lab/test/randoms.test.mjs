// What drew the page's random numbers (node/randoms.mjs): a tally of the draws' callers summarized.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { frameOf, placedTally, randomsDiffer, scriptsOfTally, summarizeRandoms } from '../node/randoms.mjs';

const PARTICLES = 'http://localhost:5190/src/fx/particles.ts?t=1';
const THREE = 'http://localhost:5190/node_modules/.vite/deps/three.js?v=2';

/** a stack's lines under `Math.random`, as the page tallies a draw by them */
const stack = (...lines) => lines.map((line) => `    at ${line}`).join('\n');

const TALLY = [
  [stack(`spawn (${PARTICLES}:97:30)`, `burst (${PARTICLES}:173:12)`), 30],
  [stack(`generateUUID (${THREE}:21:20)`, `new Texture (${THREE}:900:3)`), 8],
  [stack(`${PARTICLES}:50:1`), 2],
];

test('a stack line read as its function and place, lines and columns from 0', () => {
  assert.deepEqual(frameOf(`    at spawn (${PARTICLES}:97:30)`), { name: 'spawn', url: PARTICLES, line: 96, column: 29 });
  assert.deepEqual(frameOf(`    at ${PARTICLES}:50:1`), { name: '(anonymous)', url: PARTICLES, line: 49, column: 0 });
  assert.equal(frameOf('Error'), null);
});

test('the busiest callers first, under the draws in all', () => {
  const lines = summarizeRandoms(placedTally(TALLY)).split('\n');
  assert.equal(lines[0], 'random numbers drawn: 40');
  assert.match(lines[1], /^\s+30 {2}spawn particles\.ts:97 ← burst particles\.ts:173$/);
  assert.match(lines[2], /^\s+8 {2}generateUUID three\.js:21 ← new Texture three\.js:900$/);
  assert.match(lines[3], /^\s+2 {2}\(anonymous\) particles\.ts:50$/);
});

test('callers placed in the source when the source maps know them, and merged when they land on the same lines', () => {
  const sourceOf = (url, line) => (url === PARTICLES ? { file: '/src/fx/particles.ts', line: line < 60 ? 9 : line } : null);
  const merged = [...TALLY, [stack(`${PARTICLES}:51:1`), 3]];
  const lines = summarizeRandoms(placedTally(merged, sourceOf)).split('\n');
  assert.ok(lines.some((line) => /^\s+5 {2}\(anonymous\) particles\.ts:10$/.test(line)));
  assert.deepEqual(scriptsOfTally(merged), [PARTICLES, THREE]);
});

test('where two sides drew differently, the smallest differences first', () => {
  const mine = placedTally(TALLY);
  const other = placedTally([[TALLY[0][0], 31], [TALLY[1][0], 12], TALLY[2]]);
  const lines = randomsDiffer(mine, other).split('\n');
  assert.match(lines[1], /^\s+-1 {2}spawn particles\.ts:97/);
  assert.match(lines[2], /^\s+-4 {2}generateUUID three\.js:21/);
  assert.equal(lines.length, 3);
  assert.match(randomsDiffer(mine, mine), /both sides drew the same/);
});
