// Compiled lines traced back to the source (node/sourceMaps.mjs), for `--profile`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeMappings, sourceOf } from '../node/sourceMaps.mjs';

// (A is 0, C 1, E 2, D -1, gB 16; the fields: compiled column, source, source line, source column)
const MAPPINGS = 'AAAA;AACA,EACA;;ACEA;AADA;AAgBA;A';

test('decodes the segments of each compiled line, each field running on from the last', () => {
  assert.deepEqual(decodeMappings(MAPPINGS), [
    [[0, 0, 0]],
    [[0, 0, 1], [2, 0, 2]],
    [],
    [[0, 1, 4]],
    [[0, 1, 3]],
    [[0, 1, 19]],
    // (a segment of the compiled column alone maps to no source)
    [],
  ]);
});

test('finds the source line of a compiled line and column', () => {
  const decoded = decodeMappings(MAPPINGS);
  assert.deepEqual(sourceOf(decoded, 1, 1), { source: 0, line: 1 });
  assert.deepEqual(sourceOf(decoded, 1, 5), { source: 0, line: 2 });
  assert.deepEqual(sourceOf(decoded, 5, 0), { source: 1, line: 19 });
  assert.equal(sourceOf(decoded, 2, 0), null);
  assert.equal(sourceOf(decoded, 40, 0), null);
});
