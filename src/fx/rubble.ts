// Rubble: the pieces a broken prop leaves, shaped like what broke: stone in chunks and slabs, wood in long
// splinters, chips and bark, a mushroom in cap fragments and stem pieces. Real geometry that tumbles, bounces
// off the floor and comes to rest lying flat, stays a few seconds and shrinks away. One instanced mesh per
// shape from fixed pools (the oldest piece is reused when one runs out), all sharing one material, so no
// shader beyond the effects' warm-up compiles.
import * as THREE from 'three';
import { G } from '../state';
import { groundHeight } from '../world/ground';
import { rand } from '../util';

type Shape = 'rock' | 'box' | 'cyl';
/** what a prop is made of: sets its pieces */
export type RubbleKind = 'stone' | 'wood' | 'shroom' | 'ember';

const MAX: Record<Shape, number> = { rock: 160, box: 200, cyl: 80 };
/** seconds a piece lies before it goes, and how long it takes to shrink away */
const LIFE = 6, SHRINK = 1.3;
const GRAVITY = 15, BOUNCE = 0.35, HALF = Math.PI / 2;

interface Chunk { shape: Shape; x: number; y: number; z: number; vx: number; vy: number; vz: number; rx: number; ry: number; rz: number; wx: number; wy: number; wz: number; sx: number; sy: number; sz: number; t: number; life: number; rest: boolean; flat: boolean }
interface Pool { mesh: THREE.InstancedMesh; chunks: Chunk[]; next: number }
const SHAPES: Shape[] = ['rock', 'box', 'cyl'];
const pools = {} as Record<Shape, Pool>;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();

/** One kind of piece in a recipe: its shape, its share of a prop's pieces, its size along each axis (a box's long
 * axis is z, a cylinder's y) and its colour (`null`: the prop's own) */
interface Part { shape: Shape; w: number; sx: number; sy: number; sz: number; color: number | null; shade?: number }
const RECIPES: Record<RubbleKind, Part[]> = {
  stone: [
    { shape: 'rock', w: 5, sx: 1, sy: 0.7, sz: 0.9, color: null },
    { shape: 'box', w: 3, sx: 1.1, sy: 0.35, sz: 0.9, color: null },
    { shape: 'rock', w: 3, sx: 0.4, sy: 0.35, sz: 0.4, color: null, shade: 0.75 },
  ],
  wood: [
    { shape: 'box', w: 5, sx: 0.16, sy: 0.14, sz: 2.4, color: 0xb08a58 },   // splinters, pale where it split
    { shape: 'box', w: 4, sx: 0.8, sy: 0.12, sz: 0.55, color: 0xa07c4c },   // chips
    { shape: 'box', w: 2, sx: 0.45, sy: 0.3, sz: 1.3, color: null },        // bark strips
    { shape: 'cyl', w: 1, sx: 0.55, sy: 0.4, sz: 0.55, color: 0x8a6a40 },   // a stub of trunk
  ],
  shroom: [
    { shape: 'rock', w: 5, sx: 1, sy: 0.4, sz: 0.85, color: 0x40b090 },     // cap fragments
    { shape: 'cyl', w: 3, sx: 0.4, sy: 0.6, sz: 0.4, color: 0xd8d0b8 },     // stem pieces
    { shape: 'rock', w: 2, sx: 0.4, sy: 0.3, sz: 0.4, color: 0xe8e2cc },    // gills and flesh
  ],
  ember: [
    { shape: 'box', w: 4, sx: 0.2, sy: 0.2, sz: 2.2, color: 0x2a1e16 },     // charred sticks
    { shape: 'box', w: 2, sx: 0.5, sy: 0.4, sz: 1.2, color: 0x3a2a1c },
    { shape: 'rock', w: 4, sx: 0.4, sy: 0.35, sz: 0.4, color: 0xff7a2a },   // coals
  ],
};

export function initRubble(): void {
  const geos: Record<Shape, THREE.BufferGeometry> = { rock: new THREE.DodecahedronGeometry(1, 0), box: new THREE.BoxGeometry(2, 2, 2), cyl: new THREE.CylinderGeometry(1, 1, 2, 7) };
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0.05, flatShading: true });
  for (const sh of SHAPES) {
    const mesh = new THREE.InstancedMesh(geos[sh], mat, MAX[sh]);
    // the colour attribute exists from the start (adding it later would change the shader)
    for (let i = 0; i < MAX[sh]; i++) mesh.setColorAt(i, _c.set(0x808080));
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.castShadow = mesh.receiveShadow = true;
    G.scene.add(mesh);
    pools[sh] = { mesh, chunks: [], next: 0 };
  }
}

export interface RubbleOpts { count: number; color: number; kind?: RubbleKind; /** where the pieces start: a circle round x, z, and a height range */ radius: number; height: number; /** the pieces' size (m) and how hard they fly */ size: number; speed: number }

/** A prop's worth of pieces at (x, z) */
export function rubble(x: number, z: number, { count, color, kind = 'stone', radius, height, size, speed }: RubbleOpts): void {
  if (!pools.rock) return;
  const parts = RECIPES[kind], total = parts.reduce((a, q) => a + q.w, 0), dirty = new Set<Pool>();
  for (let i = 0; i < count; i++) {
    let r = Math.random() * total, part = parts[0];
    for (const q of parts) { if ((r -= q.w) < 0) { part = q; break; } }
    const pool = pools[part.shape], slot = pool.next, c = pool.chunks[slot] ??= {} as Chunk;
    pool.next = (slot + 1) % MAX[part.shape];
    const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * radius, s = size * rand(0.4, 1);
    Object.assign(c, {
      shape: part.shape,
      x: x + Math.cos(a) * d, y: groundHeight(x, z) + 0.15 + Math.random() * height, z: z + Math.sin(a) * d,
      vx: Math.cos(a) * speed * rand(0.3, 1), vy: rand(1.5, 4.5) * (speed / 4), vz: Math.sin(a) * speed * rand(0.3, 1),
      rx: rand(0, 6), ry: rand(0, 6), rz: rand(0, 6), wx: rand(-9, 9), wy: rand(-9, 9), wz: rand(-9, 9),
      sx: s * part.sx * rand(0.8, 1.2), sy: s * part.sy * rand(0.8, 1.2), sz: s * part.sz * rand(0.8, 1.2), t: 0, life: LIFE + rand(0, 3), rest: false, flat: part.shape !== 'rock',
    });
    pool.mesh.setColorAt(slot, _c.set(part.color ?? color).multiplyScalar((part.shade ?? 1) * rand(0.75, 1.15)));
    pool.mesh.count = Math.min(MAX[part.shape], Math.max(pool.mesh.count, pool.chunks.length));
    dirty.add(pool);
  }
  for (const pool of dirty) pool.mesh.instanceColor!.needsUpdate = true;
}

/** how far the piece's lowest point is below its centre, for the way it's turned */
function halfHeight(c: Chunk): number {
  if (c.shape === 'rock') return Math.min(c.sx, c.sy, c.sz) * 0.75;
  const e = _m.makeRotationFromEuler(_e.set(c.rx, c.ry, c.rz)).elements;
  return c.shape === 'box' ? Math.abs(e[1]) * c.sx + Math.abs(e[5]) * c.sy + Math.abs(e[9]) * c.sz
    : Math.abs(e[5]) * c.sy + Math.hypot(e[1], e[9]) * c.sx;
}
const snap = (a: number) => Math.round(a / HALF) * HALF;

export function updateRubble(dt: number): void {
  for (const sh of SHAPES) if (pools[sh]) updatePool(pools[sh], dt);
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
        } else { c.rest = true; c.vx = c.vy = c.vz = 0; c.wx = c.wy = c.wz = 0; }
      }
    } else if (c.flat) {
      // a box or a cylinder settles onto a face: ease its tilt to the nearest quarter turn
      const k = Math.min(1, dt * 12), tx = snap(c.rx), tz = snap(c.rz);
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
  for (const sh of SHAPES) { const p = pools[sh]; if (!p) continue; p.chunks.length = 0; p.next = 0; p.mesh.count = 0; }
}
