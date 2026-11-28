// `lab rustcheck`'s check of the fires' flames drawn at a share of the scene's pixels (the engine's `gpu/low.rs`,
// a record's `LOW_RES`): what costs by its pixels, a volume marched at each.
import { Mesh, Node } from './sceneApi.ts';
import type { Lab } from './lab';
import { type Checked, failed, passed } from './rustPixels';
import { inHallLookingOut } from './villageHallCull';
import { G } from '../../../src/state';
import { RUST } from '../../../src/engine';
import type { Bridge } from '../../../src/engine/bridge';

/** a record's mark for the pass at a share of the pixels (`LOW_RES` in engine/draws.ts) and where its flags are */
const LOW_RES = 32;
const FLAGS_AT = 6;

/** The fires' flames shown, how many of them have records and how many a record marked for fewer pixels. */
function flamesSaid(bridge: Bridge): string {
  const flames: Mesh[] = [];
  G.scene.traverse((node) => {
    if (node.userData.fireFlames && shownInWorld(node)) flames.push(node as Mesh);
  });
  const records = flames.map((mesh) => bridge.draws.recordsOf(mesh));
  const recorded = records.filter((record) => record.length > 0).length;
  const marked = records.filter((record) => (record[FLAGS_AT] & LOW_RES) !== 0).length;
  const samples = bridge.levels.now().samples;
  return `${flames.length} flames shown, ${recorded} with records, ${marked} marked for fewer pixels; `
    + `${samples} samples a pixel`;
}

/** Whether `node` and everything over it is shown. */
function shownInWorld(node: Node): boolean {
  for (let at: Node | null = node; at; at = at.parent) if (!at.visible) return false;
  return true;
}

/**
 * In the hall turned to its door, the village's fires in view: drawn by the engine's pass at a quarter of the
 * scene's pixels (what costs by its pixels, a volume marched at each: 7 ms of a phone's frame at full size).
 * The canary: with the switch off they're drawn with the scene.
 */
export async function flamesAtFewerPixels(lab: Lab, bridge: Bridge): Promise<Checked> {
  if (bridge.levels.now().samples >= 4) return passed('at four samples a pixel the flames are drawn with the scene');
  const drawing = lab.drawing;
  lab.drawing = true;
  try {
    // (the village's fires in view through the hall's door: from above in the hall, none is)
    await inHallLookingOut(lab);
    await lab.step(3);
    const low = bridge.stats.lowDraws;
    RUST.tune.lowRes = 0;
    await lab.step(2);
    const whole = bridge.stats.lowDraws;
    if (!low) {
      const why = flamesSaid(bridge);
      return failed(`no flame is drawn at fewer pixels: each marched at every pixel of the scene's it covers (${why})`);
    }
    if (whole) return failed(`with the switch off ${whole} draws are still at fewer pixels`);
    return passed(`${low} draws of the flames at a quarter of the scene's pixels, laid over it`);
  } finally {
    RUST.tune.lowRes = 1;
    lab.drawing = drawing;
  }
}
