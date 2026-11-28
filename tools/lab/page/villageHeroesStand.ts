// `lab village`'s heroes stood on the dais without a held frame: the hall's heroes let go, as a game has them before
// they're built behind the lobby, and the hero stood inside the hall at once, where they're wanted. From play, "FPS is
// not stable, even on high end hardware": a hero wanted before his build was done was finished in that frame, 47 ms of
// the village's stage on a 4070 Ti (trace 0BAM-GTXN), 100 to 200 ms on a phone (PFQA-FY0M). Now he's built next, a
// piece a frame, his plinth empty meanwhile. Each frame's update is timed by the browser's own clock, against a hero
// built whole on the same machine in the same run (a lent PC builds one 2.5 times slower than the owner's). `canary`
// builds a hero whole in one of the frames, as it was.
import { Vec3 } from './sceneApi.ts';
import type { Lab } from './lab';
import { G } from '../../../src/state';
import { Player } from '../../../src/entities/player';
import * as hall from '../../../src/game/hall';
import { behindFrame } from '../../../src/game/behind';
import { CLASS_IDS } from '../../../src/data/classes/index';
import { HALL, TERRACE } from '../../../src/data/village';
import { groundHeight } from '../../../src/world/ground';
import type { LightsChecked } from './villageLights';

/** the frames given for the place to settle, and the most the heroes may take to stand */
const SETTLE = 30;
const STOOD_WITHIN = 900;
/** the longest a frame's update may take while they're built, as a share of a hero built whole (100 to 250 ms on the
 *  owner's PC: finished at once, a frame was one or more) */
const MOST_OF_WHOLE = 0.5;
/** how far inside the hall's door he's stood (m) */
const INSIDE = 4;
/** the frame the canary builds a hero whole in */
const CANARY_FRAME = 3;

/** The browser's own clock (the page's `performance.now` is the lab's). */
function realNow(): number {
  const clock = (window as unknown as { __labClock: { realNow: () => number } }).__labClock;
  return clock.realNow();
}

/** The hero stood at (x, z). */
function standAt(x: number, z: number): void {
  G.player.walkTo = null;
  G.player.place(new Vec3(x, groundHeight(x, z), z), Math.PI);
}

/** A hero of another class built whole now and let go (the canary's held frame, and what a frame is held to):
 *  how long it took (ms). */
function buildOneWhole(): number {
  const id = CLASS_IDS.find((other) => other !== G.player.cls.id)!;
  const started = realNow();
  new Player(id, {}, false).dispose();
  return realNow() - started;
}

/** The hall's heroes let go and wanted at once: they stand within `STOOD_WITHIN` frames, no frame held as long as
 *  `MOST_OF_WHOLE` of a hero built whole. */
export async function heroesStandInPieces(lab: Lab, canary: boolean): Promise<LightsChecked> {
  if (G.paused) await lab.step(1, () => ({ keys: ['escape'] }));
  await lab.step(SETTLE);
  // (stood down and let go, each queued again behind the lobby at its next frame)
  hall.dropHeroesBuilt();
  const wanted = CLASS_IDS.length - 1;
  const built = Player.built;
  standAt(TERRACE.x, HALL.door - INSIDE);
  let longest = 0;
  let slowest = '';
  let frames = 0;
  while (hall.heroesStanding().length < wanted && frames < STOOD_WITHIN) {
    const started = realNow();
    if (canary && frames === CANARY_FRAME) buildOneWhole();
    await lab.step(1);
    const took = realNow() - started;
    if (took > longest) {
      longest = took;
      slowest = behindFrame.slowest;
    }
    frames++;
  }
  const stood = hall.heroesStanding().length;
  const extra = canary ? 1 : 0;
  // (two, the quicker: the first builds what the heroes share)
  const whole = Math.min(buildOneWhole(), buildOneWhole());
  const line = `the hall's heroes let go and wanted at once: ${stood} of ${wanted} stood within ${STOOD_WITHIN} frames, `
    + `${Player.built - built - extra - 2} heroes built for it, no frame's update over ${MOST_OF_WHOLE} of a hero `
    + 'built whole';
  const held = longest > whole * MOST_OF_WHOLE;
  if (canary) return { lines: [line], problems: [], caught: held, moments: [] };
  const problems: string[] = [];
  if (stood < wanted) problems.push(`${line}: they never stood`);
  if (Player.built - built - 2 <= 0) problems.push(`${line}: none was built (the measure's own: they weren't let go)`);
  if (held) {
    problems.push(`${line}: a frame took ${longest.toFixed(0)} ms (${slowest || 'no piece built behind'}), `
      + `a hero whole ${whole.toFixed(0)}`);
  }
  return { lines: [line], problems, caught: null, moments: [] };
}
