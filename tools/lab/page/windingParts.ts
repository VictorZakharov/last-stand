// Which way a mesh's faces point (page/winding.ts), as plain numbers: no three.js, so its unit tests run in node.
// A mesh is split into its parts, the triangles joined by the corners they share (their corners welded by where
// they are, as a merged mesh's parts share none of their own), and each part's signed volume read about its own
// middle: a closed part whose faces point out encloses a positive volume, one wound inside out a negative one. An
// open part isn't judged: a card, a leaf or a cloth encloses next to none either way, and a groove (a blade's
// fuller) reads a volume below 0 about its middle, wound as it is. A part is open when more than a quarter of its
// edges are its alone (a tube open at its foot has 3% so, a sleeve open at both ends about 20%, a groove half).

/** a corner's place rounded to this (m) to weld it to the corners at the same place */
const WELD = 1e-5;
/** a part encloses at least this share of its box's volume to be judged: a tube about 0.6, a flat card next to 0 */
const SOLID_SHARE = 0.05;
/** a part is judged only if at most this share of its edges border one triangle */
const OPEN_EDGES_MOST = 0.25;

/** A part of a mesh: its triangles' count, its first triangle, its corners' mean, its signed volume and its box's
 *  volume (its units). */
export interface Part {
  triangles: number;
  first: number;
  middle: number[];
  volume: number;
  box: number;
  /** its edges, and those that border only one of its triangles */
  edges: number;
  openEdges: number;
}

/** Which way a part's faces point: out, in (inside out), or open (too little volume to tell). */
export type Facing = 'out' | 'in' | 'open';

/** The id of each corner, the same for corners at the same place. */
function weldedIds(positions: ArrayLike<number>): Int32Array {
  const ids = new Int32Array(positions.length / 3);
  const seen = new Map<string, number>();
  for (let i = 0; i < ids.length; i++) {
    const key = [0, 1, 2].map((axis) => Math.round(positions[i * 3 + axis] / WELD)).join(',');
    let id = seen.get(key);
    if (id === undefined) {
      id = seen.size;
      seen.set(key, id);
    }
    ids[i] = id;
  }
  return ids;
}

/** A union-find's root of `item`, its path halved on the way. */
function rootOf(parents: Int32Array, item: number): number {
  let at = item;
  while (parents[at] !== at) {
    parents[at] = parents[parents[at]];
    at = parents[at];
  }
  return at;
}

/** The corner (an index into `positions`' corners) of triangle `triangle`'s `corner`th. */
const cornerOf = (index: ArrayLike<number> | null, triangle: number, corner: number): number =>
  index ? index[triangle * 3 + corner] : triangle * 3 + corner;

/** Each triangle's part (triangles sharing a welded corner are one part), and each corner's welded id. */
function partIds(positions: ArrayLike<number>, index: ArrayLike<number> | null):
  { parts: Int32Array; welded: Int32Array } {
  const welded = weldedIds(positions);
  const count = (index ? index.length : positions.length / 3) / 3;
  const parents = new Int32Array(welded.length).map((_, i) => i);
  for (let triangle = 0; triangle < count; triangle++) {
    const first = rootOf(parents, welded[cornerOf(index, triangle, 0)]);
    for (const corner of [1, 2]) {
      const other = rootOf(parents, welded[cornerOf(index, triangle, corner)]);
      if (other !== first) parents[other] = first;
    }
  }
  const parts = new Int32Array(count);
  for (let triangle = 0; triangle < count; triangle++) {
    parts[triangle] = rootOf(parents, welded[cornerOf(index, triangle, 0)]);
  }
  return { parts, welded };
}

/** Each part's edges, and those that border only one triangle (`parts` each triangle's part). */
function edgesOf(index: ArrayLike<number> | null, parts: Int32Array, welded: Int32Array): Map<number, number[]> {
  const uses = new Map<string, { part: number; count: number }>();
  parts.forEach((part, triangle) => {
    const corners = [0, 1, 2].map((corner) => welded[cornerOf(index, triangle, corner)]);
    for (let side = 0; side < 3; side++) {
      const a = corners[side];
      const b = corners[(side + 1) % 3];
      const key = a < b ? `${a} ${b}` : `${b} ${a}`;
      const use = uses.get(key) ?? { part, count: 0 };
      use.count++;
      uses.set(key, use);
    }
  });
  const counts = new Map<number, number[]>();
  for (const { part, count } of uses.values()) {
    const tally = counts.get(part) ?? [0, 0];
    tally[0]++;
    if (count === 1) tally[1]++;
    counts.set(part, tally);
  }
  return counts;
}

/** A part's sums as its triangles are read: its triangles, its corners' sum and its box. */
interface Gathered {
  triangles: number[];
  sum: number[];
  low: number[];
  high: number[];
}

const gatheredNone = (): Gathered => ({
  triangles: [],
  sum: [0, 0, 0],
  low: [Infinity, Infinity, Infinity],
  high: [-Infinity, -Infinity, -Infinity],
});

/** The mesh's parts (`positions` its corners, three numbers each; `index` its triangles' corners, or none). */
export function partsOf(positions: ArrayLike<number>, index: ArrayLike<number> | null): Part[] {
  const { parts: ids, welded } = partIds(positions, index);
  const edges = edgesOf(index, ids, welded);
  const gathered = new Map<number, Gathered>();
  ids.forEach((id, triangle) => {
    const part = gathered.get(id) ?? gatheredNone();
    gathered.set(id, part);
    part.triangles.push(triangle);
    for (let corner = 0; corner < 3; corner++) {
      const at = cornerOf(index, triangle, corner) * 3;
      for (let axis = 0; axis < 3; axis++) {
        const value = positions[at + axis];
        part.sum[axis] += value;
        part.low[axis] = Math.min(part.low[axis], value);
        part.high[axis] = Math.max(part.high[axis], value);
      }
    }
  });
  return [...gathered].map(([id, part]) => {
    const [count, open] = edges.get(id) ?? [0, 0];
    return { ...partOf(positions, index, part), edges: count, openEdges: open };
  });
}

/** `part`'s signed volume about its corners' mean, and its box's volume. */
function partOf(positions: ArrayLike<number>, index: ArrayLike<number> | null, part: Gathered):
  Omit<Part, 'edges' | 'openEdges'> {
  const middle = part.sum.map((sum) => sum / (part.triangles.length * 3));
  const corner = (triangle: number, which: number): number[] => {
    const at = cornerOf(index, triangle, which) * 3;
    return [0, 1, 2].map((axis) => positions[at + axis] - middle[axis]);
  };
  let volume = 0;
  for (const triangle of part.triangles) {
    const [a, b, c] = [0, 1, 2].map((which) => corner(triangle, which));
    volume += a[0] * (b[1] * c[2] - b[2] * c[1]);
    volume += a[1] * (b[2] * c[0] - b[0] * c[2]);
    volume += a[2] * (b[0] * c[1] - b[1] * c[0]);
  }
  const box = part.high.reduce((product, high, axis) => product * (high - part.low[axis]), 1);
  return { triangles: part.triangles.length, first: part.triangles[0], middle, volume: volume / 6, box };
}

/** Which way `part`'s faces point. */
export function facingOf(part: Part): Facing {
  if (part.openEdges > OPEN_EDGES_MOST * part.edges) return 'open';
  if (!(part.box > 0) || Math.abs(part.volume) < SOLID_SHARE * part.box) return 'open';
  return part.volume > 0 ? 'out' : 'in';
}
