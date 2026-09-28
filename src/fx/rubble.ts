// Rubble: the chunks a broken prop leaves. Real geometry that tumbles, bounces off the floor and comes to
// rest, lies there a few seconds and shrinks away. One instanced mesh from a fixed pool (the oldest chunk is
// reused when it runs out), so it's one draw call and its shader is warmed with the effects.
import * as THREE from 'three';
import { G } from '../state';
import { groundHeight } from '../world/ground';
import { rand } from '../util';

const MAX = 240;
/** seconds a chunk lies before it goes, and how long it takes to shrink away */
const LIFE = 6, SHRINK = 1.3;
const GRAVITY = 15, BOUNCE = 0.35;

interface Chunk { x: number; y: number; z: number; vx: number; vy: number; vz: number; rx: number; ry: number; rz: number; wx: number; wy: number; wz: number; sx: number; sy: number; sz: number; t: number; life: number; rest: boolean }
const chunks: Chunk[] = [];
let next = 0;
let mesh: THREE.InstancedMesh | null = null;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();

export function initRubble(): void {
  const geo = new THREE.DodecahedronGeometry(1, 0);
  mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0.05, flatShading: true }), MAX);
  // the colour attribute exists from the start (adding it later would change the shader)
  for (let i = 0; i < MAX; i++) mesh.setColorAt(i, _c.set(0x808080));
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.castShadow = mesh.receiveShadow = true;
  G.scene.add(mesh);
}

export interface RubbleOpts { count: number; color: number; /** where the chunks start: a circle round x, z, and a height range */ radius: number; height: number; /** the chunks' size (m) and how hard they fly */ size: number; speed: number }

/** A prop's worth of chunks at (x, z) */
export function rubble(x: number, z: number, { count, color, radius, height, size, speed }: RubbleOpts): void {
  if (!mesh) return;
  const base = new THREE.Color(color);
  for (let i = 0; i < count; i++) {
    const c = chunks[next] ??= {} as Chunk, slot = next;
    next = (next + 1) % MAX;
    const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * radius, s = size * rand(0.4, 1);
    Object.assign(c, {
      x: x + Math.cos(a) * d, y: groundHeight(x, z) + 0.15 + Math.random() * height, z: z + Math.sin(a) * d,
      vx: Math.cos(a) * speed * rand(0.3, 1), vy: rand(1.5, 4.5) * (speed / 4), vz: Math.sin(a) * speed * rand(0.3, 1),
      rx: rand(0, 6), ry: rand(0, 6), rz: rand(0, 6), wx: rand(-9, 9), wy: rand(-9, 9), wz: rand(-9, 9),
      // slabs and splinters more than cubes
      sx: s * rand(0.6, 1.3), sy: s * rand(0.35, 0.9), sz: s * rand(0.5, 1.2), t: 0, life: LIFE + rand(0, 3), rest: false,
    });
    mesh.setColorAt(slot, _c.copy(base).multiplyScalar(rand(0.6, 1.15)));
  }
  mesh.instanceColor!.needsUpdate = true;
  mesh.count = Math.min(MAX, Math.max(mesh.count, chunks.length));
}

export function updateRubble(dt: number): void {
  if (!mesh || !mesh.count) return;
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
      const floor = groundHeight(c.x, c.z) + c.sy * 0.6;
      if (c.y < floor) {
        c.y = floor;
        if (c.vy < -1.2) {
          c.vy *= -BOUNCE; c.vx *= 0.6; c.vz *= 0.6; c.wx *= 0.5; c.wy *= 0.5; c.wz *= 0.5;
        } else { c.rest = true; c.vx = c.vy = c.vz = 0; }
      }
    }
    const k = c.life - c.t < SHRINK ? Math.max(0, (c.life - c.t) / SHRINK) : 1;
    _m.compose(_p.set(c.x, c.y, c.z), _q.setFromEuler(_e.set(c.rx, c.ry, c.rz)), _s.set(c.sx * k, c.sy * k, c.sz * k));
    mesh.setMatrixAt(i, _m);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (!live) mesh.count = 0;
}

export function clearRubble(): void { chunks.length = 0; next = 0; if (mesh) mesh.count = 0; }
