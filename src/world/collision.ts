// Circle-vs-world collision: static obstacles and the arena's wall as it's drawn (`world/wall.ts`).
import * as THREE from 'three';
import { G } from '../state';
import { groundHeight } from './ground';
import { placeBefore, stackBefore } from '../entities/carry';
import type { Enemy } from '../entities/enemy';

export function resolveWorld(pos: { x: number; z: number }, radius: number): void {
  resolveProps(pos, radius);
  G.arena.wall.keepIn(pos, radius);
}

/** A body of `radius` at `pos` pushed off the static obstacles (not the wall). */
export function resolveProps(pos: { x: number; z: number }, radius: number): void {
  for (const o of G.arena.obstacles) {
    const dx = pos.x - o.x, dz = pos.z - o.z;
    const min = o.r + radius;
    const d2 = dx * dx + dz * dz;
    if (d2 < min * min && d2 > 1e-6) {
      const d = Math.sqrt(d2);
      pos.x = o.x + (dx / d) * min;
      pos.z = o.z + (dz / d) * min;
    }
  }
}

/** How high the top of what a prop draws is over (x, z), as a ray straight down from over it meets it (a breakable
 *  prop: the crypt's and the forest's four pillars, the columns, the stones), or its circle's height where it draws
 *  nothing that can be met (`Obstacle.h`); none (-Infinity) where no standing prop is. A blow brought down onto a
 *  prop stops on it as it does on a foe (from play: "if warrior hits a prop, weapon should not disappear inside of
 *  it, it should collide like enemy", "props collision should keep into the account the shape of prop, including 4
 *  pillars in the center area"). */
export function propTopAt(x: number, z: number): number {
  let top = -Infinity;
  // (the hall of heroes' stage stands where the biome's dais is, with none of its props)
  if (!G.arena || G.arena.hallShown) return top;
  for (const o of G.arena.obstacles) {
    if (o.prop?.broken) continue;
    const dx = x - o.x, dz = z - o.z;
    if (dx * dx + dz * dz >= o.r * o.r) continue;
    const floor = groundHeight(o.x, o.z);
    if (!o.prop) {
      top = Math.max(top, floor + o.h);
      continue;
    }
    _down.set(x, floor + o.h + PROP_OVER, z);
    _ray.set(_down, DOWN);
    _ray.far = o.h + PROP_OVER * 2;
    _hits.length = 0;
    o.prop.raycast(_ray, _hits);
    for (const hit of _hits) top = Math.max(top, hit.point.y);
  }
  return top;
}
const DOWN = new THREE.Vector3(0, -1, 0);
/** how far over a prop's height its ray starts (m): a prop's mesh stands a little over its circle's height */
const PROP_OVER = 1;
const _ray = new THREE.Raycaster();
const _down = new THREE.Vector3();
const _hits: THREE.Intersection[] = [];

/** Does a body of `radius` at `pos` overlap a static obstacle? */
export function inObstacle(pos: { x: number; z: number }, radius: number): boolean {
  return G.arena.obstacles.some((o) => Math.hypot(pos.x - o.x, pos.z - o.z) < o.r + radius);
}

/** A co-op guest's copy its own game places (its own hero's charge swept it up), not the host's reports. */
const placedHere = (e: Enemy): boolean => e.carried !== null || e.ownFor >= 0;

/** Push overlapping enemies apart (and away from the players): on a co-op guest, which simulates no foe (`ownOnly`),
 *  only the copies its own hero's charge carries, as the host pushes the foes they are, off every other copy as off
 *  a wall (left on top of each other, they were thrown on fanned out as they rode, and one came down 2.5 m across
 *  from where the host threw it; kept off each other alone, one ran into a copy not yet met and was shoved out of
 *  it 73 cm in a frame as it was met). */
export function separateEnemies(ownOnly = false): void {
  const list = G.enemies;
  if (ownOnly && !list.some(placedHere)) return;
  const moves = (e: Enemy): boolean => !ownOnly || placedHere(e);
  // (the foes each charge carries stacked before its hero first, as they ride)
  if (list.some((e) => e.carried)) {
    for (const p of G.players) stackBefore(p, list.filter((e) => e.carried?.by === p && moves(e)));
  }
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    // (a foe thrown through the air flies over the others and the players)
    if (!a.alive || a.spawning || a.tossed) continue;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      if (!b.alive || b.spawning || b.tossed || (!moves(a) && !moves(b))) continue;
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
      const min = a.radius + b.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 1e-6) {
        const d = Math.sqrt(d2), push = (min - d) * 0.5;
        const shared = b.mass / (a.mass + b.mass);
        const wa = !moves(b) ? 1 : !moves(a) ? 0 : shared, wb = 1 - wa;
        a.pos.x -= (dx / d) * push * wa * 2; a.pos.z -= (dz / d) * push * wa * 2;
        b.pos.x += (dx / d) * push * wb * 2; b.pos.z += (dz / d) * push * wb * 2;
      }
    }
    if (!moves(a)) continue;
    for (const p of G.players) {
      if (!p.active) continue;
      const dx = a.pos.x - p.pos.x, dz = a.pos.z - p.pos.z;
      const min = a.radius + p.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        if (a.carried) {
          // (carried before a charge: kept clear before its hero, where the foes it rides with pushed it)
          placeBefore(a.pos, a.radius, a.carried);
        } else if (a.def.dummy) {
          // training dummies are planted: the player slides around them (a partner is moved by its own game)
          if (!p.local) continue;
          p.pos.x = a.pos.x - (dx / d) * min;
          p.pos.z = a.pos.z - (dz / d) * min;

        } else {
          // enemies yield the overlap so the player isn't shoved around
          a.pos.x = p.pos.x + (dx / d) * min;
          a.pos.z = p.pos.z + (dz / d) * min;
        }
      }
    }
  }
}
