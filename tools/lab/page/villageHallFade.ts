// `lab village`'s hall's front wall as the hero steps in, the camera out through its door behind him (from play, "why
// here geometry disappears (walls and doors)? it should fade to semi transparent"): the wall's share of the frame, by
// the frame drawn with it hidden, must go down over a moment rather than at a stroke, and a ghost of it must stay.
// `canary` hides it at once, as it was.
import * as THREE from 'three';
import type { Lab } from './lab';
import { G } from '../../../src/state';
import { holdHour } from '../../../src/game/clock';
import { faceCamera, viewMode } from '../../../src/core/renderer';
import { HALL, TERRACE } from '../../../src/data/village';
import { groundHeight } from '../../../src/world/ground';
import { drawFrame } from './light';
import { changedShare, viewBy } from './villageHallCull';
import type { LightsChecked } from './villageLights';

/** where he stands, in from the door (m), and on the portico before it (m), and the frames given to settle */
const IN_FROM = 1.8;
const OUTSIDE = 1.5;
const SETTLE = 60;
/** the frames read as he's stepped in; the hour it's read at */
const FRAMES = 30;
const HOUR = 12;
/** the most of the wall's share one frame may take, and the least (and most) of it to stay as a ghost */
const MOST_A_FRAME = 0.3;
const GHOST_LEAST = 0.08;
const GHOST_MOST = 0.75;

/** How much of the frame the front wall changes now: the frame as it is against with the wall hidden. */
function wallsShare(lab: Lab, front: THREE.Object3D): number {
  const drawn = drawFrame(lab);
  front.visible = false;
  const without = drawFrame(lab);
  front.visible = true;
  return changedShare(drawn, without);
}

/** The hero put at (x, z), turned into the hall (`facing` π is along -z, in through the door). */
function standAt(z: number): void {
  const x = TERRACE.x;
  G.player.walkTo = null;
  G.player.place(new THREE.Vector3(x, groundHeight(x, z), z), Math.PI);
  faceCamera(Math.PI);
}

/** The wall thins over a moment as he steps in, and stays a ghost. */
export async function hallFrontFades(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const view = viewMode();
  const front = G.arena.village?.hallCutaway[1];
  if (!front) throw new Error('lab: village: no front wall to read');
  await viewBy(lab, 'third');
  holdHour(HOUR);
  try {
    standAt(HALL.door + OUTSIDE);
    await lab.step(SETTLE);
    const whole = wallsShare(lab, front);
    standAt(HALL.door - IN_FROM);
    if (canary) front.visible = false;
    const shares: number[] = [];
    for (let frame = 0; frame < FRAMES; frame++) {
      await lab.step(1);
      if (canary) {
        shares.push(0);
        continue;
      }
      shares.push(wallsShare(lab, front));
    }
    if (G.camera.position.z < HALL.inFront) throw new Error('lab: village: the camera never stood out of the door');
    front.visible = true;
    const steps = shares.map((share, frame) => (frame ? shares[frame - 1] : shares[0]) - share);
    const sharpest = Math.max(...steps) / Math.max(shares[0], 1e-6);
    const left = shares[FRAMES - 1] / Math.max(shares[0], 1e-6);
    const gone = !(left >= GHOST_LEAST && left <= GHOST_MOST);
    const line = `the hall's front wall as he steps in: on the portico ${(whole * 100).toFixed(1)}% of the frame, then `
      + `${(shares[0] * 100).toFixed(1)}%, ${(left * 100).toFixed(0)}% of that left after ${FRAMES} frames, `
      + `at most ${(sharpest * 100).toFixed(0)}% of it in a frame`;
    if (canary) return { lines: [line], problems: [], caught: gone, moments: [] };
    const problems = gone || sharpest > MOST_A_FRAME ? [line] : [];
    const shot = await lab.screen('stepped in, the wall a ghost', [`${(left * 100).toFixed(0)}% of the wall left`]);
    return { lines: [line], problems, caught: null, moments: [shot] };
  } finally {
    front.visible = true;
    holdHour(null);
    await viewBy(lab, view);
  }
}
