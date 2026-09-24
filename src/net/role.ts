// Who runs what in co-op. The host's game simulates the fight (enemies, damage, loot, waves) and
// the guests show it; everyone moves and casts their own character. Solo is a host with no guests.
import { G } from '../state';
import type { Player } from '../entities/player';

export type Role = 'solo' | 'host' | 'guest';

export const role = { current: 'solo' as Role };

export const isCoop = (): boolean => role.current !== 'solo';
export const isGuest = (): boolean => role.current === 'guest';
export const isHost = (): boolean => role.current === 'host';

/** This game runs the world: always in the lobby (each practises on its own dummies), in a run unless a guest. */
export const simulates = (): boolean => G.mode === 'menu' || role.current !== 'guest';

/** Whether a player's skill deals its damage here: in a run where the fight is simulated, in the
 *  lobby only the local player's (a partner's casts there are just for show). */
export const dealsDamage = (by: Player): boolean => (G.mode === 'run' ? role.current !== 'guest' : by.local);

/** The nearest player an enemy can go for from (x, z), or null. */
export function nearestPlayer(x: number, z: number): Player | null {
  let best: Player | null = null, bd = Infinity;
  for (const p of G.players) {
    if (!p.active) continue;
    const d = (p.pos.x - x) ** 2 + (p.pos.z - z) ** 2;
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}
