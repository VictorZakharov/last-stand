// A map's tile on a surface (`lab tiles`, page/tiles.ts): how many metres one tile covers along the map's u and along
// its v on a triangle, from the triangle's corners in the world and in the map, and the spread of a reading over a
// surface's triangles, each weighed by its area.

/** One triangle's tile: the metres one tile of the map covers along its u and along its v, and the triangle's area
 *  in the world (m²). */
export interface TriangleTile {
  u: number;
  v: number;
  area: number;
}

/** A reading's spread over a surface: the value a tenth of the weight lies under, half of it and nine tenths. */
export interface Spread {
  low: number;
  mid: number;
  high: number;
}

/** the share of the weight under a spread's low value (and over its high one) */
const SPREAD_TAIL = 0.1;

/** A vector's length, of its three numbers. */
const lengthOf = (x: number, y: number, z: number): number => Math.sqrt(x * x + y * y + z * z);

/**
 * The tile on a triangle whose corners lie at `world` (9 numbers: x, y, z of each) and at `map` (6: u and v of each,
 * the map's repeat counted in, so a whole unit is a tile): the world's way along u and along v (dP/du, dP/dv) solved
 * from its two edges. Undefined where its corners in the map lie on a line (the map has no size there).
 */
export function triangleTile(world: ArrayLike<number>, map: ArrayLike<number>): TriangleTile | undefined {
  const ax = world[3] - world[0], ay = world[4] - world[1], az = world[5] - world[2];
  const bx = world[6] - world[0], by = world[7] - world[1], bz = world[8] - world[2];
  const au = map[2] - map[0], av = map[3] - map[1];
  const bu = map[4] - map[0], bv = map[5] - map[1];
  const det = au * bv - bu * av;
  if (Math.abs(det) < 1e-12) return undefined;
  const u = lengthOf(ax * bv - bx * av, ay * bv - by * av, az * bv - bz * av) / Math.abs(det);
  const v = lengthOf(bx * au - ax * bu, by * au - ay * bu, bz * au - az * bu) / Math.abs(det);
  const area = lengthOf(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx) / 2;
  return { u, v, area };
}

/** For each share in `shares` (rising), the value under which that share of the weight lies, of `values` each
 *  weighed by its weight in `weights`. */
export function weightedShares(values: ArrayLike<number>, weights: ArrayLike<number>, shares: number[]): number[] {
  const order = Array.from({ length: values.length }, (_, i) => i).sort((a, b) => values[a] - values[b]);
  let total = 0;
  for (let i = 0; i < weights.length; i++) total += weights[i];
  const found: number[] = [];
  let under = 0;
  for (const i of order) {
    under += weights[i];
    while (found.length < shares.length && under >= shares[found.length] * total) found.push(values[i]);
  }
  while (found.length < shares.length) found.push(values[order[order.length - 1]]);
  return found;
}

/** `values`' spread, each weighed by its weight in `weights`. */
export function spreadOf(values: ArrayLike<number>, weights: ArrayLike<number>): Spread {
  const [low, mid, high] = weightedShares(values, weights, [SPREAD_TAIL, 0.5, 1 - SPREAD_TAIL]);
  return { low, mid, high };
}

/** How stretched a tile is: the longer of its two ways over the shorter (1: square). */
export const stretchOf = (tile: TriangleTile): number => Math.max(tile.u, tile.v) / Math.min(tile.u, tile.v);
