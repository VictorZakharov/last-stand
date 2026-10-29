// What a hero idle long enough sits on (`entities/sitting.ts`): a fallen log or column along its length, a stone of
// a seat's height at its rim, the floor round a fire, facing it. Each biome lists its own (`Biome.seats`); a broken
// prop is no seat.
import * as THREE from 'three';
import type { Obstacle } from '../types';
import { G } from '../state';
import { groundHeight } from './ground';

/** A seat: the line a body sits along (a stone's a point, both ends the same), how far off that line it sits, the
 *  circles that keep bodies off it and what is drawn of it (its top, where a body sits, is met from above); a fire's
 *  (`ground`) is sat round on the floor, facing it. */
export interface Seat {
  ax: number; az: number; bx: number; bz: number;
  sit: number;
  circles: Obstacle[];
  meshes: THREE.Object3D[];
  ground?: boolean;
}

/** Where on a seat a hero sits: his hips come down over (`x`, `z`), his feet stay where he stood to sit (`fx`, `fz`),
 *  he faces `yaw` (away from it), his hips' pivot `hip` over the floor and his feet `foot` ahead of it (m). */
export interface SeatSpot { seat: Seat; x: number; z: number; fx: number; fz: number; yaw: number; hip: number; foot: number }

/** A seat's circles a hero is let nearer than his radius (`resolveProps`): walking up to sit and leaving it after. */
export interface Relaxed { circles: readonly Obstacle[]; r: number }

export const SEAT = {
  /** the tops a body sits on (m): lower is a step, higher a ledge */
  low: 0.45, high: 0.95,
  /** the hips' pivot over the seat's top (m): the thighs' and the seat of the clothes' depth under it */
  hipOver: 0.11,
  /** how near the seat's circles a hero comes to sit (m, his body's own depth): at his radius he stood a metre off */
  near: 0.25,
  /** sat on the floor by a fire: the hips' pivot over the floor, and the feet ahead of it, the knees up (m) */
  ground: { hip: 0.13, foot: 0.62 },
  /** where a sat body is, out from the seat's line (m): on a seat, his legs past where he sits; on the floor, his
   *  feet before where they stand and his back behind his hips */
  body: { legs: 0.6, feet: 0.15, back: 0.35 },
};

const _ray = new THREE.Raycaster(), _from = new THREE.Vector3(), _down = new THREE.Vector3(0, -1, 0);
const _hits: THREE.Intersection[] = [];

/** A log's or a column's seat: along its middle `half` either way of (`x`, `z`) on its axis turned `yaw`. */
export function lengthSeat(x: number, z: number, yaw: number, half: number, sit: number, circles: Obstacle[],
  meshes: THREE.Object3D[]): Seat {
  const ux = Math.cos(yaw) * half, uz = -Math.sin(yaw) * half;
  return { ax: x - ux, az: z - uz, bx: x + ux, bz: z + uz, sit, circles, meshes };
}

/** A stone's seat: its rim `sit` from its middle. */
export function stoneSeat(o: Obstacle, sit: number, meshes: THREE.Object3D[]): Seat {
  return { ax: o.x, az: o.z, bx: o.x, bz: o.z, sit, circles: [o], meshes };
}

/** A fire's seat: the floor round it, his feet as near it as a seat's circles let him (from the owner: "it should be
 *  also possible to sit near fire after idle... just on the ground"). */
export function fireSeat(o: Obstacle): Seat {
  const sit = o.r + SEAT.near + 0.02 + SEAT.ground.foot;
  return { ax: o.x, az: o.z, bx: o.x, bz: o.z, sit, circles: [o], meshes: [], ground: true };
}

/** Whether the seat's prop still stands. */
export function seatStands(s: Seat): boolean {
  return !s.circles.some((o) => o.prop?.broken);
}

/** The spot on `seat` nearest (`px`, `pz`) on his side of it, or none: its top out of a seat's heights there, or the
 *  floor he'd stand on to sit taken by another prop or the wall (`radius` his). */
export function seatSpot(seat: Seat, px: number, pz: number, radius: number): SeatSpot | null {
  if (!seatStands(seat)) return null;
  const { cx, cz, nx, nz } = nearestOn(seat, px, pz);
  const x = cx + nx * seat.sit, z = cz + nz * seat.sit;
  if (seat.ground) {
    // (by a fire, his feet towards it, where he sits down behind them clear too)
    const fx = x - nx * SEAT.ground.foot, fz = z - nz * SEAT.ground.foot;
    if (!floorFree(seat, fx, fz, radius) || !floorFree(seat, x, z, radius)) return null;
    return { seat, x, z, fx, fz, yaw: Math.atan2(-nx, -nz), hip: SEAT.ground.hip, foot: SEAT.ground.foot };
  }
  const top = seatTopAt(seat, x, z);
  if (top < SEAT.low || top > SEAT.high) return null;
  const out = Math.max(...seat.circles.map((o) => o.r)) + SEAT.near + 0.02;
  const fx = cx + nx * out, fz = cz + nz * out;
  if (!floorFree(seat, fx, fz, radius)) return null;
  return { seat, x, z, fx, fz, yaw: Math.atan2(nx, nz), hip: top + SEAT.hipOver, foot: out - seat.sit };
}

/** The point on the seat's line nearest (`px`, `pz`), and the way out from it to his side (across a log's line, not
 *  along it: off its end he still sits on its side). */
function nearestOn(s: Seat, px: number, pz: number): { cx: number; cz: number; nx: number; nz: number } {
  const lx = s.bx - s.ax, lz = s.bz - s.az, len2 = lx * lx + lz * lz;
  const u = len2 > 1e-6 ? Math.max(0, Math.min(1, ((px - s.ax) * lx + (pz - s.az) * lz) / len2)) : 0;
  const cx = s.ax + lx * u, cz = s.az + lz * u;
  let nx = px - cx, nz = pz - cz;
  if (len2 > 1e-6) {
    const len = Math.sqrt(len2), side = Math.sign(nx * -lz / len + nz * lx / len) || 1;
    nx = -lz / len * side;
    nz = lx / len * side;
  } else {
    const d = Math.hypot(nx, nz) || 1;
    nx /= d;
    nz /= d;
  }
  return { cx, cz, nx, nz };
}

/** Whether (`x`, `z`) is within `reach` (m) of where a body sat on one of `seats` is: a biome keeps its plants off it
 *  (from the owner: "lots clipping near fire", the grass and ferns grown through him sat by a bonfire). */
export function whereSat(seats: readonly Seat[], x: number, z: number, reach: number): boolean {
  return seats.some((s) => {
    const { cx, cz } = nearestOn(s, x, z), d = Math.hypot(x - cx, z - cz);
    const from = s.ground ? s.sit - SEAT.ground.foot - SEAT.body.feet : 0;
    const to = s.sit + (s.ground ? SEAT.body.back : SEAT.body.legs);
    return d > from - reach && d < to + reach;
  });
}

/** The seat's top over (`x`, `z`) as drawn (m), or -Infinity where none of it is (a fire's, the floor). */
export function seatTopAt(s: Seat, x: number, z: number): number {
  if (s.ground) return groundHeight(x, z);
  _ray.set(_from.set(x, 3, z), _down);
  _ray.far = 3;
  let top = -Infinity;
  for (const m of s.meshes) {
    m.updateWorldMatrix(true, false);
    _hits.length = 0;
    m.raycast(_ray, _hits);
    for (const h of _hits) top = Math.max(top, h.point.y);
  }
  return top;
}

/** Whether a hero of `radius` stands clear at (`x`, `z`) of every prop but the seat, and of the wall. */
function floorFree(s: Seat, x: number, z: number, radius: number): boolean {
  if (G.arena.wall.roomOut(x, z, radius) <= 0) return false;
  return G.arena.obstacles.every((o) => s.circles.includes(o) || o.prop?.broken || Math.hypot(x - o.x, z - o.z) >= o.r + radius);
}
