// Circle-vs-world collision: static obstacles and the arena's wall as it's drawn (`world/wall.ts`).
import { G } from '../state';
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
