// Height of the walkable arena floor (dais tiers). Kept free of scene code so the
// cape physics worker can import it.
import { ARENA } from '../data/balance';

export function groundHeight(x: number, z: number): number {
  const m = Math.max(Math.abs(x), Math.abs(z));
  if (m < ARENA.daisHalf) return ARENA.daisHeight;
  if (m < ARENA.daisHalf + 0.7) return 0.18;
  return 0;
}
