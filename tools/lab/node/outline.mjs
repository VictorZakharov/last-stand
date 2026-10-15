// tools/lab match: a reference's outlines (its weapon's and its fist's, marked as shapes on its frame in its
// `.marks.json`) put on the grid of rays the hero's frame is read on (page/inFrame.ts `cells`), and how much of his
// covers theirs. Matched one number at a time (where the weapon comes in, its tip, its width), a rest showed its
// haft where theirs is while its head was out of the frame, and a blade out of the frame with the hand in it.

/** the grid the hero's frame is read on (page/inFrame.ts `GRID_ACROSS`, `GRID_DOWN`) */
export const OUTLINE_GRID = { across: 96, down: 54 };
/** what a cell of the hero's grid shows for each part outlined (page/inFrame.ts `SHOWS`) */
export const SHOWS = { weapon: '1', fist: '2' };
/** the parts a reference outlines */
export const PARTS = Object.keys(SHOWS);

/** Whether `place` ([x, y], shares of the frame) lies within `shape` (a list of them), by the even-odd rule. */
function within([x, y], shape) {
  let inside = false;
  for (let i = 0, j = shape.length - 1; i < shape.length; j = i++) {
    const [xi, yi] = shape[i];
    const [xj, yj] = shape[j];
    const crosses = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

/** `shapes` on `grid`: '1' where a cell's middle lies within one of them, '0' elsewhere, row by row from the top. */
export function rasterOf(shapes, grid) {
  const cells = [];
  for (let j = 0; j < grid.down; j++) {
    for (let i = 0; i < grid.across; i++) {
      const middle = [(i + 0.5) / grid.across, (j + 0.5) / grid.down];
      cells.push(shapes.some((shape) => within(middle, shape)) ? '1' : '0');
    }
  }
  return cells.join('');
}

/** The cells of the hero's grid that show `part`, as a raster. */
export function partOf(cells, part) {
  return [...cells].map((cell) => (cell === SHOWS[part] ? '1' : '0')).join('');
}

/** How two rasters cover each other: the share of `theirs` that `ours` covers, the share of `ours` outside `theirs`,
 *  and the overlap (the cells both show over the cells either does; 1 when neither shows any). */
export function coverage(ours, theirs) {
  let both = 0;
  let onlyOurs = 0;
  let onlyTheirs = 0;
  for (let k = 0; k < ours.length; k++) {
    const a = ours[k] === '1';
    const b = theirs[k] === '1';
    if (a && b) both++;
    else if (a) onlyOurs++;
    else if (b) onlyTheirs++;
  }
  const either = both + onlyOurs + onlyTheirs;
  return {
    overlap: either ? both / either : 1,
    covered: both + onlyTheirs ? both / (both + onlyTheirs) : 1,
    outside: both + onlyOurs ? onlyOurs / (both + onlyOurs) : 0,
  };
}

/** A raster moved `cells` across its grid (`--canary`: a comparison must find it so far off). */
export function shiftedRaster(raster, grid, cells) {
  const rows = [];
  for (let j = 0; j < grid.down; j++) {
    const row = raster.slice(j * grid.across, (j + 1) * grid.across);
    rows.push(('0'.repeat(cells) + row).slice(0, grid.across));
  }
  return rows.join('');
}

/** A raster's cells drawn over a picture `width` x `height` px, a square at each. */
export function rasterSvg(raster, grid, width, height, colour) {
  const w = width / grid.across;
  const h = height / grid.down;
  const squares = [];
  for (let k = 0; k < raster.length; k++) {
    if (raster[k] !== '1') continue;
    const x = (k % grid.across) * w;
    const y = Math.floor(k / grid.across) * h;
    squares.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}"/>`);
  }
  return `<g fill="${colour}" fill-opacity="0.35">${squares.join('')}</g>`;
}

/** `shapes` drawn as outlines over a picture `width` x `height` px. */
export function shapesSvg(shapes, width, height, colour, dash = '') {
  const outline = (shape) => shape.map(([x, y]) => `${x * width},${y * height}`).join(' ');
  return shapes
    .map((shape) => `<polygon points="${outline(shape)}" fill="none" stroke="${colour}" stroke-width="2" `
      + `stroke-dasharray="${dash}"/>`)
    .join('');
}
