// `lab village`'s camera with a wall behind him (from play, "being behind obstacle - this is not useful... I should see
// more"): over the shoulder, his back to the palisade, a line from his chest to the camera must meet no wall of the
// village. Stood behind it, the wall dissolved in a small window round him and the rest of the frame was black.
// `canary` lets the boom stand behind what's built, as it did.
import * as THREE from 'three';
import type { Lab } from './lab';
import { G } from '../../../src/state';
import { boomStandsBehind, faceCamera } from '../../../src/core/renderer';
import { groundHeight } from '../../../src/world/ground';
import { viewBy } from './villageHallCull';
import type { LightsChecked } from './villageLights';

/** the angles round the village he's walked out along to its wall, and the frames given for the camera to settle */
const WAYS = 8;
const SETTLE = 60;
/** the height of his chest (m), how far short of the wall he stands (m), and the most he's walked out (m) */
const CHEST = 1.3;
const SHORT_OF_WALL = 0.8;
const FURTHEST = 60;

/** How many of the ways leave the camera behind a wall, him backed against the wall each way ends at. */
async function camerasBehind(lab: Lab): Promise<{ behind: number; backed: number }> {
  const wall = G.arena.wall;
  const hit = { point: new THREE.Vector3(), normal: new THREE.Vector3(), t: 0, stone: false };
  const from = new THREE.Vector3();
  const to = new THREE.Vector3();
  let behind = 0;
  let backed = 0;
  for (let way = 0; way < WAYS; way++) {
    const angle = (way / WAYS) * Math.PI * 2;
    from.set(0, CHEST, 0);
    to.set(Math.sin(angle) * FURTHEST, CHEST, Math.cos(angle) * FURTHEST);
    if (!wall.cast(from, to, hit)) continue;
    const reach = hit.point.distanceTo(from) - SHORT_OF_WALL;
    const x = Math.sin(angle) * reach;
    const z = Math.cos(angle) * reach;
    G.player.walkTo = null;
    G.player.place(new THREE.Vector3(x, groundHeight(x, z), z), angle + Math.PI);
    faceCamera(angle + Math.PI);
    await lab.step(SETTLE);
    backed++;
    from.set(x, G.player.obj.position.y + CHEST, z);
    if (wall.cast(from, G.camera.position, hit)) behind++;
    from.set(0, CHEST, 0);
  }
  return { behind, backed };
}

/** The camera stands on his side of what's built. */
export async function cameraBeforeWalls(lab: Lab, canary: boolean): Promise<LightsChecked> {
  await viewBy(lab, 'third');
  boomStandsBehind(canary);
  try {
    const { behind, backed } = await camerasBehind(lab);
    if (backed < WAYS / 2) throw new Error(`lab: village: backed against a wall only ${backed} ways of ${WAYS}`);
    const line = `backed against the walls ${backed} ways, over the shoulder: the camera behind one ${behind}`;
    if (canary) return { lines: [line], problems: [], caught: behind > 0, moments: [] };
    return { lines: [line], problems: behind ? [line] : [], caught: null, moments: [] };
  } finally {
    boomStandsBehind(false);
    await viewBy(lab, 'top');
  }
}
