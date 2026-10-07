// Where a command's time went (node/profile.mjs): a sampled profile summarized.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize } from '../node/profile.mjs';

const frame = (functionName, url, lineNumber) => ({ functionName, url, lineNumber });

/** root → run → (bake, raycast); bake calls itself once */
const PROFILE = {
  nodes: [
    { id: 1, callFrame: frame('(root)', '', -1), children: [2] },
    { id: 2, callFrame: frame('run', 'http://localhost:5190/tools/lab/page/carry.ts?t=1', 9), children: [3, 4] },
    { id: 3, callFrame: frame('bake', 'http://localhost:5190/tools/lab/page/geometry.ts', 200), children: [5] },
    { id: 4, callFrame: frame('raycast', 'http://localhost:5190/node_modules/three.js', 10), children: [] },
    { id: 5, callFrame: frame('bake', 'http://localhost:5190/tools/lab/page/geometry.ts', 200), children: [] },
  ],
  samples: [3, 3, 5, 4, 2],
  timeDeltas: [1000, 1000, 1000, 1000, 1000],
};

test('own time and total time, each function once per sample', () => {
  const lines = summarize(PROFILE).split('\n');
  assert.equal(lines[0], 'profile: 5 ms sampled');
  const own = lines.slice(lines.indexOf('by own time') + 1, lines.indexOf('by total time (with what it called)'));
  assert.match(own[0], /60\.0 %\s+3 ms {2}bake geometry\.ts:201$/);
  const total = lines.slice(lines.indexOf('by total time (with what it called)') + 1);
  assert.match(total[0], /100\.0 %\s+5 ms {2}run carry\.ts:10$/);
  // (the recursive bake counted once in each of its three samples, not four times)
  assert.match(total[1], /60\.0 %\s+3 ms {2}bake geometry\.ts:201$/);
  assert.ok(!total.some((line) => line.includes('(root)')));
});

test('places each function by its source when the source maps know it', () => {
  const sourceOf = (url, line) => (url.includes('geometry.ts') ? { file: '/src/geometry.ts', line: line + 26 } : null);
  const lines = summarize(PROFILE, sourceOf).split('\n');
  assert.ok(lines.some((line) => line.endsWith('bake geometry.ts:227')));
  assert.ok(lines.some((line) => line.endsWith('raycast three.js:11')));
});
