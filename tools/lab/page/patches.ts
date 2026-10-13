// Patches of pixels in a mask (tools/lab `draw`): pixels touching side by side or above and below make one patch. A
// glint's glare is judged by its largest patch: a star of light on an arrowhead glared as one blob, motes of light as
// many specks a few pixels each, over about as many pixels in all.

/**
 * The pixels of the largest patch set in `mask` (`columns` x `rows`, row by row; a pixel is set where it isn't 0),
 * each pixel joined to the four beside, above and below it.
 */
export function largestPatch(mask: Uint8Array, columns: number, rows: number): number {
  const seen = new Uint8Array(mask.length);
  const waiting: number[] = [];
  let largest = 0;
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    seen[start] = 1;
    waiting.push(start);
    let size = 0;
    while (waiting.length) {
      const at = waiting.pop()!;
      size++;
      for (const next of neighbours(at, columns, rows)) {
        if (!mask[next] || seen[next]) continue;
        seen[next] = 1;
        waiting.push(next);
      }
    }
    largest = Math.max(largest, size);
  }
  return largest;
}

/** The pixels beside, above and below the pixel `at` that are in the mask. */
function neighbours(at: number, columns: number, rows: number): number[] {
  const column = at % columns;
  const row = Math.floor(at / columns);
  const found: number[] = [];
  if (column > 0) found.push(at - 1);
  if (column < columns - 1) found.push(at + 1);
  if (row > 0) found.push(at - columns);
  if (row < rows - 1) found.push(at + columns);
  return found;
}
