// Height of the walkable arena floor (dais tiers). Kept free of scene code so the
// cape physics worker can import it.
import { ARENA } from '../data/balance';

const STEP = 0.18;

/** the floor's heights, highest first */
export const GROUND_LEVELS = [ARENA.daisHeight, STEP, 0];

export function groundHeight(x: number, z: number): number {
  const m = Math.max(Math.abs(x), Math.abs(z));
  if (m < ARENA.daisHalf) return ARENA.daisHeight;
  if (m < ARENA.daisHalf + 0.7) return STEP;
  return 0;
}
