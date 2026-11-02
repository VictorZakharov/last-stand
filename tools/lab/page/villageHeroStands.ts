// `lab village`'s heroes standing on the hall's dais after another hero was chosen (from play, "after picking warrior
// then ranger, warrior is dancing on one leg like irish dancer"): the hall of heroes opened, another hero chosen, him
// walked into the village's hall, and each hero standing there read over some seconds: both ankles on his plinth,
// within a step's height. `canary` lifts a standing hero's foot, which must be found.
import * as THREE from 'three';
import type { Lab } from './lab';
import type { Player } from '../../../src/entities/player';
import { G } from '../../../src/state';
import { hallFocus, hallHeroes, heroesStanding, hallOpen } from '../../../src/game/hall';
import { HALL, TERRACE } from '../../../src/data/village';
import { groundHeight } from '../../../src/world/ground';
import { faceCamera } from '../../../src/core/renderer';
import { CLASS_IDS } from '../../../src/data/classes/index';
import { isWarm } from '../../../src/game/warm';
import { openHall, toLobby } from './hallMoves';
import { viewBy } from './villageHallCull';
import type { LightsChecked } from './villageLights';

/** the frames given to the hall as it opens and after each key, the rounds read and the frames between them */
const SETTLE = 120;
/** how long the hall stands open before he's chosen, on the warrior as his showcase runs, and for the first choice */
const WAITS = [10, 70, 100, 130, 200];
/** who's chosen, then chosen away from: each hero left to stand as his showcase runs */
const CHOICES = [['warrior', 'ranger'], ['ranger', 'mage'], ['mage', 'warrior']];
const WAIT_FIRST = 5;
const SETTLE_LOBBY = 30;
const ROUNDS = 12;
/** how far up the stair he stands to look at the door (m), how far out past its foot to look away (the camera behind
 *  him higher up stands in the doorway), and the most frames for the heroes to warm */
const STAIR_UP = 2;
const SQUARE_OUT = 4;
const WARM_FRAMES = 6000;
const FRAMES_A_ROUND = 30;
/** how far before the dais he stands (m), an ankle's height over the plinth at rest (m), and the most it may rise
 *  past it */
const BEFORE_DAIS = 3;
const ANKLE_REST = 0.12;
const MOST_RISE = 0.1;
/** how far the canary lifts a foot (m) */
const CANARY_LIFT = 0.3;

const _ankle = new THREE.Vector3();

/** The highest either ankle stands over the plinth under him, past its height at rest (m). */
function riseOfAnkles(hero: Player): number {
  const joints = hero.model.joints;
  if (!joints) throw new Error('lab: village: a standing hero has no joints');
  const floor = groundHeight(hero.pos.x, hero.pos.z);
  const left = joints.ankleL.getWorldPosition(_ankle).y;
  const right = joints.ankleR.getWorldPosition(_ankle).y;
  return Math.max(left, right) - floor - ANKLE_REST;
}

/** The heroes stand on the dais as he comes up the stair with the door in view, and not with it behind him (from play,
 *  "on approach heroes are not there, they should be"). `canary` reads the look away as the look at the door. */
export async function heroesSeenOnApproach(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const x = TERRACE.x;
  await viewBy(lab, 'third');
  const looking = async (z: number, facing: number): Promise<number> => {
    G.player.walkTo = null;
    G.player.place(new THREE.Vector3(x, groundHeight(x, z), z), facing);
    faceCamera(facing);
    await lab.until(() => isWarm('heroes'), WARM_FRAMES, 'village: the heroes warming as he nears them');
    await lab.step(SETTLE);
    return heroesStanding().length;
  };
  const away = await looking(TERRACE.stairFoot + SQUARE_OUT, 0);
  const atDoor = canary ? away : await looking(TERRACE.stairFoot - STAIR_UP, Math.PI);
  await viewBy(lab, 'top');
  const line = `${atDoor} heroes stand on the dais looking at the door from the stair, ${away} looking away from it`;
  const wrong = atDoor < CLASS_IDS.length - 1 || away > 0;
  if (canary) return { lines: [line], problems: [], caught: wrong, moments: [] };
  return { lines: [line], problems: wrong ? [line] : [], caught: null, moments: [] };
}

/** The hero of class `id` chosen in the hall, `waiting` frames after it opened on the one he is. */
async function choose(lab: Lab, id: string, waiting: number): Promise<void> {
  await openHall(lab);
  await lab.step(waiting);
  for (let press = 0; hallHeroes()[hallFocus()].id !== id; press++) {
    if (press > hallHeroes().length) throw new Error(`lab: village: no ${id} in the hall`);
    await lab.step(1, () => ({ keys: ['arrowright'] }));
    await lab.step(2);
  }
  await lab.step(3, (frame) => ({ keys: frame === 0 ? ['enter'] : [] }));
  if (hallOpen()) throw new Error('lab: village: Enter never chose a hero');
  await lab.step(SETTLE_LOBBY);
}

/** Each hero standing on the dais read every frame for some seconds, him stood before it, into `worst` by class. */
async function readDais(lab: Lab, worst: Map<string, number>, canary: boolean): Promise<void> {
  const x = TERRACE.x;
  const z = HALL.daisZ + BEFORE_DAIS;
  G.player.place(new THREE.Vector3(x, groundHeight(x, z), z), Math.PI);
  await lab.step(SETTLE_LOBBY);
  if (!heroesStanding().length) throw new Error('lab: village: no hero came to stand on the dais');
  await lab.step(ROUNDS * FRAMES_A_ROUND, undefined, () => {
    for (const hero of heroesStanding()) {
      const rise = riseOfAnkles(hero) + (canary ? CANARY_LIFT : 0);
      worst.set(hero.cls.id, Math.max(worst.get(hero.cls.id) ?? -Infinity, rise));
    }
  });
  // (back out of the hall: he's sent away to open it from anywhere)
  G.player.place(new THREE.Vector3(0, 0, 0), 0);
  await lab.step(SETTLE_LOBBY);
}

/** The heroes on the dais keep both feet on their plinths after another was chosen, at any moment of a showcase. */
export async function heroesStandOnBothFeet(lab: Lab, canary: boolean): Promise<LightsChecked> {
  await toLobby(lab);
  await lab.step(SETTLE);
  const worst = new Map<string, number>();
  for (const [first, then] of CHOICES) {
    for (const waiting of WAITS) {
      await choose(lab, first, WAIT_FIRST);
      await choose(lab, then, waiting);
      await readDais(lab, worst, canary);
    }
  }
  const line = 'each hero left as his showcase ran, on the dais, an ankle\'s highest past its rest: '
    + [...worst].map(([who, rise]) => `${who} ${(rise * 100).toFixed(0)} cm`).join(', ')
    + ` (at most ${MOST_RISE * 100} cm)`;
  const lifted = [...worst.values()].some((rise) => rise > MOST_RISE);
  if (canary) return { lines: [line], problems: [], caught: lifted, moments: [] };
  return { lines: [line], problems: lifted ? [line] : [], caught: null, moments: [] };
}
