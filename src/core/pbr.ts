// Procedural PBR maps (albedo, normal, roughness) as plain pixel data: pure maths, no DOM, so a
// worker can make them (core/pbr.worker.ts) while the loading screen stays live. `core/textures.ts`
// turns them into canvases and textures.
import { makeFbm, mulberry, clamp, smooth } from '../util';

/** Per-pixel output of a PBR sampler: height, albedo rgb (0..1), roughness. */
interface PBRSample { h: number; r: number; g: number; b: number; rough: number }
type PBRSampler = (u: number, v: number, out: PBRSample) => void;
/** A material's maps as RGBA pixels, `size` square. */
export interface PBRData { size: number; albedo: Uint8ClampedArray<ArrayBuffer>; normal: Uint8ClampedArray<ArrayBuffer>; rough: Uint8ClampedArray<ArrayBuffer> }

// Builds albedo / normal / roughness maps from per-pixel callbacks.
function buildPBR(size: number, sampler: PBRSampler, normalStrength = 2.5): PBRData {
  const n = size * size;
  const height = new Float32Array(n);
  const albedo = new Uint8ClampedArray(n * 4);
  const rough = new Uint8ClampedArray(n * 4);
  const out: PBRSample = { h: 0, r: 0, g: 0, b: 0, rough: 0.8 };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      sampler(x / size, y / size, out);
      const i = y * size + x;
      height[i] = out.h;
      albedo[i * 4] = out.r * 255; albedo[i * 4 + 1] = out.g * 255; albedo[i * 4 + 2] = out.b * 255; albedo[i * 4 + 3] = 255;
      const rv = out.rough * 255;
      rough[i * 4] = rv; rough[i * 4 + 1] = rv; rough[i * 4 + 2] = rv; rough[i * 4 + 3] = 255;
    }
  }
  const normal = new Uint8ClampedArray(n * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const xl = (x - 1 + size) % size, xr = (x + 1) % size, yu = (y - 1 + size) % size, yd = (y + 1) % size;
      const dx = (height[y * size + xr] - height[y * size + xl]) * normalStrength;
      const dy = (height[yd * size + x] - height[yu * size + x]) * normalStrength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      normal[i] = (-dx / len * 0.5 + 0.5) * 255;
      normal[i + 1] = (dy / len * 0.5 + 0.5) * 255;
      normal[i + 2] = (1 / len * 0.5 + 0.5) * 255;
      normal[i + 3] = 255;
    }
  }
  return { size, albedo, normal, rough };
}

// Jittered-grid Voronoi, tileable. Returns F1, F2 (in cell units) and cell id.
export function makeVoronoi(seed: number, cells: number) {
  const rng = mulberry(seed);
  const pts = new Float32Array(cells * cells * 2);
  const ids = new Float32Array(cells * cells);
  for (let i = 0; i < cells * cells; i++) {
    pts[i * 2] = 0.15 + rng() * 0.7;
    pts[i * 2 + 1] = 0.15 + rng() * 0.7;
    ids[i] = rng();
  }
  const res = { f1: 0, f2: 0, id: 0, cx: 0, cy: 0 };
  return (u: number, v: number) => {
    const x = u * cells, y = v * cells;
    const xi = Math.floor(x), yi = Math.floor(y);
    let f1 = 9, f2 = 9, id = 0;
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const cx = xi + ox, cy = yi + oy;
        const wx = ((cx % cells) + cells) % cells, wy = ((cy % cells) + cells) % cells;
        const k = wy * cells + wx;
        const px = cx + pts[k * 2], py = cy + pts[k * 2 + 1];
        const d = Math.hypot(px - x, py - y);
        if (d < f1) { f2 = f1; f1 = d; id = ids[k]; }
        else if (d < f2) f2 = d;
      }
    }
    res.f1 = f1; res.f2 = f2; res.id = id;
    return res;
  };
}

function cobblestone(): PBRData {
  const vor = makeVoronoi(7, 14);
  const fbm = makeFbm(3, 8, 5);
  const fine = makeFbm(11, 64, 3);
  const maps = buildPBR(1024, (u, v, o) => {
    const c = vor(u, v);
    const edge = c.f2 - c.f1;
    const n = fbm(u, v), f = fine(u, v);
    const stone = smooth(clamp(edge / 0.22, 0, 1));
    const dome = Math.sqrt(stone);
    o.h = dome * (0.75 + c.id * 0.35) + f * 0.12 * stone;
    const shade = 0.09 + c.id * 0.08 + (f - 0.5) * 0.05 + (n - 0.5) * 0.06;
    const dirt = 1 - stone;
    // cold blue-grey stones, brown-black grout
    o.r = clamp(shade * 0.95 * stone + dirt * 0.045, 0, 1);
    o.g = clamp(shade * 1.0 * stone + dirt * 0.04, 0, 1);
    o.b = clamp(shade * 1.12 * stone + dirt * 0.035, 0, 1);
    // Worn tops are smoother (slight wet sheen), grout is rough.
    o.rough = clamp(0.92 - dome * 0.38 + (f - 0.5) * 0.2, 0.3, 1);
  }, 3.5);
  return maps;
}

// Rectangular slabs / bricks in running bond (walls, dais).
function slabs(seed = 21, rows = 4, cols = 3, tint: [number, number, number] = [1, 1, 1]): PBRData {
  const rng = mulberry(seed);
  const rowJit: number[] = [], cellShade: number[][] = [];
  for (let r = 0; r < rows; r++) { rowJit.push(rng() * 0.5); cellShade.push(Array.from({ length: cols + 1 }, () => rng())); }
  const fbm = makeFbm(seed + 5, 6, 5);
  const crack = makeFbm(seed + 9, 16, 4);
  const maps = buildPBR(512, (u, v, o) => {
    const ry = v * rows, r = Math.floor(ry), fy = ry - r;
    const rx = u * cols + rowJit[r] * (r % 2 ? 1 : 0.4), c = Math.floor(rx), fx = rx - c;
    const bx = Math.min(fx, 1 - fx) * 1.0 / cols * cols, by = Math.min(fy, 1 - fy);
    const m = Math.min(bx * 3.2, by * 3.2 * cols / rows);
    const bevel = smooth(clamp(m / 0.08, 0, 1));
    const n = fbm(u, v), k = crack(u, v);
    const crackLine = clamp(1 - Math.abs(k - 0.5) * 40, 0, 1) * 0.6;
    const id = cellShade[r][((c % (cols + 1)) + cols + 1) % (cols + 1)];
    o.h = bevel * (0.85 + n * 0.3) - crackLine * 0.3;
    const s = (0.13 + id * 0.07 + (n - 0.5) * 0.1) * bevel * (1 - crackLine * 0.5) + (1 - bevel) * 0.04;
    o.r = s * tint[0]; o.g = s * tint[1]; o.b = s * 1.1 * tint[2];
    o.rough = clamp(0.95 - bevel * 0.2 + (n - 0.5) * 0.2, 0.4, 1);
  }, 4);
  return maps;
}

function grunge(): PBRData {
  const fbm = makeFbm(42, 4, 6);
  const maps = buildPBR(256, (u, v, o) => {
    const n = fbm(u, v);
    o.h = n; o.r = o.g = o.b = 0.55 + n * 0.45;
    o.rough = 0.6 + n * 0.4;
  }, 2);
  return maps;
}

/** Weathered wood: warped grain streaks running along v. */
function wood(): PBRData {
  const fbm = makeFbm(77, 4, 5);
  const maps = buildPBR(256, (u, v, o) => {
    const warp = fbm(u, v) * 3;
    const grain = 0.5 + 0.5 * Math.sin((u * 26 + warp) * Math.PI * 2);
    const n = fbm(u * 2, v * 2);
    o.h = grain * 0.6 + n * 0.4;
    const k = 0.55 + grain * 0.25 + n * 0.2;
    o.r = 0.42 * k; o.g = 0.29 * k; o.b = 0.18 * k;
    o.rough = 0.75 + (1 - grain) * 0.2;
  }, 3);
  return maps;
}

/** Coarse burlap weave. */
function burlap(): PBRData {
  const fbm = makeFbm(91, 4, 4);
  const threads = 48;
  const maps = buildPBR(256, (u, v, o) => {
    const a = Math.sin(u * threads * Math.PI * 2), b = Math.sin(v * threads * Math.PI * 2);
    // over / under: which thread is on top alternates per cell
    const top = (Math.floor(u * threads) + Math.floor(v * threads)) % 2 === 0 ? Math.abs(a) : Math.abs(b);
    const n = fbm(u, v);
    o.h = top * 0.7 + n * 0.3;
    const k = 0.62 + top * 0.25 + (n - 0.5) * 0.3;
    o.r = 0.66 * k; o.g = 0.53 * k; o.b = 0.34 * k;
    o.rough = 0.95;
  }, 2);
  return maps;
}

/** Forest floor: dark soil with leaf litter and a few pebbles (moss is added in world space by the biome, so it doesn't tile). */
function forestFloor(): PBRData {
  const fine = makeFbm(29, 48, 3);
  const leaves = makeVoronoi(17, 44);
  const pebbles = makeVoronoi(23, 20);
  const maps = buildPBR(1024, (u, v, o) => {
    const f = fine(u, v);
    // the Voronoi result object is reused: read each lookup before the next
    const lc = leaves(u, v);
    // scattered leaves: small blobs around some cell centers, not whole cells (that reads as paving)
    const leafId = lc.id, leaf = leafId < 0.45 ? smooth(clamp((0.26 - lc.f1) / 0.08, 0, 1)) * (0.5 + f) : 0;
    const pc = pebbles(u, v);
    const stone = pc.id > 0.86 ? smooth(clamp((0.3 - pc.f1) / 0.12, 0, 1)) : 0;
    const k = 0.8 + f * 0.4;
    let r = 0.15 * k, g = 0.11 * k, b = 0.075 * k, h = f * 0.25, rough = 0.95;
    const mix = (w: number, cr: number, cg: number, cb: number, ch: number, cro: number) => {
      r += (cr - r) * w; g += (cg - g) * w; b += (cb - b) * w; h += (ch - h) * w; rough += (cro - rough) * w;
    };
    mix(leaf, 0.26 + leafId * 0.3, 0.14 + leafId * 0.14, 0.05, 0.4 + f * 0.1, 0.7);
    mix(stone, 0.22 * k, 0.22 * k, 0.2 * k, 0.8, 0.6);
    o.r = clamp(r, 0, 1); o.g = clamp(g, 0, 1); o.b = clamp(b, 0, 1); o.h = h; o.rough = rough;
  }, 3);
  return maps;
}

/** Tree bark: deep vertical furrows between rough plates (v runs along the trunk). */
function bark(): PBRData {
  const fbm = makeFbm(61, 4, 5);
  const fine = makeFbm(67, 32, 3);
  const maps = buildPBR(512, (u, v, o) => {
    const warp = fbm(u, v) * 2.5;
    const plate = Math.abs(Math.sin((u * 12 + warp) * Math.PI));
    const f = fine(u, v);
    const breaks = smooth(clamp((fine(v, u) - 0.3) / 0.3, 0, 1));
    const hgt = Math.sqrt(plate) * (0.6 + breaks * 0.4) + f * 0.2;
    o.h = hgt;
    const k = 0.35 + hgt * 0.6;
    o.r = 0.21 * k; o.g = 0.16 * k; o.b = 0.12 * k;
    o.rough = 0.8 + (1 - plate) * 0.2;
  }, 4);
  return maps;
}

// --- the heroes' materials. Their albedo is neutral (a light grey with the pattern's shading), so the
// material's colour tints it: one map serves every leather, cloth or steel of any hue.

/** Worn leather: a fine pebbled grain, soft creases, scuffed lighter patches and a few scratches. */
function leather(): PBRData {
  const grain = makeVoronoi(131, 90);
  const crease = makeFbm(137, 6, 4), wear = makeFbm(139, 3, 4), scratch = makeFbm(141, 24, 2);
  return buildPBR(512, (u, v, o) => {
    const g = grain(u, v), pebble = smooth(clamp((g.f2 - g.f1) / 0.35, 0, 1));
    const c = crease(u, v), line = clamp(1 - Math.abs(c - 0.5) * 22, 0, 1);
    const w = smooth(clamp((wear(u, v) - 0.45) / 0.3, 0, 1));
    const s = clamp(1 - Math.abs(scratch(u * 0.3, v * 3) - 0.5) * 60, 0, 1) * 0.6;
    o.h = pebble * 0.35 - line * 0.2 - s * 0.3;
    const k = 0.62 + pebble * 0.1 - line * 0.08 + w * 0.3 + s * 0.2 + (g.id - 0.5) * 0.05;
    o.r = o.g = o.b = clamp(k, 0, 1);
    o.rough = clamp(0.78 - w * 0.25 - pebble * 0.08 + line * 0.15, 0.3, 1);
  }, 3);
}

/** Riveted mail: rows of interlocking rings (each row half a ring over), dark between them. */
function mail(): PBRData {
  const rows = 32, fbm = makeFbm(151, 8, 3);
  return buildPBR(512, (u, v, o) => {
    let h = 0;
    for (let dy = -1; dy <= 1; dy++) {
      const ry = Math.floor(v * rows) + dy, shift = (ry & 1) * 0.5;
      for (let dx = -1; dx <= 1; dx++) {
        const rx = Math.floor(u * rows - shift) + dx;
        const cx = (rx + 0.5 + shift) / rows, cy = (ry + 0.5) / rows;
        // rings a little taller than wide, overlapping their neighbours; the lower one on top
        const d = Math.hypot((u - cx) * rows, (v - cy) * rows * 0.85);
        const ring = clamp(1 - Math.abs(d - 0.52) / 0.2, 0, 1);
        h = Math.max(h, Math.sqrt(ring) * (0.8 + 0.2 * (dy + 1) / 2));
      }
    }
    const n = fbm(u, v);
    o.h = h;
    o.r = o.g = o.b = clamp(0.08 + h * (0.72 + (n - 0.5) * 0.3), 0, 1);
    o.rough = clamp(0.95 - h * 0.55 + (n - 0.5) * 0.15, 0.25, 1);
  }, 5);
}

/** Wool twill: fine diagonal ribs over threads, with a little uneven dye. */
function cloth(): PBRData {
  const fbm = makeFbm(161, 4, 4), fine = makeFbm(163, 64, 2);
  const threads = 96;
  return buildPBR(512, (u, v, o) => {
    const twill = 0.5 + 0.5 * Math.sin((u + v) * threads * Math.PI);
    const warp = 0.5 + 0.5 * Math.sin(u * threads * 2 * Math.PI), f = fine(u, v), n = fbm(u, v);
    o.h = twill * 0.6 + warp * 0.2 + f * 0.2;
    o.r = o.g = o.b = clamp(0.72 + twill * 0.12 + (n - 0.5) * 0.25 + (f - 0.5) * 0.1, 0, 1);
    o.rough = 0.9 + (f - 0.5) * 0.1;
  }, 1.5);
}

/** Worn steel: hammer dimples, fine brushing along u, long scratches, grime settled in the low spots. */
function steel(): PBRData {
  const dents = makeVoronoi(171, 12), brush = makeFbm(173, 128, 2), grime = makeFbm(177, 4, 5), scr = makeFbm(179, 16, 3);
  return buildPBR(512, (u, v, o) => {
    const d = dents(u, v), dimple = smooth(clamp(d.f1 / 0.7, 0, 1));
    const b = brush(u * 0.05, v);
    const s = clamp(1 - Math.abs(scr(u * 0.4 + v * 0.1, v * 2.5) - 0.5) * 70, 0, 1);
    const gr = smooth(clamp((grime(u, v) - 0.42) / 0.35, 0, 1));
    o.h = dimple * 0.5 + b * 0.1 - s * 0.15;
    o.r = o.g = o.b = clamp(0.78 + (b - 0.5) * 0.15 - gr * 0.4 * (1 - dimple * 0.5) + s * 0.2, 0, 1);
    o.rough = clamp(0.32 + gr * 0.4 + (b - 0.5) * 0.15 - s * 0.12, 0.12, 1);
  }, 1.5);
}

/** Fur: long streaks of hair along v, darker at the roots between tufts. */
function fur(): PBRData {
  const tuft = makeFbm(181, 6, 3), hair = makeFbm(183, 96, 2);
  return buildPBR(256, (u, v, o) => {
    const t = tuft(u, v), s = hair(u, v * 0.08);
    o.h = s * 0.7 + t * 0.3;
    o.r = o.g = o.b = clamp(0.35 + s * 0.55 + (t - 0.5) * 0.4, 0, 1);
    o.rough = 0.95;
  }, 3);
}

/** Every recipe, by name; its arguments are part of what it makes. */
export const RECIPES = { cobblestone, slabs, grunge, wood, burlap, forestFloor, bark, leather, mail, cloth, steel, fur };
export type RecipeName = keyof typeof RECIPES;
export type RecipeArgs<N extends RecipeName> = Parameters<(typeof RECIPES)[N]>;
export const recipeKey = (name: RecipeName, args: readonly unknown[]): string => `${name}(${args.join(',')})`;

/**
 * The maps the game uses, made in workers during loading. Anything missing here is still made on
 * the main thread when first asked for, so keep this in step with the calls (a miss is only slower).
 */
export const PRELOAD: { [N in RecipeName]: [N, RecipeArgs<N>] }[RecipeName][] = [
  ['forestFloor', []], ['cobblestone', []], ['bark', []], ['slabs', [21, 6, 3]], ['slabs', [33, 5, 5]], ['slabs', [47, 5, 5]],
  ['slabs', [33, 2, 2]], ['grunge', []], ['wood', []], ['burlap', []],
  ['leather', []], ['mail', []], ['cloth', []], ['steel', []], ['fur', []],
];
