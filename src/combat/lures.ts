// Lures: something standing in the arena that draws foes off the players for a while (the ranger's Strawman). Where the
// fight is simulated, an enemy lured by one goes for it instead of its target and strikes at it with its own attack
// (enemyAI's `lured`); the blows show on every game through enemyAI's fx. Elites and bosses are never lured.
import type * as THREE from 'three';
import type { Enemy } from '../entities/enemy';

export interface Lure {
  readonly pos: THREE.Vector3;
  /** its body's radius on the floor (the blows land from just outside it) */
  readonly radius: number;
  /** game time it stops drawing foes */
  readonly until: number;
  /** its own flow field (world/navigation.ts keys them by slot; the players' are their party slots) */
  readonly slot: number;
  /** a blow landed on it (on every game) */
  struck(): void;
}

export const lures: Lure[] = [];

/** first flow-field slot for lures, past any party's */
export const LURE_SLOT = 16;

/** Whether a lure can draw this foe at all. */
export const lurable = (e: Enemy): boolean => e.alive && !e.hero && !e.boss && !e.def.dummy && !e.net;

/** The lure standing at (x, z), if any (a blow shown on a co-op guest finds what it landed on by where it fell). */
export function lureAt(x: number, z: number): Lure | undefined {
  return lures.find((l) => Math.hypot(l.pos.x - x, l.pos.z - z) < l.radius + 0.6);
}
