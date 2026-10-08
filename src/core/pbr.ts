// Procedural PBR maps (albedo, normal, roughness) as plain pixel data: pure maths, no DOM, so a
// worker can make them (core/pbr.worker.ts) while the loading screen stays live. `core/textures.ts`
// turns them into canvases and textures.
import { makeFbm, mulberry, clamp, smooth } from '../util';
import { faceData } from '../entities/models/face';

/** Per-pixel output of a PBR sampler: height, albedo rgb (0..1), roughness. */
interface PBRSample { h: number; r: number; g: number; b: number; rough: number }
type PBRSampler = (u: number, v: number, out: PBRSample) => void;
/** A material's maps as RGBA pixels, `size` square (or `size` wide and `height` tall). */
export interface PBRData { size: number; height?: number; albedo: Uint8ClampedArray<ArrayBuffer>; normal: Uint8ClampedArray<ArrayBuffer>; rough: Uint8ClampedArray<ArrayBuffer> }

// Builds albedo / normal / roughness maps from per-pixel callbacks. The roughness map's red channel (which no material
// reads: roughness is green) keeps the height, 0 at the map's lowest point and 1 at its highest, for the floors'
// relief (core/parallax.ts).
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
  let low = Infinity, high = -Infinity;
  for (let i = 0; i < n; i++) { low = Math.min(low, height[i]); high = Math.max(high, height[i]); }
  const span = high - low || 1;
  for (let i = 0; i < n; i++) rough[i * 4] = (height[i] - low) / span * 255;
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

/**
 * A tileable scatter of things on a jittered grid, at most one a cell (`share` of the cells): each with its centre in its
 * cell (cell units), a turn (its cos and sin), a size and an id (0..1). `near(u, v)` lists those in the 3x3 cells round the point
 * (a thing must reach no further than a cell from its centre), as offsets from the point to each centre.
 */
function makeScatter(seed: number, cells: number, share: number) {
  const rng = mulberry(seed), n = cells * cells;
  const cx = new Float32Array(n), cy = new Float32Array(n), size = new Float32Array(n), id = new Float32Array(n);
  const cos = new Float32Array(n), sin = new Float32Array(n), on = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const turn = rng() * Math.PI * 2;
    cx[i] = rng(); cy[i] = rng(); cos[i] = Math.cos(turn); sin[i] = Math.sin(turn); size[i] = rng(); id[i] = rng();
    on[i] = rng() < share ? 1 : 0;
  }
  const found = { count: 0, dx: new Float32Array(9), dy: new Float32Array(9), k: new Int32Array(9) };
  const near = (u: number, v: number) => {
    const x = u * cells, y = v * cells, xi = Math.floor(x), yi = Math.floor(y);
    found.count = 0;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      // (wrapped round the tile by a comparison: the point is in it, so a neighbour is at most a cell outside)
      const gx = xi + ox, gy = yi + oy;
      const wx = gx < 0 ? gx + cells : gx >= cells ? gx - cells : gx, wy = gy < 0 ? gy + cells : gy >= cells ? gy - cells : gy;
      const k = wy * cells + wx;
      if (!on[k]) continue;
      const j = found.count++;
      found.dx[j] = gx + cx[k] - x; found.dy[j] = gy + cy[k] - y; found.k[j] = k;
    }
    return found;
  };
  return { near, cos, sin, size, id, cells };
}

/** the forest floor's tile (m) and its texels (cm a pixel: 5 m over 1024) */
const FLOOR_TILE = 5;
const FLOOR_CM = FLOOR_TILE * 100 / 1024;
/** a leaf's colours, fresh to rotten (sRGB 0..1): russet, ochre, tan, yellowed green, brown, rotten */
const LEAF_COLOURS: [number, number, number][] = [
  [0.46, 0.2, 0.08], [0.52, 0.34, 0.11], [0.4, 0.27, 0.13], [0.4, 0.38, 0.14], [0.3, 0.18, 0.08], [0.19, 0.12, 0.06],
];

/**
 * Forest floor (5 m a tile, heights in cm): clumpy dark soil under a litter of fallen leaves in three layers (each leaf
 * turned its own way, cupped, a raised midrib with veins off it and its edges darker; the lower layers older and
 * darker), twigs lying across them and pebbles from 2 to 6 cm across. At each point what lies highest is what shows,
 * so pebbles poke through the leaves and twigs lie over them: the floors' relief (core/parallax.ts) stands each up out
 * of the soil. Moss is added in world space by the biome, so it doesn't tile.
 */
function forestFloor(): PBRData {
  const soil = makeFbm(29, 24, 4), crumbs = makeFbm(31, 160, 2), rot = makeFbm(37, 96, 2);
  const leafCells = 64, twigCells = 24, pebbleCells = 32;
  const layers = [makeScatter(41, leafCells, 0.55), makeScatter(43, leafCells, 0.45), makeScatter(47, leafCells, 0.35)];
  const twigs = makeScatter(53, twigCells, 0.18), pebbles = makeScatter(59, pebbleCells, 0.22);
  const cm = (cells: number) => FLOOR_TILE * 100 / cells;   // a cell of a grid, cm
  return buildPBR(1024, (u, v, o) => {
    // the soil: clumpy, crumbs over it, darker where it's damp
    const s = soil(u, v), c = crumbs(u, v), rotten = rot(u, v) - 0.5;
    let h = s * 0.9 + c * 0.25, r = 0.13, g = 0.09, b = 0.06, rough = 0.95;
    const damp = smooth(clamp((s - 0.55) / 0.2, 0, 1));
    const k = (0.75 + c * 0.5) * (1 - damp * 0.3);
    r *= k; g *= k; b *= k;
    const lay = (top: number, cr: number, cg: number, cb: number, ro: number) => {
      if (top <= h) return;
      h = top; r = cr; g = cg; b = cb; rough = ro;
    };
    // the leaves, layer by layer up
    layers.forEach((layer, li) => {
      const near = layer.near(u, v), size = cm(layer.cells);
      for (let j = 0; j < near.count; j++) {
        const key = near.k[j], z = layer.size[key], half = 4 + z * 3.5;
        const px = -near.dx[j] * size, py = -near.dy[j] * size;
        if (px * px + py * py >= half * half) continue;
        // along the leaf and across it (cm), its half length 4 to 7.5 cm, half width a third of that or more
        const cs = layer.cos[key], sn = layer.sin[key];
        const a = px * cs + py * sn, w0 = -px * sn + py * cs, wide = half * (0.32 + layer.id[key] * 0.14);
        const along = a / half;
        if (Math.abs(along) >= 1) continue;
        const width = wide * Math.pow(Math.sin((along + 1) * Math.PI / 2), 0.85) * (along < 0 ? 1 : 1 - along * 0.25);
        const across = w0 / width;
        if (width <= 0 || Math.abs(across) >= 1) continue;
        const cup = across * across, rib = Math.max(0, 1 - Math.abs(w0) / 0.25);
        const vein = Math.max(0, 1 - Math.abs(((along * 3.5 - Math.abs(across) * 1.4) % 1 + 1) % 1 - 0.5) / 0.08);
        const top = 0.6 + li * 0.45 + layer.size[key] * 0.15 + cup * 0.45 + rib * 0.12 - vein * 0.04;
        // fresher on top, older below, rotting in spots, darker to its edges
        const age = clamp(layer.id[key] * 0.7 + (2 - li) * 0.18 + rotten * 0.5, 0, 0.999);
        const col = LEAF_COLOURS[Math.floor(age * LEAF_COLOURS.length)];
        const shade = (1 - cup * 0.35) * (1 + rib * 0.25) * (1 - vein * 0.25) * (0.85 + c * 0.3);
        lay(top, col[0] * shade, col[1] * shade, col[2] * shade, 0.72 + age * 0.2);
      }
    });
    // twigs: capsules lying over the litter, 16 to 38 cm long and 1.2 to 2 cm thick
    {
      const near = twigs.near(u, v), size = cm(twigCells);
      for (let j = 0; j < near.count; j++) {
        const key = near.k[j], half = (0.4 + twigs.size[key] * 0.5) * size;
        const px = -near.dx[j] * size, py = -near.dy[j] * size;
        if (px * px + py * py >= (half + 1) * (half + 1)) continue;
        const dirX = twigs.cos[key], dirY = twigs.sin[key];
        const along = clamp(px * dirX + py * dirY, -half, half);
        const d = Math.hypot(px - along * dirX, py - along * dirY), radius = 0.6 + twigs.id[key] * 0.4;
        if (d >= radius) continue;
        const round = Math.sqrt(1 - (d / radius) ** 2);
        const bark = 0.8 + round * 0.3 + (crumbs(u * 3, v) - 0.5) * 0.25;
        lay(1.5 + radius * round * 2, 0.22 * bark, 0.16 * bark, 0.1 * bark, 0.85);
      }
    }
    // pebbles: low domes, 2 to 6 cm across, a little flattened and turned
    {
      const near = pebbles.near(u, v), size = cm(pebbleCells);
      for (let j = 0; j < near.count; j++) {
        const key = near.k[j], radius = 1 + pebbles.size[key] * 2;
        const px = -near.dx[j] * size, py = -near.dy[j] * size;
        if (px * px + py * py >= radius * radius * 1.6) continue;
        const cs = pebbles.cos[key], sn = pebbles.sin[key];
        const qx = (px * cs + py * sn) / 1.25, qy = -px * sn + py * cs;
        const d = Math.hypot(qx, qy);
        if (d >= radius) continue;
        const dome = Math.sqrt(1 - (d / radius) ** 2);
        const grey = (0.28 + pebbles.id[key] * 0.12) * (0.85 + dome * 0.25 + (crumbs(u * 2, v * 2) - 0.5) * 0.2);
        lay(1.2 + dome * radius * 0.75, grey, grey * 0.97, grey * 0.9, 0.6);
      }
    }
    o.h = h; o.r = clamp(r, 0, 1); o.g = clamp(g, 0, 1); o.b = clamp(b, 0, 1); o.rough = rough;
  }, 1 / (2 * FLOOR_CM));
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

/** Oiled leather (the ranger's boots, belt and straps): smooth under a faint grain, long soft creases and finer wrinkles
 *  running across v (round a boot's shaft, along u), darker and duller in them, lighter scuffs where it rubs, and a sheen
 *  elsewhere. (The pebbled hide read as snakeskin at a hero's size.) */
function oiled(): PBRData {
  const grain = makeFbm(191, 128, 2), crease = makeFbm(193, 4, 4), wrinkle = makeFbm(197, 12, 3), wear = makeFbm(199, 3, 4), blot = makeFbm(201, 6, 3);
  return buildPBR(512, (u, v, o) => {
    const g = grain(u, v), c = crease(u, v * 3), cl = clamp(1 - Math.abs(c - 0.5) * 12, 0, 1) ** 1.5;
    const wk = wrinkle(u, v * 4), wl = clamp(1 - Math.abs(wk - 0.5) * 9, 0, 1) ** 2;
    const w = smooth(clamp((wear(u, v) - 0.5) / 0.22, 0, 1)), b = blot(u, v);
    o.h = 0.5 - cl * 0.22 - wl * 0.12 + (g - 0.5) * 0.08;
    o.r = o.g = o.b = clamp(0.6 - cl * 0.09 - wl * 0.04 + w * 0.2 + (b - 0.5) * 0.14 + (g - 0.5) * 0.04, 0, 1);
    o.rough = clamp(0.45 + cl * 0.2 + wl * 0.08 + w * 0.2 + (g - 0.5) * 0.12, 0.25, 1);
  }, 2);
}

/** Polished bow wood (the ranger's limbs and riser): fine straight grain along v, its latewood lines narrow, darker and
 *  gently wavering, a soft figure through it, under a lacquer; neutral, tinted by the material's (or the vertices') colour.
 *  (The weathered wood's warped streaks read as bark on a bow, and its brown under a tint went black.) */
function bowWood(): PBRData {
  const wave = makeFbm(223, 3, 3), fig = makeFbm(227, 6, 4), fine = makeFbm(229, 96, 2);
  return buildPBR(512, (u, v, o) => {
    const x = (u + (wave(u, v) - 0.5) * 0.1) * 48, ring = x - Math.floor(x);
    const late = smooth(clamp((ring - 0.76) / 0.08, 0, 1)) * (1 - smooth(clamp((ring - 0.93) / 0.06, 0, 1)));
    const f = fig(u, v), n = fine(u, v);
    o.h = 0.5 - late * 0.3 + (n - 0.5) * 0.06;
    o.r = o.g = o.b = clamp(0.8 - late * 0.24 + (f - 0.5) * 0.18 + (n - 0.5) * 0.05, 0, 1);
    o.rough = clamp(0.38 + late * 0.14 + (n - 0.5) * 0.06, 0, 1);
  }, 1.2);
}

/** Woollen cloth (the ranger's coat and trousers): a fine plain weave under a heathered surface, flecks of lighter and
 *  darker fibre in it and a soft mottle of the dye. (The twill's regular diagonal ribs read as synthetic.) */
function wool(): PBRData {
  const mottle = makeFbm(211, 5, 4), fleck = makeFbm(213, 128, 2), fuzz = makeFbm(217, 64, 3);
  const T = 192;
  return buildPBR(512, (u, v, o) => {
    const weave = 0.5 + 0.5 * Math.sin(u * T * Math.PI * 2) * Math.sin(v * T * Math.PI * 2), m = mottle(u, v), fz = fuzz(u, v), fl = fleck(u, v);
    const light = smooth(clamp((fl - 0.64) / 0.08, 0, 1)), dark = smooth(clamp((0.36 - fl) / 0.08, 0, 1));
    o.h = weave * 0.3 + fz * 0.45 + m * 0.25;
    o.r = o.g = o.b = clamp(0.7 + (m - 0.5) * 0.2 + light * 0.14 - dark * 0.14 + (fz - 0.5) * 0.08 + weave * 0.03, 0, 1);
    o.rough = 0.93 + (fz - 0.5) * 0.08;
  }, 1.4);
}

/** Felt (the ranger's hat): no weave, matted fibre, a soft mottle and fine fuzz. */
function felt(): PBRData {
  const mottle = makeFbm(221, 6, 4), fuzz = makeFbm(223, 96, 3), clump = makeFbm(227, 24, 3);
  return buildPBR(512, (u, v, o) => {
    const m = mottle(u, v), fz = fuzz(u, v), c = clump(u, v);
    o.h = fz * 0.5 + c * 0.35 + m * 0.15;
    o.r = o.g = o.b = clamp(0.7 + (m - 0.5) * 0.16 + (c - 0.5) * 0.14 + (fz - 0.5) * 0.12, 0, 1);
    o.rough = 0.97;
  }, 1.1);
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
export const RECIPES = { cobblestone, slabs, grunge, wood, burlap, forestFloor, bark, leather, oiled, wool, felt, mail, cloth, steel, fur, bowWood, face: faceData };
export type RecipeName = keyof typeof RECIPES;
export type RecipeArgs<N extends RecipeName> = Parameters<(typeof RECIPES)[N]>;
export const recipeKey = (name: RecipeName, args: readonly unknown[]): string => `${name}(${args.join(',')})`;

/**
 * The maps the game uses, made in workers during loading. Anything missing here is still made on
 * the main thread when first asked for, so keep this in step with the calls (a miss is only slower).
 */
export const PRELOAD: { [N in RecipeName]: [N, RecipeArgs<N>] }[RecipeName][] = [
  // the longest first, so the workers finish together
  ['face', ['warrior']], ['face', ['mage']], ['face', ['ranger']],
  ['forestFloor', []], ['cobblestone', []], ['bark', []], ['slabs', [21, 6, 3]], ['slabs', [33, 5, 5]], ['slabs', [47, 5, 5]],
  ['slabs', [33, 2, 2]], ['grunge', []], ['wood', []], ['burlap', []],
  ['leather', []], ['oiled', []], ['wool', []], ['felt', []], ['mail', []], ['cloth', []], ['steel', []], ['fur', []], ['bowWood', []],
];
