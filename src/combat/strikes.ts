// Where a shot strikes a foe: its body as it's drawn, met along the shot's step (its rigid meshes and its skinned
// limbs, fx/stuckArrows.ts `castSolid`). Struck only within its circle and under its height, an arrow aimed at a boss's
// arms or crown flew on through it, and one aimed past a small foe's shoulder at the boss behind struck the small foe
// it went by. (A column within its circle as well struck imps where nothing of them is drawn.)
import * as THREE from 'three';
import type { Enemy } from '../entities/enemy';
import { castSolid } from '../fx/stuckArrows';

const ray = new THREE.Raycaster(), _dir = new THREE.Vector3();

/** Where along the step from (ax, az) by (dx, dz) it first comes within `r` of (cx, cz): 0..1, or -1 if it doesn't. */
export function entry(ax: number, az: number, dx: number, dz: number, cx: number, cz: number, r: number): number {
  const fx = ax - cx, fz = az - cz, a = dx * dx + dz * dz, b = 2 * (fx * dx + fz * dz), c = fx * fx + fz * fz - r * r;
  if (c <= 0) return 0;
  if (a < 1e-9) return -1;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return -1;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : -1;
}

/**
 * Where along the step from `a` to `b` (0..1) a shot first meets `e`'s body, its meshes as drawn, or -1 if it doesn't.
 * They're met only when the step comes within the body's reach (`Enemy.reach`).
 */
export function strikesBody(e: Enemy, a: THREE.Vector3, b: THREE.Vector3): number {
  const dx = b.x - a.x, dz = b.z - a.z, base = e.obj.position.y;
  if (Math.min(a.y, b.y) > base + Math.max(e.height, e.reach.top) || Math.max(a.y, b.y) < base) return -1;
  if (entry(a.x, a.z, dx, dz, e.pos.x, e.pos.z, Math.max(e.radius, e.reach.out)) < 0) return -1;
  const length = a.distanceTo(b);
  if (length < 1e-6) return -1;
  ray.set(a, _dir.subVectors(b, a).divideScalar(length));
  ray.far = length;
  const hit = castSolid(e.obj, ray);
  return hit ? hit.distance / length : -1;
}
