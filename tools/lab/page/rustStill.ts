// `lab rustcheck`'s checks of what stands still and what the doorways hide. The game says what stands still
// (`standStill` in world/props.ts, `userData.standsStill`), and the stage never writes it again, as it writes only what
// moved (`engine/stage.ts`): such a part hidden must go from the frame, and shown again must give the frame back to
// the pixel. (The engine kept such parts in a cache of its own once, `engine/kept.ts`, checked here against the walk of
// them and by its audit of changes nothing told of; with nothing walked any more the cache is gone, and so are those
// checks, VictorZakharov/last-stand#973.)
// With it, the doorways' cull the engine's frame runs (`doorwaysLeaveTheFrame`).
import { Mesh, type Node } from './sceneApi.ts';
import type { Lab } from './lab';
import { apartShare, percent } from './rustPlain';
import { type Checked, failed, passed, pixelsIn } from './rustPixels';
import { RUST } from '../../../src/engine';
import type { Bridge } from '../../../src/engine/bridge';
import { G } from '../../../src/state';
import { standAt } from './draws';

/** where the hero stands in the hall of heroes for the doorways' check (x, z): before its dais, his back to the door */
const IN_HALL: [number, number] = [-1.6, -22.3];
/** the least records the doorways' cull must leave out there (the village behind him: 76 as this was written) */
const CULLED_LEAST = 20;
/** the frames a switch is given before the frame is pictured */
const SETTLE_FRAMES = 6;
/** the share of the frame that may be apart between two pictures of it held still (a spark, a mote) */
const STILL_SHARE = 0.0005;
/** the least share of the frame the still meshes must cover: hidden, that much of it changes (the canary) */
const HIDDEN_SHARE = 0.01;

/**
 * Stood in the hall of heroes, seen over his shoulder: what its doorway hides (`cullForEngine` in
 * world/doorways.ts, `rust.doorways`) is left out of the frame's records, and the frame is drawn as with it all
 * walked. The canary: with the switch off no fewer records are written.
 */
export async function doorwaysLeaveTheFrame(lab: Lab, bridge: Bridge): Promise<Checked> {
  const drawing = lab.drawing;
  const paused = G.paused;
  await standAt(lab, { biome: G.arena.biome, view: 'third', village: true, at: IN_HALL, hour: 12 });
  lab.drawing = true;
  await lab.step(90);
  G.paused = true;
  try {
    RUST.tune.doorways = 1;
    await lab.step(SETTLE_FRAMES);
    const culled = await pixelsIn(lab, undefined, 'doorways: what the doorway hides left out');
    const few = bridge.stats.records;
    RUST.tune.doorways = 0;
    await lab.step(SETTLE_FRAMES);
    const whole = await pixelsIn(lab, undefined, 'doorways: everything walked');
    const all = bridge.stats.records;
    const apart = apartShare(culled, whole);
    if (all - few < CULLED_LEAST) {
      return failed(`in the hall the doorway's cull leaves out ${all - few} of ${all} records (${CULLED_LEAST} at least)`);
    }
    if (apart > STILL_SHARE) {
      return failed(`in the hall what the doorway hides changes ${percent(apart)} of the frame's pixels left out`);
    }
    return passed(`in the hall what its doorway hides is left out of the frame: ${few} records for ${all}, the frame `
      + `the same (${percent(apart)} of its pixels apart)`);
  } finally {
    RUST.tune.doorways = 1;
    G.paused = paused;
    await lab.step(SETTLE_FRAMES);
    lab.drawing = drawing;
  }
}

/** The shown meshes under the parts of the scene the game says stand still. */
function stillMeshes(scene: Node): Mesh[] {
  const meshes: Mesh[] = [];
  scene.traverseVisible((object) => {
    if (!object.userData.standsStill) return;
    object.traverseVisible((part) => {
      if (part instanceof Mesh) meshes.push(part);
    });
  });
  return [...new Set(meshes)];
}

/**
 * Where the hero stands, the game held still: two pictures of the frame must be one frame, every mesh of what stands
 * still hidden must change it (the canary: hidden, a part that's never written again must still go), and shown again
 * must give it back to the pixel.
 */
export async function stillSameFrame(lab: Lab): Promise<Checked> {
  const drawing = lab.drawing;
  const paused = G.paused;
  lab.drawing = true;
  G.paused = true;
  const still = stillMeshes(G.scene);
  try {
    if (!still.length) return failed('nothing stands still where the hero stands: no part says it does');
    await lab.step(SETTLE_FRAMES);
    const first = await pixelsIn(lab, undefined, 'still: the frame held still');
    await lab.step(SETTLE_FRAMES);
    const again = await pixelsIn(lab, undefined, 'still: the frame held still again');
    const moved = apartShare(first, again);
    if (moved > STILL_SHARE) {
      return failed(`the frame held still moved between two pictures of it (${percent(moved)} of its pixels)`);
    }
    for (const mesh of still) mesh.visible = false;
    await lab.step(SETTLE_FRAMES);
    const without = await pixelsIn(lab, undefined, 'still: every still mesh hidden');
    for (const mesh of still) mesh.visible = true;
    await lab.step(SETTLE_FRAMES);
    const back = await pixelsIn(lab, undefined, 'still: every still mesh shown again');
    const gone = apartShare(first, without);
    const returned = apartShare(first, back);
    if (gone < HIDDEN_SHARE) {
      return failed(`the canary: ${still.length} still meshes hidden changed ${percent(gone)} of the frame, `
        + 'as if still drawn');
    }
    if (returned > STILL_SHARE) {
      return failed(`still meshes hidden and shown again draw ${percent(returned)} of the frame apart from before`);
    }
    return passed(`${still.length} meshes stand still where he stands; two pictures of the frame held still are `
      + `${percent(moved)} apart, and hidden the still meshes change ${percent(gone)} of it and come back`);
  } finally {
    for (const mesh of still) mesh.visible = true;
    G.paused = paused;
    await lab.step(SETTLE_FRAMES);
    lab.drawing = drawing;
  }
}
