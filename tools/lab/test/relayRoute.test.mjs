// `lab relay`'s line of a spread of times (node/relayRoute.mjs); the relay itself is timed by the command alone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spread } from '../node/relayRoute.mjs';

test('a spread says the median, the least, the 90th and 98th percentiles, the most and how many', () => {
  const values = Array.from({ length: 100 }, (_, index) => index + 1);
  assert.equal(spread(values), 'median 51.0 ms (least 1.0, 90% 91.0, 98% 99.0, most 100.0; 100 read)');
});

test('a spread of nothing says none', () => {
  assert.equal(spread([]), 'none');
});
