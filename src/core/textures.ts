// Procedural textures: cobblestone, slabs, forest floor, bark, grunge, rune circles, decals.
// Everything is generated on the CPU once at startup (no external art assets).
import * as THREE from 'three';
import { makeFbm, mulberry, clamp } from '../util';
import { RECIPES, PRELOAD, recipeKey, makeVoronoi, type PBRData, type RecipeName, type RecipeArgs } from './pbr';

function canvasOf(size: number, height = size): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = size; c.height = height;
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

export interface PBRCanvases { albedo: HTMLCanvasElement; normal: HTMLCanvasElement; rough: HTMLCanvasElement }

const cache = new Map<string, PBRCanvases>();
const texCache: Record<string, THREE.CanvasTexture> = {};
/** maps made by the loading workers, waiting to be asked for */
const made = new Map<string, PBRData>();

function pbrCanvases<N extends RecipeName>(name: N, ...args: RecipeArgs<N>): PBRCanvases {
  const key = recipeKey(name, args);
  let maps = cache.get(key);
  if (maps) return maps;
  const d = made.get(key) ?? (RECIPES[name] as (...a: RecipeArgs<N>) => PBRData)(...args);
  made.delete(key);
  const h = d.height ?? d.size;
  const mk = (data: Uint8ClampedArray<ArrayBuffer>) => { const c = canvasOf(d.size, h); ctx2d(c).putImageData(new ImageData(data, d.size, h), 0, 0); return c; };
  cache.set(key, maps = { albedo: mk(d.albedo), normal: mk(d.normal), rough: mk(d.rough) });
  return maps;
}

export const cobblestone = (): PBRCanvases => pbrCanvases('cobblestone');
/** Rectangular slabs / bricks in running bond (walls, dais). */
export const slabs = (seed = 21, rows = 4, cols = 3): PBRCanvases => pbrCanvases('slabs', seed, rows, cols);
export const grunge = (): PBRCanvases => pbrCanvases('grunge');
export const wood = (): PBRCanvases => pbrCanvases('wood');
export const burlap = (): PBRCanvases => pbrCanvases('burlap');
export const forestFloor = (): PBRCanvases => pbrCanvases('forestFloor');
export const bark = (): PBRCanvases => pbrCanvases('bark');
/** the heroes' materials: neutral albedo, tinted by the material's colour */
export const leather = (): PBRCanvases => pbrCanvases('leather');
export const mail = (): PBRCanvases => pbrCanvases('mail');
export const cloth = (): PBRCanvases => pbrCanvases('cloth');
export const steel = (): PBRCanvases => pbrCanvases('steel');
export const fur = (): PBRCanvases => pbrCanvases('fur');
/** a hero's painted face (entities/models/face.ts), on its head's ray grid */
export const faceCanvases = (who: 'warrior' | 'mage'): PBRCanvases => pbrCanvases('face', who);

/**
 * Make the game's PBR maps in workers, in parallel, while the page stays responsive: done on the
 * main thread they block it for over a second, and a window moved to another monitor meanwhile
 * shows black until the main thread can paint it. Without workers, the maps are made on first use.
 */
export async function preloadTextures(): Promise<void> {
  if (typeof Worker === 'undefined') return;
  const jobs = PRELOAD.slice();
  const n = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1, jobs.length));
  const run = (): Promise<void> => new Promise((resolve) => {
    let w: Worker;
    try { w = new Worker(new URL('./pbr.worker.ts', import.meta.url), { type: 'module' }); } catch { resolve(); return; }
    const next = (): void => {
      const job = jobs.shift();
      if (!job) { w.terminate(); resolve(); return; }
      w.postMessage(job);
    };
    w.onmessage = (e: MessageEvent<{ key: string; data: PBRData }>) => { made.set(e.data.key, e.data.data); next(); };
    // a worker that fails leaves its jobs to the main thread (on first use)
    w.onerror = () => { w.terminate(); resolve(); };
    next();
  });
  await Promise.all(Array.from({ length: n }, run));
}

// Textures are shared per (maps, repeat): every enemy of a kind reuses one GPU upload
// instead of uploading (and mipmapping) its own copies when it first comes into view.
const mapTextures = new WeakMap<PBRCanvases, Map<number, { map: THREE.Texture; normalMap: THREE.Texture; roughnessMap: THREE.Texture }>>();

export function pbrMaterialMaps(maps: PBRCanvases, repeat: number, normalScale = 1) {
  let byRepeat = mapTextures.get(maps);
  if (!byRepeat) mapTextures.set(maps, byRepeat = new Map());
  let tex = byRepeat.get(repeat);
  if (!tex) {
    tex = { map: toTexture(maps.albedo, true, repeat), normalMap: toTexture(maps.normal, false, repeat), roughnessMap: toTexture(maps.rough, false, repeat) };
    byRepeat.set(repeat, tex);
  }
  return { ...tex, normalScale: new THREE.Vector2(normalScale, normalScale) };
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

// Emissive veins: sparse branching lines on black that tile (corruption spreading under skin).
export function veins(seed = 3, count = 7): THREE.CanvasTexture {
  const key = `veins${seed},${count}`;
  if (texCache[key]) return texCache[key];
  const r = mulberry(seed), size = 512, c = canvasOf(size), g = ctx2d(c);
  g.fillStyle = '#000'; g.fillRect(0, 0, size, size);
  g.lineCap = 'round'; g.lineJoin = 'round';
  const branch = (x: number, y: number, a: number, w: number, len: number, depth: number): void => {
    const pts: [number, number][] = [[x, y]];
    for (let i = 0; i < len; i++) { a += (r() - 0.5) * 0.9; x += Math.cos(a) * 9; y += Math.sin(a) * 9; pts.push([x, y]); }
    // drawn at every tile offset so the texture wraps without seams
    for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) {
      g.beginPath(); g.moveTo(pts[0][0] + ox, pts[0][1] + oy);
      for (const [px, py] of pts) g.lineTo(px + ox, py + oy);
      g.lineWidth = w * 3.5; g.strokeStyle = 'rgba(255,255,255,0.12)'; g.stroke();
      g.lineWidth = w; g.strokeStyle = 'rgba(255,255,255,0.9)'; g.stroke();
    }
    if (depth > 0) for (let k = 0; k < 2; k++) {
      const [bx, by] = pts[Math.floor(r() * (pts.length - 1)) + 1];
      branch(bx, by, a + (r() < 0.5 ? -1 : 1) * (0.5 + r() * 0.7), w * 0.6, Math.floor(len * 0.6), depth - 1);
    }
  };
  for (let i = 0; i < count; i++) branch(r() * size, r() * size, r() * Math.PI * 2, 2.6, 14 + Math.floor(r() * 10), 2);
  texCache[key] = toTexture(c, true, 1);
  return texCache[key];
}
