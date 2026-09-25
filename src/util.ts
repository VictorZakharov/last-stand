// Small math/random helpers shared across the game.
export const TAU = Math.PI * 2;
export const rand = (a = 0, b = 1): number => a + Math.random() * (b - a);
export const randInt = (a: number, b: number): number => Math.floor(rand(a, b + 1));
export const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const damp = (a: number, b: number, lambda: number, dt: number): number => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const smooth = (t: number): number => t * t * (3 - 2 * t);

export function angleDamp(a: number, b: number, lambda: number, dt: number): number {
  const d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  return a + d * (1 - Math.exp(-lambda * dt));
}

/** Pick a value from [value, weight] pairs. */
export function weighted<T>(entries: readonly (readonly [T, number])[]): T {
  let total = 0;
  for (const e of entries) total += Math.max(0, e[1]);
  let r = Math.random() * total;
  for (const e of entries) {
    r -= Math.max(0, e[1]);
    if (r <= 0) return e[0];
  }
  return entries[entries.length - 1][0];
}

/** Seeded PRNG (mulberry32) for deterministic procedural content. */
export function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Noise2D = (x: number, y: number) => number;

/** Tileable 2D value noise, used for procedural textures. */
export function makePeriodicNoise(seed: number, period: number): Noise2D {
  const rng = mulberry(seed);
  const grid = new Float32Array(period * period);
  for (let i = 0; i < grid.length; i++) grid[i] = rng();
  const at = (x: number, y: number) => grid[((y % period + period) % period) * period + ((x % period + period) % period)];
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    let xf = x - xi, yf = y - yi;
    xf = xf * xf * (3 - 2 * xf); yf = yf * yf * (3 - 2 * yf);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return lerp(lerp(a, b, xf), lerp(c, d, xf), yf);
  };
}

/** Fractal noise, tileable over the unit square (u, v in [0, 1)). */
export function makeFbm(seed: number, basePeriod: number, octaves = 4): Noise2D {
  const layers: Noise2D[] = [];
  for (let o = 0; o < octaves; o++) layers.push(makePeriodicNoise(seed + o * 101, basePeriod << o));
  return (u, v) => {
    let sum = 0, amp = 0.5, norm = 0;
    for (let o = 0; o < octaves; o++) {
      const p = basePeriod << o;
      sum += layers[o](u * p, v * p) * amp;
      norm += amp; amp *= 0.5;
    }
    return sum / norm;
  };
}

/**
 * A hit's flash on a body (`hitT`, faded by its owner): full at most every 0.7s, a faint tick between,
 * so a stream of hits can't strobe a body white (3+ flashes a second is a photosensitivity hazard).
 */
export function hitFlash(o: { hitT: number; flashAt: number }, now: number): void {
  if (now - o.flashAt >= 0.7) { o.hitT = 1; o.flashAt = now; } else o.hitT = Math.max(o.hitT, 0.25);
}
