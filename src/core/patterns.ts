// Patterns after sdf-harness's materials (VictorZakharov/sdf-harness, its src/core/patterns.ts at beed9c8,
// MIT): its integer hash, value and fractal noise, cells, ashlar's blocks and a joint's bevel, made to tile. There
// they're solid textures, 3D and endless; here a map's last column must meet its first, so every lattice is wrapped
// round a whole number of its cells across the map (each octave of the fractal noise twice the one before, where
// sdf's are 2.03, 4.01 and 7.97 times). A lattice's hashes are made once, a table a map (hashed at each pixel, the
// bark took four times main's), so a pixel looks them up. Pure maths, so core/pbr.ts's recipes run in its workers.

/** sdf's integer hash of a lattice point, 0..1. */
export function hash3(x: number, y: number, z: number): number {
  const qx = Math.imul((x + 1048576) | 0, 1597334673);
  const qy = Math.imul((y + 1048576) | 0, 3812015801 | 0);
  const qz = Math.imul((z + 1048576) | 0, 2798796415 | 0);
  const n = Math.imul(qx ^ qy ^ qz, 1597334673) >>> 0;
  return (n >>> 8) / 16777216;
}

export const mix = (a: number, b: number, t: number): number => a * (1 - t) + b * t;
export const fract = (x: number): number => x - Math.floor(x);
/** `x` round `n`, for whole numbers */
export const wrap = (x: number, n: number): number => x - n * Math.floor(x / n);
export function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return t * t * (3 - 2 * t);
}

/** A value at a map's (u, v), 0..1. */
export type Field = (u: number, v: number) => number;

/** A lattice `px` by `py` cells round: each point's `hash3` with `salt`, in rows. */
function latticeOf(px: number, py: number, salt: number): Float32Array {
  const grid = new Float32Array(px * py);
  for (let y = 0; y < py; y++) for (let x = 0; x < px; x++) grid[y * px + x] = hash3(x, y, salt);
  return grid;
}

/** sdf's value noise on a lattice `px` by `py` cells across a map, `salt` its own. */
export function latticeNoise(px: number, py: number, salt: number): Field {
  const grid = latticeOf(px, py, salt);
  return (u, v) => {
    const x = u * px, y = v * py, ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy, ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    const x0 = wrap(ix, px), x1 = x0 + 1 === px ? 0 : x0 + 1, y0 = wrap(iy, py) * px, y1 = (y0 + px) % (px * py);
    return mix(mix(grid[y0 + x0], grid[y0 + x1], ux), mix(grid[y1 + x0], grid[y1 + x1], ux), uy);
  };
}

/** sdf's fractal noise (its octaves halving, four by default) on lattices across a map: the first `px` by `py`
 *  cells, each next twice as many. */
export function latticeFbm(px: number, py: number, salt: number, octaves = 4): Field {
  const layers = Array.from({ length: octaves }, (_, o) => latticeNoise(px << o, py << o, salt + o));
  const norm = 1 - 0.5 ** octaves;
  return (u, v) => {
    let sum = 0;
    for (let o = 0, amp = 0.5; o < octaves; o++, amp *= 0.5) sum += amp * layers[o](u, v);
    return sum / norm;
  };
}

/** Cells' nearest point and the next, as `latticeCells` finds them. */
export interface Cells { f1: number; f2: number; id: number; cx: number; cy: number }

/**
 * sdf's cells (its cobblestones, flagstones, a hammered face's dents) on a lattice `px` by `py` cells across a map, a
 * point in each cell `jitter` of a cell at most from its middle: at (u, v), the distances to the nearest point and
 * the next (cells), the nearest's hash and its cell (wrapped), written into `out`.
 */
export function latticeCells(px: number, py: number, jitter: number, salt: number): (u: number, v: number, out: Cells) => Cells {
  const ox = latticeOf(px, py, salt), oy = latticeOf(px, py, salt + 1), ids = latticeOf(px, py, salt + 2);
  for (let k = 0; k < ox.length; k++) { ox[k] = 0.5 + jitter * (ox[k] - 0.5); oy[k] = 0.5 + jitter * (oy[k] - 0.5); }
  return (u, v, out) => {
    const x = u * px, y = v * py, ix = Math.floor(x), iy = Math.floor(y);
    let f1 = 1e9, f2 = 1e9, near = 0;
    for (let dy = -1; dy <= 1; dy++) {
      const cy = iy + dy, row = wrap(cy, py) * px;
      for (let dx = -1; dx <= 1; dx++) {
        const cx = ix + dx, k = row + wrap(cx, px), ax = x - cx - ox[k], ay = y - cy - oy[k];
        // (Math.hypot is several times slower)
        const d = Math.sqrt(ax * ax + ay * ay);
        if (d < f1) { f2 = f1; f1 = d; near = k; } else if (d < f2) f2 = d;
      }
    }
    out.f1 = f1; out.f2 = f2; out.id = ids[near]; out.cx = near % px; out.cy = Math.floor(near / px);
    return out;
  };
}

/**
 * sdf's ashlar along a course: blocks a unit long on average, each joint moved up to 0.3 of a unit from its place
 * (`x` in units, `row` the course, `units` the blocks round): the distance to the nearer joint (units), and the
 * block's index (wrapped).
 */
export function ashlarSpan(x: number, row: number, axis: number, units: number): [number, number] {
  const j = Math.floor(x + 0.5);
  const xj = j + 0.6 * (hash3(wrap(j, units), row, axis) - 0.5);
  const side = x < xj ? -1 : 1;
  const xn = j + side + 0.6 * (hash3(wrap(j + side, units), row, axis) - 0.5);
  return [Math.min(Math.abs(x - xj), Math.abs(xn - x)), wrap(side < 0 ? j - 1 : j, units)];
}

/** sdf's relief bevel at a joint: 0 in the joint (`gap` wide), rising over `bevel` to the face (`d` from the joint's
 *  middle; all in one unit). */
export const jointBevel = (d: number, gap: number, bevel: number): number => smoothstep(0, bevel, d - 0.5 * gap);
