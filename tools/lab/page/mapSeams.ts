// tools/lab maps' seams: whether a map tiles, read from its pixels. A floor repeats its map across the arena and a
// trunk's wraps round it, so where the map's last column meets its first (its last row its first) a pixel must step
// from the one across no further than pixels step inside the map. Two reads of each edge, each set against the same
// read of every two neighbouring columns (rows) inside: the mean step along it (0-255), and the share of it that
// jumps, a step past both its neighbours' steps across (a slab's shade changing at the edge, not a joint: a joint's
// bevel steps over pixels either side). A seam reads past every line inside on either, and twice their median or
// more. Read on the albedo's brightness and on the height (kept in the roughness map's red, core/pbr.ts), which the
// normals are made from.

/** A map's pixels: RGBA rows, `size` wide and `height` tall (`size` when it's square), as core/pbr.ts makes them. */
export interface MapPixels {
  size: number;
  height?: number;
  albedo: ArrayLike<number>;
  rough: ArrayLike<number>;
}

/** what's read: the albedo's brightness, or the height */
export type Channel = 'albedo' | 'height';
/** an edge: where the last column meets the first (across u), or the last row the first (across v) */
export type Edge = 'u' | 'v';

/** A read of an edge against the same read of the lines inside. */
export interface EdgeRead {
  across: number;
  /** the median of the lines inside, and the most of them */
  median: number;
  most: number;
  seam: boolean;
}

/** An edge's two reads on a channel: its mean step (0-255) and the share of it that jumps. */
export interface EdgeStep {
  channel: Channel;
  edge: Edge;
  step: EdgeRead;
  jumps: EdgeRead;
  seam: boolean;
}

/** how many times the median inside a seam reads at least, and by how much more at least (a flat map's steps are all
 *  near 0, 0-255; a smooth map's jumps none, a share) */
const SEAM_OVER_MEDIAN = 2;
const SEAM_LEAST_MORE = { step: 1, jumps: 0.05 };
/** a jump: a step this many times its neighbours' at least, and this far at least (0-255) */
const JUMP_OVER_NEIGHBOURS = 3;
const JUMP_LEAST = 4;
/** the canary's ramp across u: how far it lifts the last column over the first (0-255) */
const RAMP = 48;

/** Rec. 709's weights of red, green and blue in a pixel's brightness */
const LUMA = [0.2126, 0.7152, 0.0722];

const heightOf = (map: MapPixels): number => map.height ?? map.size;

/** What `channel` reads at each pixel, row by row. */
function valuesOf(map: MapPixels, channel: Channel): Float32Array {
  const count = map.size * heightOf(map);
  const values = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const k = i * 4;
    if (channel === 'height') {
      values[i] = map.rough[k];
      continue;
    }
    values[i] = LUMA[0] * map.albedo[k] + LUMA[1] * map.albedo[k + 1] + LUMA[2] * map.albedo[k + 2];
  }
  return values;
}

/**
 * Each line's reads across `edge`, from it to the next (each column to the next across u, each row to the next
 * across v), the last line's round to the first, which is the edge's: the mean step, and the share that jumps.
 */
export function lineReads(values: ArrayLike<number>, width: number, height: number, edge: Edge):
  { steps: Float64Array; jumps: Float64Array } {
  const lines = edge === 'u' ? width : height;
  const along = edge === 'u' ? height : width;
  const at = (line: number, k: number): number => {
    const wrapped = (line + lines) % lines;
    return values[edge === 'u' ? k * width + wrapped : wrapped * width + k];
  };
  const stepAt = (line: number, k: number): number => Math.abs(at(line + 1, k) - at(line, k));
  const steps = new Float64Array(lines);
  const jumps = new Float64Array(lines);
  for (let line = 0; line < lines; line++) {
    let sum = 0;
    let jumped = 0;
    for (let k = 0; k < along; k++) {
      const step = stepAt(line, k);
      const beside = Math.max(stepAt(line - 1, k), stepAt(line + 1, k));
      sum += step;
      if (step >= JUMP_LEAST && step > beside * JUMP_OVER_NEIGHBOURS) jumped++;
    }
    steps[line] = sum / along;
    jumps[line] = jumped / along;
  }
  return { steps, jumps };
}

/** The edge's read (a line's reads' last) against the lines' inside, and whether it's a seam's. */
export function edgeReadOf(reads: ArrayLike<number>, leastMore: number): EdgeRead {
  const inside = Array.from(reads).slice(0, -1).sort((a, b) => a - b);
  const across = reads[reads.length - 1];
  const median = inside[Math.floor(inside.length / 2)];
  const most = inside[inside.length - 1];
  const seam = across > most && across >= median * SEAM_OVER_MEDIAN && across - median >= leastMore;
  return { across, median, most, seam };
}

/** Each edge's reads on each channel. */
export function seamsOf(map: MapPixels): EdgeStep[] {
  const found: EdgeStep[] = [];
  for (const channel of ['albedo', 'height'] as const) {
    const values = valuesOf(map, channel);
    for (const edge of ['u', 'v'] as const) {
      const reads = lineReads(values, map.size, heightOf(map), edge);
      const step = edgeReadOf(reads.steps, SEAM_LEAST_MORE.step);
      const jumps = edgeReadOf(reads.jumps, SEAM_LEAST_MORE.jumps);
      found.push({ channel, edge, step, jumps, seam: step.seam || jumps.seam });
    }
  }
  return found;
}

/** The canary: a copy of `map` with a ramp across u added to its albedo and its height, which starts again at the
 *  edge: a seam across u, none across v. */
export function withRamp(map: MapPixels): MapPixels {
  const albedo = Uint8ClampedArray.from(map.albedo);
  const rough = Uint8ClampedArray.from(map.rough);
  for (let i = 0; i < map.size * heightOf(map); i++) {
    const lift = ((i % map.size) / map.size) * RAMP;
    for (let c = 0; c < 3; c++) albedo[i * 4 + c] += lift;
    rough[i * 4] += lift;
  }
  return { size: map.size, height: map.height, albedo, rough };
}
