// The largest patch of pixels set in a mask (page/patches.ts): pixels joined beside, above and below, never corner to
// corner.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { largestPatch } from '../page/patches.ts';

/** A mask from rows of text: '#' set, '.' not. */
function maskOf(lines) {
  const columns = lines[0].length;
  const mask = new Uint8Array(columns * lines.length);
  for (let row = 0; row < lines.length; row++) {
    for (let column = 0; column < columns; column++) {
      mask[row * columns + column] = lines[row][column] === '#' ? 1 : 0;
    }
  }
  return { mask, columns, rows: lines.length };
}

/** The largest patch of the mask drawn by `lines`. */
function largestOf(lines) {
  const { mask, columns, rows } = maskOf(lines);
  return largestPatch(mask, columns, rows);
}

test('an empty mask has no patch', () => {
  assert.equal(largestOf(['....', '....']), 0);
});

test('a blob is one patch, however it winds', () => {
  assert.equal(largestOf(['###.', '..#.', '.##.', '....']), 6);
});

test('specks apart are each their own patch', () => {
  assert.equal(largestOf(['#.#.#', '.....', '##..#']), 2);
});

test('pixels touching only at a corner are apart', () => {
  assert.equal(largestOf(['#.', '.#']), 1);
});

test('a patch is not joined across the edge of a row', () => {
  assert.equal(largestOf(['..#', '#..']), 1);
});
