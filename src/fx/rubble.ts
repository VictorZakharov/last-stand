// Rubble: the pieces a broken prop leaves, shaped like what broke. Stone breaks into irregular faceted shards with
// flat fracture faces, wood into tapered splinters, flakes and bark strips with the grain painted on, a glowcap into
// glowing cap fragments and pale stem pieces, a bonfire into charred sticks and glowing coals. Real geometry that
// tumbles, bounces off the floor and topples onto its broad face (nothing rests on its end), stays a few seconds
// and shrinks away. One instanced mesh per shape variant, from fixed pools (the oldest piece is reused when one
// runs out). The materials share one shader program (a glow is only an emissive colour), warmed in `warmup.ts`.
import * as THREE from 'three';
import { G } from '../state';
import { groundHeight } from '../world/ground';
import { rand, mulberry } from '../util';
import { ctx2d, textureFromCanvas } from '../core/textures';

type Shape = 'stone' | 'coal' | 'cap' | 'cyl' | 'splinter' | 'chip' | 'bark';
/** what a prop is made of: sets its pieces */
export type RubbleKind = 'stone' | 'wood' | 'shroom' | 'ember';

/** pool size and number of different shapes, per shape (each variant is its own mesh with `max` pieces) */
const POOL: Record<Shape, { max: number; variants: number }> = {
  stone: { max: 60, variants: 4 }, coal: { max: 40, variants: 3 }, cap: { max: 40, variants: 3 }, cyl: { max: 40, variants: 1 },
  splinter: { max: 40, variants: 3 }, chip: { max: 50, variants: 3 }, bark: { max: 30, variants: 2 },
};
/** seconds a piece lies before it goes, and how long it takes to shrink away */
const LIFE = 6, SHRINK = 1.3;
const GRAVITY = 15, BOUNCE = 0.35, HALF = Math.PI / 2;

interface Chunk { shape: Shape; pool: string; x: number; y: number; z: number; vx: number; vy: number; vz: number; rx: number; ry: number; rz: number; wx: number; wy: number; wz: number; sx: number; sy: number; sz: number; t: number; life: number; rest: boolean; tx: number; tz: number }
interface Pool { mesh: THREE.InstancedMesh; chunks: Chunk[]; next: number; max: number }
const pools: Record<string, Pool> = {};
let coalMat: THREE.MeshStandardMaterial | null = null;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();

/** One kind of piece in a recipe: its shape, its share of a prop's pieces, its size along each axis (a splinter's
 * grain runs along z, a cylinder's y) and its colour (`null`: the prop's own) */
interface Part { shape: Shape; w: number; sx: number; sy: number; sz: number; color: number | null; shade?: number }
const RECIPES: Record<RubbleKind, Part[]> = {
  stone: [
    { shape: 'stone', w: 5, sx: 1, sy: 0.75, sz: 0.9, color: null },
    { shape: 'stone', w: 3, sx: 1.15, sy: 0.32, sz: 0.95, color: null },                // slabs
    { shape: 'stone', w: 3, sx: 0.4, sy: 0.35, sz: 0.4, color: null, shade: 0.75 },     // grit
  ],
  wood: [
    { shape: 'splinter', w: 4, sx: 0.3, sy: 0.22, sz: 2.4, color: 0xffffff },   // splinters, pale where it split
    { shape: 'chip', w: 5, sx: 0.55, sy: 0.16, sz: 0.85, color: 0xf2e4c8 },     // flakes
    { shape: 'bark', w: 2, sx: 0.5, sy: 0.12, sz: 1.5, color: 0xffffff },       // bark strips
    { shape: 'cyl', w: 1, sx: 0.55, sy: 0.4, sz: 0.55, color: 0x8a6a40 },       // a stub of trunk
  ],
  shroom: [
    { shape: 'cap', w: 5, sx: 1, sy: 0.4, sz: 0.85, color: 0x40b090 },          // cap fragments (they glow)
    { shape: 'cyl', w: 3, sx: 0.4, sy: 0.6, sz: 0.4, color: 0xd8d0b8 },         // stem pieces
    { shape: 'cap', w: 2, sx: 0.4, sy: 0.3, sz: 0.4, color: 0xe8e2cc },
  ],
  ember: [
    { shape: 'splinter', w: 4, sx: 0.3, sy: 0.25, sz: 2.2, color: 0x2a1e16 },   // charred sticks
    { shape: 'bark', w: 2, sx: 0.5, sy: 0.15, sz: 1.2, color: 0x4a3a2c },
    { shape: 'coal', w: 4, sx: 0.4, sy: 0.35, sz: 0.4, color: 0x5a2a12 },       // coals (they glow)
  ],
};

/** A hot coal: a dark crust with glowing cracks and a few bright patches, for the emissive map */
function coalTexture(): THREE.CanvasTexture {
  const S = 128, rng = mulberry(57), c = document.createElement('canvas');
  c.width = c.height = S;
  const g = ctx2d(c);
  g.fillStyle = '#1a0a04'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 7; i++) {
    const r = 14 + rng() * 26, x = rng() * S, y = rng() * S, grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(255,140,40,0.75)'); grad.addColorStop(1, 'rgba(255,60,10,0)');
    g.fillStyle = grad; g.fillRect(0, 0, S, S);
  }
  g.lineCap = 'round';
  for (let i = 0; i < 16; i++) {
    let x = rng() * S, y = rng() * S, a = rng() * 6.3;
    g.strokeStyle = `rgba(255,${150 + Math.floor(rng() * 90)},60,${0.7 + rng() * 0.3})`; g.lineWidth = 1 + rng() * 2.2;
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 6; k++) { a += (rng() - 0.5) * 1.6; x += Math.cos(a) * (6 + rng() * 10); y += Math.sin(a) * (6 + rng() * 10); g.lineTo(x, y); }
    g.stroke();
  }
  return textureFromCanvas(c);
}

const fract = (x: number) => x - Math.floor(x);
/** An irregular broken stone: a subdivided ball whose points are pushed in and out (as a function of position, so
 * it stays whole) and cut by a few planes, which leave the flat faces a fracture does. Flat shaded. */
function stoneGeometry(seed: number): THREE.BufferGeometry {
  const rng = mulberry(seed), g = new THREE.IcosahedronGeometry(1, 1);
  const cuts = Array.from({ length: 4 }, () => ({ n: new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize(), d: 0.45 + rng() * 0.3 }));
  const a = rng() * 50, pos = g.getAttribute('position'), v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    v.multiplyScalar(0.72 + 0.4 * fract(Math.sin(v.x * 12.9898 + v.y * 78.233 + v.z * 37.719 + a) * 43758.5453));
    for (const c of cuts) { const over = v.dot(c.n) - c.d; if (over > 0) v.addScaledVector(c.n, -over); }
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeBoundingSphere();
  return g;
}

/** Grain and bark, painted: the left half is fresh wood (pale, with growth rings, grain and fibres), the right half
 * bark (dark furrows). One canvas for colour, one as a bump map. */
function woodAtlas(): { albedo: HTMLCanvasElement; height: HTMLCanvasElement } {
  const W = 256, H = 256, rng = mulberry(31);
  const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
  const albedo = mk(), height = mk(), a = ctx2d(albedo), h = ctx2d(height);
  a.fillStyle = '#dcc08a'; a.fillRect(0, 0, W / 2, H);
  a.fillStyle = '#3f2e1c'; a.fillRect(W / 2, 0, W / 2, H);
  h.fillStyle = '#b0b0b0'; h.fillRect(0, 0, W, H);
  const line = (ctx: CanvasRenderingContext2D, x0: number, amp: number, ph: number, col: string, lw: number) => {
    ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath();
    for (let y = 0; y <= H; y += 8) { const x = x0 + Math.sin(y * 0.03 + ph) * amp + Math.sin(y * 0.11 + ph * 2) * amp * 0.25; if (y) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
    ctx.stroke();
  };
  // fresh wood: growth rings as long dark bands, fine grain between, pale fibre streaks
  for (let i = 0; i < 9; i++) { const x = 6 + i * 13.5 + rng() * 5; line(a, x, 4 + rng() * 5, rng() * 6, `rgba(150,105,55,${0.22 + rng() * 0.2})`, 2 + rng() * 3); line(h, x, 4, rng() * 6, 'rgba(60,60,60,0.5)', 2); }
  for (let i = 0; i < 70; i++) {
    const x = (rng() * W) / 2, dark = rng() < 0.5;
    line(a, x, 1.5 + rng() * 3, rng() * 6, dark ? `rgba(120,80,40,${0.1 + rng() * 0.18})` : `rgba(245,225,180,${0.15 + rng() * 0.2})`, 0.6 + rng());
    line(h, x, 2, rng() * 6, dark ? 'rgba(40,40,40,0.25)' : 'rgba(230,230,230,0.25)', 0.8);
  }
  for (let i = 0; i < 260; i++) { const x = (rng() * W) / 2, y = rng() * H, l = 4 + rng() * 14; a.fillStyle = `rgba(90,60,30,${0.08 + rng() * 0.12})`; a.fillRect(x, y, 0.8, l); h.fillStyle = 'rgba(40,40,40,0.3)'; h.fillRect(x, y, 0.8, l); }
  // bark: deep furrows between ridges
  for (let i = 0; i < 16; i++) {
    const x = W / 2 + 4 + i * 7.6 + rng() * 3;
    line(a, x, 3 + rng() * 5, rng() * 6, `rgba(14,9,5,${0.55 + rng() * 0.3})`, 2 + rng() * 3); line(h, x, 3, rng() * 6, 'rgba(0,0,0,0.85)', 3);
    line(a, x + 4, 3, rng() * 6, 'rgba(110,84,56,0.35)', 2); line(h, x + 4, 3, rng() * 6, 'rgba(255,255,255,0.5)', 2);
  }
  for (let i = 0; i < 200; i++) { const x = W / 2 + (rng() * W) / 2, y = rng() * H; a.fillStyle = `rgba(${rng() < 0.5 ? '20,14,8' : '120,96,66'},0.25)`; a.fillRect(x, y, 1 + rng() * 2, 2 + rng() * 6); }
  return { albedo, height };
}

/** A tapered, jagged-edged lens of wood with the grain along z: a sliver, a flake or a strip of bark. About 1 in
 * half-width, half-length and half-thickness, bent a little, so a piece's own scale sizes it. A splinter and a strip
 * show wood on top and bark below (a strip: bark on both). */
function flakeGeometry(kind: 'splinter' | 'chip' | 'bark', seed: number): THREE.BufferGeometry {
  const rng = mulberry(seed), NU = 7, NV = 14, pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const split = kind === 'splinter';
  // per row: how far each edge is dragged in or out (jagged), and a sideways drift (a curved sliver)
  const jl: number[] = [], jr: number[] = [], drift: number[] = [];
  for (let j = 0; j < NV; j++) { jl.push(1 + (rng() - 0.5) * (split ? 0.5 : 0.35)); jr.push(1 + (rng() - 0.5) * (split ? 0.5 : 0.35)); drift.push((rng() - 0.5) * 0.12); }
  const u0 = rng() * 0.12, v0 = rng() * 0.4, lean = (rng() - 0.5) * 0.5;
  for (const face of [1, -1]) {
    const base = pos.length / 3, bark = kind === 'bark' || face < 0;
    for (let j = 0; j < NV; j++) {
      const v = -1 + (2 * j) / (NV - 1), av = Math.abs(v);
      // pointed ends: a sliver runs to a point, a flake is rounder; one end blunter than the other
      const taper = split ? Math.pow(Math.max(0, 1 - Math.pow(av, 1.3)), 0.9) : Math.pow(Math.max(0, 1 - Math.pow(av, 2.2)), 0.55);
      const along = Math.min(1, Math.max(0.35, (v * 0.5 + 0.5) * (1 + lean) + 0.5 - lean * 0.5));
      for (let i = 0; i < NU; i++) {
        const u = -1 + (2 * i) / (NU - 1);
        const w = taper * (u < 0 ? jl[j] : jr[j]) * (0.55 + 0.45 * along);
        const t = Math.sqrt(Math.max(0, 1 - u * u)) * Math.pow(Math.max(0, 1 - v * v), 0.35);
        // bowed across the width (a flake curls) and along its length (a sliver springs)
        const bend = (split ? 0.5 * v * v : 0.9 * u * u) - 0.25;
        pos.push(u * w + drift[j] * 3 * (1 - av), bend + face * t, v);
        uv.push((bark ? 0.5 : 0) + 0.03 + u0 + ((u + 1) / 2) * 0.4, v0 + ((v + 1) / 2) * 0.55);
      }
    }
    for (let j = 0; j < NV - 1; j++) for (let i = 0; i < NU - 1; i++) {
      const a = base + j * NU + i, b = a + 1, c = a + NU, d = c + 1;
      // the top faces up, the underside down
      if (face > 0) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function initRubble(): void {
  const atlas = woodAtlas();
  const solid = (emissive = 0x000000, intensity = 1) => new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0.05, flatShading: true, emissive, emissiveIntensity: intensity });
  const mats: Record<Shape, THREE.Material> = {
    stone: solid(), cyl: solid(),
    coal: solid(0xffffff, 2.2), cap: solid(0x22c89a, 0.9),
    splinter: null!, chip: null!, bark: null!,
  };
  coalMat = mats.coal as THREE.MeshStandardMaterial;
  coalMat.emissiveMap = coalTexture();
  const woodMat = new THREE.MeshStandardMaterial({ map: textureFromCanvas(atlas.albedo), bumpMap: textureFromCanvas(atlas.height, false), bumpScale: 2, roughness: 0.85, metalness: 0 });
  mats.splinter = mats.chip = mats.bark = woodMat;
  for (const shape of Object.keys(POOL) as Shape[]) {
    const { max, variants } = POOL[shape];
    for (let v = 0; v < variants; v++) {
      const geo = shape === 'cyl' ? new THREE.CylinderGeometry(1, 1, 2, 7)
        : shape === 'splinter' || shape === 'chip' || shape === 'bark' ? flakeGeometry(shape, 101 + v * 17 + shape.length * 5)
        : stoneGeometry(7 + v * 13 + shape.length * 3);
      const mesh = new THREE.InstancedMesh(geo, mats[shape], max);
      // the colour attribute exists from the start (adding it later would change the shader)
      for (let i = 0; i < max; i++) mesh.setColorAt(i, _c.set(0x808080));
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.castShadow = mesh.receiveShadow = true;
      G.scene.add(mesh);
      pools[`${shape}:${v}`] = { mesh, chunks: [], next: 0, max };
    }
  }
}

export interface RubbleOpts { count: number; color: number; kind?: RubbleKind; /** where the pieces start: a circle round x, z, and a height range */ radius: number; height: number; /** the pieces' size (m) and how hard they fly */ size: number; speed: number }

/** A prop's worth of pieces at (x, z) */
export function rubble(x: number, z: number, { count, color, kind = 'stone', radius, height, size, speed }: RubbleOpts): void {
  if (!pools['stone:0']) return;
  const parts = RECIPES[kind], total = parts.reduce((a, q) => a + q.w, 0), dirty = new Set<Pool>();
  for (let i = 0; i < count; i++) {
    let r = Math.random() * total, part = parts[0];
    for (const q of parts) { if ((r -= q.w) < 0) { part = q; break; } }
    const key = `${part.shape}:${Math.floor(Math.random() * POOL[part.shape].variants)}`;
    const pool = pools[key], slot = pool.next, c = pool.chunks[slot] ??= {} as Chunk;
    pool.next = (slot + 1) % pool.max;
    const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * radius, s = size * rand(0.4, 1);
    Object.assign(c, {
      shape: part.shape, pool: key,
      x: x + Math.cos(a) * d, y: groundHeight(x, z) + 0.15 + Math.random() * height, z: z + Math.sin(a) * d,
      vx: Math.cos(a) * speed * rand(0.3, 1), vy: rand(1.5, 4.5) * (speed / 4), vz: Math.sin(a) * speed * rand(0.3, 1),
      rx: rand(0, 6), ry: rand(0, 6), rz: rand(0, 6), wx: rand(-9, 9), wy: rand(-9, 9), wz: rand(-9, 9),
      sx: s * part.sx * rand(0.8, 1.2), sy: s * part.sy * rand(0.8, 1.2), sz: s * part.sz * rand(0.8, 1.2), t: 0, life: LIFE + rand(0, 3), rest: false, tx: 0, tz: 0,
    });
    pool.mesh.setColorAt(slot, _c.set(part.color ?? color).multiplyScalar((part.shade ?? 1) * rand(0.75, 1.15)));
    pool.mesh.count = Math.min(pool.max, Math.max(pool.mesh.count, pool.chunks.length));
    dirty.add(pool);
  }
  for (const pool of dirty) pool.mesh.instanceColor!.needsUpdate = true;
}

/** how far the piece's lowest point is below its centre, for the way it's turned (its box, a little smaller for the
 * rounder stones) */
function halfHeight(c: Chunk): number {
  const e = _m.makeRotationFromEuler(_e.set(c.rx, c.ry, c.rz)).elements;
  if (c.shape === 'cyl') return Math.abs(e[5]) * c.sy + Math.hypot(e[1], e[9]) * c.sx;
  const h = Math.abs(e[1]) * c.sx + Math.abs(e[5]) * c.sy + Math.abs(e[9]) * c.sz;
  return c.shape === 'stone' || c.shape === 'coal' || c.shape === 'cap' ? h * 0.8 : h;
}

/** The quarter turns nearest the piece's tilt that lay it lowest, its broadest face down: nothing rests on its end */
function settle(c: Chunk): void {
  const bx = Math.round(c.rx / HALF), bz = Math.round(c.rz / HALF), rx = c.rx, rz = c.rz;
  let best = 1e9;
  for (let i = -1; i <= 1; i++) for (let k = -1; k <= 1; k++) {
    c.rx = (bx + i) * HALF; c.rz = (bz + k) * HALF;
    const score = halfHeight(c) + 0.02 * (Math.abs(i) + Math.abs(k));
    if (score < best) { best = score; c.tx = c.rx; c.tz = c.rz; }
  }
  c.rx = rx; c.rz = rz;
}

export function updateRubble(dt: number): void {
  // the coals breathe, slowly (about 0.6 Hz)
  if (coalMat) coalMat.emissiveIntensity = 2.2 + 0.5 * Math.sin(G.time * 3.8);
  for (const k in pools) updatePool(pools[k], dt);
}

function updatePool({ mesh, chunks }: Pool, dt: number): void {
  if (!mesh.count) return;
  let live = 0;
  for (let i = 0; i < mesh.count; i++) {
    const c = chunks[i];
    if (!c || c.t >= c.life) { _m.makeScale(0, 0, 0); mesh.setMatrixAt(i, _m); continue; }
    c.t += dt;
    live++;
    if (!c.rest) {
      c.vy -= GRAVITY * dt;
      c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt;
      c.rx += c.wx * dt; c.ry += c.wy * dt; c.rz += c.wz * dt;
      const floor = groundHeight(c.x, c.z) + halfHeight(c);
      if (c.y < floor) {
        c.y = floor;
        if (c.vy < -1.2) {
          c.vy *= -BOUNCE; c.vx *= 0.6; c.vz *= 0.6; c.wx *= 0.5; c.wy *= 0.5; c.wz *= 0.5;
        } else { c.rest = true; c.vx = c.vy = c.vz = 0; c.wx = c.wy = c.wz = 0; settle(c); }
      }
    } else {
      // it topples onto its broad face
      const k = Math.min(1, dt * 12), { tx, tz } = c;
      if (Math.abs(tx - c.rx) + Math.abs(tz - c.rz) > 1e-3) {
        c.rx += (tx - c.rx) * k; c.rz += (tz - c.rz) * k;
        c.y = groundHeight(c.x, c.z) + halfHeight(c);
      }
    }
    const k = c.life - c.t < SHRINK ? Math.max(0, (c.life - c.t) / SHRINK) : 1;
    _m.compose(_p.set(c.x, c.y, c.z), _q.setFromEuler(_e.set(c.rx, c.ry, c.rz)), _s.set(c.sx * k, c.sy * k, c.sz * k));
    mesh.setMatrixAt(i, _m);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (!live) mesh.count = 0;
}

export function clearRubble(): void {
  for (const k in pools) { const p = pools[k]; p.chunks.length = 0; p.next = 0; p.mesh.count = 0; }
}
