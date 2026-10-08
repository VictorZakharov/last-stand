// Each player's run in numbers, for the scoreboard (ui/scoreboard): the local player's counted here as they happen,
// as its own game judges them (its hits on the foes, the foes' on it: net/role), and a partner's as its own game
// reports them (net/session). They start again with each run.
import { G } from '../state';
import { COOP } from '../data/balance';
import type { Player } from '../entities/player';

/** A player's run so far: damage dealt and taken (and what a block or a ward took instead), life healed (not its
 *  regeneration), foes killed, times fallen, partners raised, and when it began (the game's clock, s). */
export interface RunNumbers {
  dealt: number;
  taken: number;
  mitigated: number;
  healed: number;
  kills: number;
  downs: number;
  revives: number;
  since: number;
}

export const freshNumbers = (since = G.time): RunNumbers => ({ dealt: 0, taken: 0, mitigated: 0, healed: 0, kills: 0, downs: 0, revives: 0, since });

/** the local player's run */
export const mine: RunNumbers = freshNumbers(0);

/** A run starts: the numbers from nothing. */
export function resetMine(): void {
  Object.assign(mine, freshNumbers());
}

/** Whether the local player's numbers count now: in a run (the lobby's practice doesn't). */
const counting = (): boolean => G.mode === 'run' && !!G.run;

/** The local player dealt `amount` to a foe, and `killed` it. */
export function countDealt(amount: number, killed: boolean): void {
  if (!counting()) return;
  mine.dealt += amount;
  if (killed) mine.kills++;
}

/** The local player took a hit: `taken` of it to its life, `mitigated` stopped by a block or a ward. */
export function countTaken(taken: number, mitigated: number): void {
  if (!counting()) return;
  mine.taken += taken;
  mine.mitigated += mitigated;
}

export function countHealed(amount: number): void {
  if (counting()) mine.healed += amount;
}

export function countDown(): void {
  if (counting()) mine.downs++;
}

/** Partner `p` was raised: the local player counts it if it was holding the revive key by them. */
export function creditRaise(p: Player): void {
  const me = G.player;
  if (!counting() || p.local || !me.active || !me.reviving) return;
  if (Math.hypot(me.pos.x - p.pos.x, me.pos.z - p.pos.z) < COOP.reviveRange) mine.revives++;
}

/** Damage a second over a run's numbers, up to now. */
export const perSecond = (n: RunNumbers): number => n.dealt / Math.max(1, G.time - n.since);
