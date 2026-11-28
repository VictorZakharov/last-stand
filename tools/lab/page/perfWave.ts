// `lab perf --wave N`: a high wave as the run sends it, its own mix of foes risen at the gates and come at the hero,
// before the casts are timed (from play, a party at wave 36 of the Crypt at 12 frames a second on a laptop's
// integrated GPU: 49 foes, 2,668 draws, the CPU 25 ms a frame and the GPU 28.6). The set-up's single foes of the
// biome's commonest kind (`foesAhead`) never met what a high wave brings: its slammers' lava, its casters' orbs, its
// heroes, as many standing as the wave lets stand.
import type { Lab } from './lab';
import { G } from '../../../src/state';
import { startNextWave } from '../../../src/game/run';
import { WAVES } from '../../../src/data/waves';
import { partyScale } from '../../../src/data/balance';

/** the most frames of the game's time given for the wave to fill the arena (60 s), and the share of the most a
 *  wave lets stand that counts as full */
const FILL_FRAMES = 3600;
const FULL_SHARE = 0.9;
/** the frames given for the countdown to give way to the fight */
const START_FRAMES = 120;

/** The wave let come: what stood when the arena was full, and how long it took. */
export interface WaveCome {
  wave: number;
  standing: number;
  most: number;
  kinds: string;
  frames: number;
}

/** The foes standing, by kind, the most first ("12 skeleton, 8 brute"). */
function kindsStanding(): string {
  const counts = new Map<string, number>();
  for (const foe of G.enemies) {
    if (foe.alive) counts.set(foe.type, (counts.get(foe.type) ?? 0) + 1);
  }
  const sorted = [...counts].sort((a, b) => b[1] - a[1]);
  return sorted.map(([kind, count]) => `${count} ${kind}`).join(', ');
}

/** How many foes stand. */
function standing(): number {
  return G.enemies.filter((foe) => foe.alive).length;
}

/** Wave `wave` set off from its countdown as the game begins one, and let come until as many foes stand as it lets
 *  stand (`FULL_SHARE` of `WAVES.maxAlive`), the hero kept whole. Throws if it never starts or never fills. */
export async function waveCome(lab: Lab, wave: number): Promise<WaveCome> {
  const run = G.run;
  if (!run) throw new Error('lab: perf --wave: no run to set the wave off in');
  lab.letWavesCome();
  run.wave = wave;
  startNextWave();
  run.phase = 'countdown';
  run.timer = 0;
  await lab.until(() => run.phase === 'fighting', START_FRAMES, `wave ${wave} never started`);
  const most = WAVES.maxAlive(wave, partyScale(run.party).alive);
  const full = Math.floor(most * FULL_SHARE);
  let frames = 0;
  await lab.until(() => {
    frames++;
    return standing() >= full;
  }, FILL_FRAMES, `wave ${wave} never filled the arena: ${standing()} of ${full} foes standing`);
  return { wave, standing: standing(), most, kinds: kindsStanding(), frames };
}

/** A line for the report: the wave and what stood. */
export function waveLine(come: WaveCome): string {
  const seconds = (come.frames / 60).toFixed(1);
  return `wave ${come.wave}: ${come.standing} foes standing of the ${come.most} it lets stand, after ${seconds} s `
    + `(${come.kinds})`;
}
