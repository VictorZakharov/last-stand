// Height of the walkable arena floor (dais tiers), free of scene code.
import { ARENA } from '../data/balance';

const STEP = 0.18;

/** the floor's heights, highest first */
export const GROUND_LEVELS = [ARENA.daisHeight, STEP, 0];
/** the half sides of the squares the floor's levels lie in (the dais's top, then its step), each the edge between its
 *  level and the next: every level is the same height out to its edge, and drops straight down at it */
export const GROUND_EDGES = [ARENA.daisHalf, ARENA.daisHalf + 0.7];

export function groundHeight(x: number, z: number): number {
  return levelAt(Math.max(Math.abs(x), Math.abs(z)));
}

/** The highest floor any part of a ball `r` across its middle over (x, z) is over: what it rests on, overhanging a
 *  step's edge (the levels' squares are nearer the middle the higher they are). */
export function groundUnder(x: number, z: number, r: number): number {
  return levelAt(Math.max(Math.abs(x), Math.abs(z)) - r);
}

/** the floor's level at `m` out from the middle along the squares' axes */
function levelAt(m: number): number {
  if (m < GROUND_EDGES[0]) return GROUND_LEVELS[0];
  if (m < GROUND_EDGES[1]) return GROUND_LEVELS[1];
  return GROUND_LEVELS[2];
}
