// `lab village`'s hall of heroes walked up to on its terrace: the hero walks straight at its side walls and its front
// wall beside the door until they stop him, and a ray at a knee's height from where he set off reads the first surface
// drawn ahead of him: his middle must stand off it (from play, "can pass through textures here": the plinth course
// along the hall's foot, 35 cm out from its walls, was drawn and not in the wall, and he walked into it). `canary`
// reads each gap as if he'd gone half a metre further.
import * as THREE from 'three';
import type { Lab } from './lab';
import { G } from '../../../src/state';
import { groundHeight } from '../../../src/world/ground';
import { drawnInShadowsOnly } from '../../../src/world/culling';
import { HALL, TERRACE, type Spot } from '../../../src/data/village';
import type { LightsChecked } from './villageLights';

/** frames he settles where he's put, and walks at most */
const SETTLE = 15;
const WALK = 240;
/** how high over the terrace the ray runs (m: a knee's), the least his middle may stand off what's drawn (m), and how
 *  much further the canary counts him (m) */
const KNEE = 0.25;
const LEAST_OFF = 0.15;
const CANARY_ON = 0.5;
/** how far the walk's target lies past the wall (m), so he never stops short of it on his own */
const PAST = 6;

/** A walk at the hall: its name, where he sets off, and which way he walks (a unit along x or z). */
interface HallWalk { name: string; from: Spot; way: Spot }

const X = TERRACE.x;
/** the walks: at each side wall from the terrace beside it, at the front wall between the portico's columns */
const WALKS: readonly HallWalk[] = [
  { name: 'east side', from: [X + HALL.half + 2.2, -18], way: [-1, 0] },
  { name: 'west side', from: [X - HALL.half - 2.2, -18], way: [1, 0] },
  { name: 'front, east of the door', from: [X + 4.45, HALL.door + 2.6], way: [0, -1] },
  { name: 'front, west of the door', from: [X - 4.45, HALL.door + 2.6], way: [0, -1] },
];

/** Whether `object` and everything over it is drawn in the frame (not hidden, not the shadows' alone). */
function drawn(object: THREE.Object3D): boolean {
  for (let o: THREE.Object3D | null = object; o; o = o.parent) {
    if (!o.visible || drawnInShadowsOnly(o as THREE.Mesh)) return false;
  }
  return true;
}

/** Whether `object` is part of a hero. */
function ofHero(object: THREE.Object3D): boolean {
  for (let o: THREE.Object3D | null = object; o; o = o.parent) if (o === G.player.obj) return true;
  return false;
}

/** How far along `way` from `from` (at the knee's height) the first surface drawn lies (m), or Infinity. */
function surfaceAhead(from: THREE.Vector3, way: THREE.Vector3): number {
  const ray = new THREE.Raycaster(from, way, 0, 30);
  const hits = ray.intersectObject(G.arena.groupOf('village'), true);
  const hit = hits.find((h) => (h.object as THREE.Mesh).isMesh && drawn(h.object) && !ofHero(h.object));
  return hit ? hit.distance : Infinity;
}

/** He walks the walk until stopped: how far his middle stands off the surface ahead (m). */
async function walkUp(lab: Lab, walk: HallWalk): Promise<number> {
  const [x, z] = walk.from;
  const [wx, wz] = walk.way;
  G.player.walkTo = null;
  G.player.place(new THREE.Vector3(x, groundHeight(x, z), z), Math.atan2(wx, wz));
  await lab.step(SETTLE);
  G.player.walkTo = new THREE.Vector3(x + wx * (PAST + 3), 0, z + wz * (PAST + 3));
  await lab.step(WALK);
  G.player.walkTo = null;
  const start = new THREE.Vector3(x, TERRACE.high + KNEE, z);
  const way = new THREE.Vector3(wx, 0, wz);
  const walked = (G.player.pos.x - x) * wx + (G.player.pos.z - z) * wz;
  return surfaceAhead(start, way) - walked;
}

/** Each walk at the hall's walls: his middle off what's drawn ahead where he stopped. */
export async function hallWallsHold(lab: Lab, canary: boolean): Promise<LightsChecked> {
  const gaps: string[] = [];
  const failed: string[] = [];
  for (const walk of WALKS) {
    const gap = (await walkUp(lab, walk)) - (canary ? CANARY_ON : 0);
    gaps.push(`${walk.name} ${gap.toFixed(2)}`);
    if (!(gap >= LEAST_OFF)) failed.push(`${walk.name}: his middle ${gap.toFixed(2)} m off the surface ahead`);
  }
  const line = `hall's walls walked up to: his middle off them (m, at least ${LEAST_OFF}): ${gaps.join(', ')}`;
  if (canary) return { lines: [line], problems: [], caught: failed.length > 0, moments: [] };
  return { lines: [line], problems: failed.map((f) => `hall's walls: ${f}`), caught: null, moments: [] };
}
