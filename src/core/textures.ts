// Procedural textures: cobblestone, slabs, grunge, rune circles, decals.
// Everything is generated on the CPU once at startup (no external art assets).
import * as THREE from 'three';
import { makeFbm, mulberry, clamp, smooth } from '../util';

function canvasOf(size: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

/** 2D context that is never null (canvas 2D is always available in browsers). */
export function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  return c.getContext('2d')!;
}

function toTexture(canvas: HTMLCanvasElement, srgb: boolean, repeat = 1): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

/** Per-pixel output of a PBR sampler: height, albedo rgb (0..1), roughness. */
interface PBRSample { h: number; r: number; g: number; b: number; rough: number }
type PBRSampler = (u: number, v: number, out: PBRSample) => void;
export interface PBRCanvases { albedo: HTMLCanvasElement; normal: HTMLCanvasElement; rough: HTMLCanvasElement }

// Builds albedo / normal / roughness maps from per-pixel callbacks.
function buildPBR(size: number, sampler: PBRSampler, normalStrength = 2.5): PBRCanvases {
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
  const mk = (data: Uint8ClampedArray<ArrayBuffer>) => { const c = canvasOf(size); ctx2d(c).putImageData(new ImageData(data, size, size), 0, 0); return c; };
  return { albedo: mk(albedo), normal: mk(normal), rough: mk(rough) };
}

// Jittered-grid Voronoi, tileable. Returns F1, F2 (in cell units) and cell id.
function makeVoronoi(seed: number, cells: number) {
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

const cache: Record<string, PBRCanvases> = {};
const texCache: Record<string, THREE.CanvasTexture> = {};

export function cobblestone(): PBRCanvases {
  if (cache.cobble) return cache.cobble;
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
  cache.cobble = maps;
  return maps;
}

// Rectangular slabs / bricks in running bond (walls, dais).
export function slabs(seed = 21, rows = 4, cols = 3, tint: [number, number, number] = [1, 1, 1]): PBRCanvases {
  const key = `slab${seed}_${rows}_${cols}`;
  if (cache[key]) return cache[key];
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
  cache[key] = maps;
  return maps;
}

export function grunge(): PBRCanvases {
  if (cache.grunge) return cache.grunge;
  const fbm = makeFbm(42, 4, 6);
  const maps = buildPBR(256, (u, v, o) => {
    const n = fbm(u, v);
    o.h = n; o.r = o.g = o.b = 0.55 + n * 0.45;
    o.rough = 0.6 + n * 0.4;
  }, 2);
  cache.grunge = maps;
  return maps;
}

export function pbrMaterialMaps(maps: PBRCanvases, repeat: number, normalScale = 1) {
  return {
    map: toTexture(maps.albedo, true, repeat),
    normalMap: toTexture(maps.normal, false, repeat),
    roughnessMap: toTexture(maps.rough, false, repeat),
    normalScale: new THREE.Vector2(normalScale, normalScale),
  };
}

export function textureFromCanvas(c: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const t = toTexture(c, srgb, 1);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// Glowing rune circle drawn with 2D canvas (white on transparent; tinted by material).
export function runeCircle(seed = 1, size = 1024): THREE.CanvasTexture {
  const c = canvasOf(size);
  const g = ctx2d(c);
  const rng = mulberry(seed);
  const cx = size / 2;
  g.strokeStyle = '#fff'; g.fillStyle = '#fff';
  g.shadowColor = '#fff'; g.shadowBlur = size / 90;
  const ring = (r: number, w: number) => { g.lineWidth = w; g.beginPath(); g.arc(cx, cx, r, 0, Math.PI * 2); g.stroke(); };
  ring(size * 0.48, size * 0.008);
  ring(size * 0.445, size * 0.003);
  ring(size * 0.33, size * 0.006);
  ring(size * 0.16, size * 0.004);
  // glyph band
  const glyphs = 36;
  for (let i = 0; i < glyphs; i++) {
    const a = (i / glyphs) * Math.PI * 2;
    g.save();
    g.translate(cx + Math.cos(a) * size * 0.39, cx + Math.sin(a) * size * 0.39);
    g.rotate(a + Math.PI / 2);
    g.lineWidth = size * 0.004;
    g.beginPath();
    const s = size * 0.022;
    for (let k = 0; k < 3; k++) {
      g.moveTo((rng() - 0.5) * s * 2, (rng() - 0.5) * s * 2);
      g.lineTo((rng() - 0.5) * s * 2, (rng() - 0.5) * s * 2);
    }
    g.stroke();
    g.restore();
  }
  // star polygon
  g.lineWidth = size * 0.004;
  const pts = 7;
  g.beginPath();
  for (let i = 0; i <= pts; i++) {
    const a = (i * 3 / pts) * Math.PI * 2 - Math.PI / 2;
    const x = cx + Math.cos(a) * size * 0.33, y = cx + Math.sin(a) * size * 0.33;
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.stroke();
  return textureFromCanvas(c);
}

// Radial soft decal (scorch / frost / shadow blob).
export function radialDecal(inner = 'rgba(0,0,0,0.9)', outer = 'rgba(0,0,0,0)', noisy = true, seed = 3) {
  const size = 256;
  const c = canvasOf(size);
  const g = ctx2d(c);
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.55, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  if (noisy) {
    const img = g.getImageData(0, 0, size, size);
    const fbm = makeFbm(seed, 6, 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      img.data[i + 3] *= clamp(fbm(x / size, y / size) * 1.8 - 0.25, 0, 1);
    }
    g.putImageData(img, 0, 0);
  }
  return textureFromCanvas(c);
}

// Emissive lava/aether crack texture for brute skins.
export function cracks(seed = 5): THREE.CanvasTexture {
  const key = 'cracks' + seed;
  if (texCache[key]) return texCache[key];
  const vor = makeVoronoi(seed, 6);
  const fbm = makeFbm(seed, 8, 3);
  const size = 256;
  const c = canvasOf(size);
  const g = ctx2d(c);
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const r = vor(x / size, y / size);
    const e = clamp(1 - (r.f2 - r.f1) / 0.07, 0, 1) * (0.5 + fbm(x / size, y / size));
    const i = (y * size + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = clamp(e * e, 0, 1) * 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  texCache[key] = toTexture(c, true, 1);
  return texCache[key];
}
