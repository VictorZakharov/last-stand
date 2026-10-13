// A wave at the game's own pace (tools/lab `spawns`): set off from a seed of its own, each foe taken out as it comes
// within its reach of the hero, as a player who kills every foe as it reaches him would, and when each group came,
// how many foes it had and when the wave was over. A group comes `groupInterval` after the last, or at once when none
// of the wave stands, so how fast the player kills is what hurries them. The boss's summons rise as a group of their
// own, as a player meets them. (The same seed needn't give the same foes on main: the waves before leave the game's
// clock elsewhere, and what draws random numbers before the wave does so as many times as that has it.)
import type { Fixture, Lab } from './lab';
import type { Enemy } from '../../../src/entities/enemy';
import { G } from '../../../src/state';
import { removeFoes, setOffWave, withinReach, type WaveAsk } from './spawnWaves';

/** the waves played at the game's pace: the first, a boss wave and a later one */
export const PACED_WAVES = [1, 5, 10];
/** the first paced wave's seed, each one's the next */
const PACE_SEED = 0x68e31da4;
/** the frames a paced wave has to be over */
const PACE_FRAMES = 4800;

/** A group of a paced wave: when it came (s after the wave's first), how many foes it had, and the boss among them. */
interface PacedGroup {
  came: number;
  foes: number;
  boss: boolean;
}

/** A paced wave: its number, its groups, and when its last foe was taken out (s after its first group came). */
export interface Paced {
  number: number;
  groups: PacedGroup[];
  over: number | null;
}

/** The `index`th paced wave, of the run's wave `number`. */
function pacedAsk(number: number, index: number): WaveAsk {
  return { index, seed: PACE_SEED + index, number };
}

/** A foe counted in its group: a new group begun if it is the first since the last group had all come. */
function countIn(groups: PacedGroup[], foe: Enemy, startsGroup: boolean, since: number): void {
  if (startsGroup) groups.push({ came: since, foes: 0, boss: false });
  const group = groups[groups.length - 1];
  group.foes++;
  group.boss = group.boss || foe.boss;
}

/** The foes standing within their reach of the hero, up out of the floor: a player kills them as they come. */
function reachedFoes(lab: Lab): Enemy[] {
  return G.enemies.filter((foe) => foe.spawning === 0 && withinReach(lab, foe));
}

/** The run's wave `number` played at its own pace, each foe taken out as it comes within its reach of the hero. */
export async function paceWave(lab: Lab, fixture: Fixture, number: number, index: number): Promise<Paced> {
  await setOffWave(lab, fixture, pacedAsk(number, index));
  const run = G.run!;
  const seen = new Set<Enemy>();
  const groups: PacedGroup[] = [];
  let rising = 0;
  let first = 0;
  for (let frame = 0; frame < PACE_FRAMES; frame++) {
    await lab.step(1);
    for (const foe of G.enemies.filter((enemy) => !seen.has(enemy))) {
      if (seen.size === 0) first = G.time;
      seen.add(foe);
      countIn(groups, foe, rising === 0, G.time - first);
      rising++;
    }
    if (run.pending === 0) rising = 0;
    removeFoes(reachedFoes(lab));
    if (seen.size > 0 && run.phase !== 'fighting') return { number, groups, over: G.time - first };
  }
  return { number, groups, over: null };
}

/** A paced group as a line's part: its foes (or the boss) and when it came. */
function groupPart(group: PacedGroup): string {
  const foes = group.boss ? (group.foes > 1 ? `${group.foes} with the boss` : 'the boss') : `${group.foes}`;
  return `${foes} at ${group.came.toFixed(1)}`;
}

/** A paced wave as a line of the report. */
export function pacedLine(paced: Paced): string {
  const over = paced.over === null ? 'never over' : `over at ${paced.over.toFixed(1)} s`;
  return `wave ${paced.number}: ${paced.groups.map(groupPart).join(', ')} s; ${over}`;
}
