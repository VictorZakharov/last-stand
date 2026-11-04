// `lab village`'s hall of heroes opened at its dais by E (from play, "choose hero in hall freezes for like 10sec", its
// report's one frame of 7.3 s with 8 programs compiled, numPointLightShadows 2 -> 4): E is heard in the village's own
// update, after the lamps have been placed for the frame, so that frame was drawn with the room's two casting lights
// and the two pooled ones casting at the dais's. The pause menu's Change hero opens it between frames, and never
// showed it.
// `canary` leaves another pooled light casting as it opens, which must be found.
import * as THREE from 'three';
import type { Lab } from './lab';
import { G } from '../../../src/state';
import { hallOpen } from '../../../src/game/hall';
import { closeHeroSelect, heroSelectOpen } from '../../../src/ui/heroSelect';
import { isWarm } from '../../../src/game/warm';
import { objectNear, villageObject } from '../../../src/game/village';
import { pooledLights } from '../../../src/fx/lights';
import { groundHeight } from '../../../src/world/ground';
import type { LightsChecked } from './villageLights';

/** the frames given to the lobby and to the hero at the dais, the most for the heroes to warm as he nears them, and
 *  the frames read from the press */
const SETTLE = 120;
const WARM_FRAMES = 6000;
const READ_FRAMES = 60;
/** the point lights casting that every lit program is made for (`src/world/AGENTS.md`), and the pool's spare the canary
 *  leaves casting */
const CASTING = 2;
const CANARY_LIGHT = 7;

/** The point lights in the scene that three counts as casting: on, and shown all the way up. */
function castingNow(): number {
  let casting = 0;
  G.scene.traverseVisible((object) => {
    const light = object as THREE.PointLight;
    if (light.isPointLight && light.castShadow) casting++;
  });
  return casting;
}

/** E at the dais compiles no program, and no frame is drawn with more lights casting than the programs are made for. */
export async function daisOpensCompileNothing(lab: Lab, canary: boolean): Promise<LightsChecked> {
  await lab.step(SETTLE);
  const stand = villageObject('hall')?.stand;
  if (!stand) throw new Error('lab: village: no hall of heroes to stand at');
  G.player.walkTo = null;
  G.player.place(new THREE.Vector3(stand[0], groundHeight(stand[0], stand[1]), stand[1]), Math.PI);
  await lab.until(() => isWarm('heroes'), WARM_FRAMES, 'village: the heroes warming as he nears them');
  await lab.step(SETTLE);
  const spare = pooledLights()[CANARY_LIGHT];
  if (canary) spare.castShadow = true;
  const before = G.renderer.info.programs?.length ?? 0;
  let most = 0;
  lab.drawing = true;
  try {
    await lab.step(READ_FRAMES, (frame) => ({ keys: frame === 0 ? ['e'] : [] }), () => {
      most = Math.max(most, castingNow());
    });
  } finally {
    lab.drawing = false;
    spare.castShadow = false;
  }
  if (!hallOpen()) {
    const nearNow = objectNear()?.id ?? 'nothing';
    throw new Error(`lab: village: E at the dais never opened the hall (near ${nearNow}, mode ${G.mode})`);
  }
  const compiled = (G.renderer.info.programs?.length ?? 0) - before;
  // (left open, the screen's menu held V from every check after this one)
  if (heroSelectOpen()) closeHeroSelect();
  await lab.until(() => !hallOpen() && !G.menuOpen, 600, 'the hall never closed after the dais opened it');
  const line = `the hall opened by E at its dais: ${compiled} programs compiled, at most ${most} point lights casting `
    + `(its programs are made for ${CASTING})`;
  const wrong = compiled > 0 || most > CASTING;
  if (canary) return { lines: [line], problems: [], caught: wrong, moments: [] };
  return { lines: [line], problems: wrong ? [line] : [], caught: null, moments: [] };
}
