// `lab village`'s camera with a wall behind or beside him (from play, "being behind obstacle - this is not useful...
// I should see more"): over the shoulder, on the square, in the hall and on its portico, his back to what's built and
// then along it, a line from his chest to the camera must meet no wall of the village. Stood behind it, the wall
// dissolved in a small window round him and the rest of the frame was black. `canary` lets the boom stand behind
// what's built, as it did. Pulled in close, the camera must leave him whole and in the frame: stood at his shoulder a
// hand's breadth off, what it showed was a slice of his back, cut by the near plane (from play, "if you stopped moving
// cam through walls, you need to make sure it looks good at all angles"); the canary leaves it there too. Each spot
// the camera came close at is pictured, as no count says it looks good.
import * as THREE from 'three';
import type { Lab } from './lab';
import { G } from '../../../src/state';
import { boomKeepsShoulder, boomStandsBehind, faceCamera } from '../../../src/core/renderer';
import { HALL, TERRACE } from '../../../src/data/village';
import { groundHeight } from '../../../src/world/ground';
import { viewBy } from './villageHallCull';
import type { LightsChecked } from './villageLights';

type Moment = LightsChecked['moments'][number];

/** where he's walked out from, each way round to what's built */
const FROM = [
  { name: 'the square', x: 0, z: 0 },
  { name: 'the hall', x: TERRACE.x, z: (HALL.inFront + HALL.daisZ) / 2 },
  { name: 'the portico', x: TERRACE.x - 4, z: HALL.door + 2 },
];
/** the angles he's walked out along, and the frames given for the camera to settle */
const WAYS = 8;
const SETTLE = 60;
/** the height of his chest (m), how far short of the wall he stands (m), and the most he's walked out (m) */
const CHEST = 1.3;
const SHORT_OF_WALL = 0.8;
const FURTHEST = 60;
/** how far apart two floors are one level (m) */
const SAME_LEVEL = 0.2;
/** how far from his middle line his body reaches (m), and his height's points read on that line (m) */
const BODY_REACH = 0.28;
const BODY_POINTS = [0.3, 0.9, 1.3, 1.65];
/** the height of his crown (m), the least of him over the frame's foot that shows who it is; how near him the camera
 *  comes to be pictured (m), and the most pictures */
const HEAD = 1.85;
const CLOSE = 2.5;
const MOST_PICTURES = 18;
/** which way he's turned, from facing back the way he came: his back to the wall, then along it */
const TURNS = [{ name: 'backed', by: 0 }, { name: 'along', by: Math.PI / 2 }];

/** What came of the spots. */
interface Read {
  behind: number;
  behindAt: string[];
  spots: number;
  cutting: number;
  headOut: number;
  moments: Moment[];
}

/** How far his body's nearest point stands past the near plane (m); under 0, the plane cuts him. */
function clearOfNear(): number {
  const { x, y, z } = G.player.obj.position;
  const look = G.camera.getWorldDirection(new THREE.Vector3());
  const body = new THREE.Vector3();
  let least = Infinity;
  for (const up of BODY_POINTS) {
    body.set(x, y + up, z).sub(G.camera.position);
    least = Math.min(least, body.dot(look) - BODY_REACH - G.camera.near);
  }
  return least;
}

/** Whether his head is drawn inside the frame. */
function headInFrame(): boolean {
  const { x, y, z } = G.player.obj.position;
  const head = new THREE.Vector3(x, y + HEAD, z).project(G.camera);
  return Math.abs(head.x) <= 1 && Math.abs(head.y) <= 1;
}

/** Where the way out from `from` at `angle` ends, short of what's built; null if it meets nothing, or ends on another
 *  level (from the terrace's height it flies over the palisade, to where he never walks). */
function wallAlong(from: { x: number; z: number }, angle: number): THREE.Vector3 | null {
  const start = new THREE.Vector3(from.x, groundHeight(from.x, from.z) + CHEST, from.z);
  const end = start.clone().add(new THREE.Vector3(Math.sin(angle) * FURTHEST, 0, Math.cos(angle) * FURTHEST));
  const hit = { point: new THREE.Vector3(), normal: new THREE.Vector3(), t: 0, stone: false };
  if (!G.arena.wall.cast(start, end, hit)) return null;
  const reach = hit.point.distanceTo(start) - SHORT_OF_WALL;
  const x = from.x + Math.sin(angle) * reach;
  const z = from.z + Math.cos(angle) * reach;
  const floor = groundHeight(x, z);
  if (Math.abs(floor - groundHeight(from.x, from.z)) > SAME_LEVEL) return null;
  return new THREE.Vector3(x, floor, z);
}

/** Every spot's camera read, each close one pictured if `pictures`. */
async function readSpots(lab: Lab, pictures: boolean): Promise<Read> {
  const read: Read = { behind: 0, behindAt: [], spots: 0, cutting: 0, headOut: 0, moments: [] };
  const hit = { point: new THREE.Vector3(), normal: new THREE.Vector3(), t: 0, stone: false };
  const chest = new THREE.Vector3();
  for (const from of FROM) {
    for (let way = 0; way < WAYS; way++) {
      const angle = (way / WAYS) * Math.PI * 2;
      const at = wallAlong(from, angle);
      if (!at) continue;
      for (const turn of TURNS) {
        const facing = angle + Math.PI + turn.by;
        G.player.walkTo = null;
        G.player.place(at, facing);
        faceCamera(facing);
        await lab.step(SETTLE);
        read.spots++;
        chest.copy(G.player.obj.position);
        chest.y += CHEST;
        const hidden = G.arena.wall.cast(chest, G.camera.position, hit);
        if (hidden) {
          read.behind++;
          read.behindAt.push(`${from.name} way ${way} ${turn.name}`);
        }
        if (clearOfNear() < 0) read.cutting++;
        if (!headInFrame()) read.headOut++;
        const close = G.camera.position.distanceTo(chest) < CLOSE;
        if (pictures && (hidden || (close && read.moments.length < MOST_PICTURES))) {
          const label = `${from.name}, way ${way}, ${turn.name}`;
          read.moments.push(await lab.screen(label, [`boom ${G.camera.position.distanceTo(chest).toFixed(2)} m`]));
        }
      }
    }
  }
  return read;
}

/** The camera stands on his side of what's built, and shows him. */
export async function cameraBeforeWalls(lab: Lab, canary: boolean): Promise<LightsChecked> {
  await viewBy(lab, 'third');
  boomStandsBehind(false);
  boomKeepsShoulder(canary);
  try {
    const read = await readSpots(lab, !canary);
    let { behind } = read;
    if (canary) {
      boomStandsBehind(true);
      behind = (await readSpots(lab, false)).behind;
    }
    const { spots, cutting, headOut, moments } = read;
    if (spots < WAYS * 2) throw new Error(`lab: village: only ${spots} spots against a wall`);
    const line = `by the walls at ${spots} spots, over the shoulder: the camera behind one ${behind}, `
      + `its near plane through him ${cutting}, his crown out of the frame ${headOut}`
      + `${read.behindAt.length ? ` (behind one: ${read.behindAt.join(', ')})` : ''}`;
    if (canary) return { lines: [line], problems: [], caught: behind > 0 && cutting > 0, moments: [] };
    const problems = behind || cutting || headOut ? [line] : [];
    return { lines: [line], problems, caught: null, moments };
  } finally {
    boomStandsBehind(false);
    boomKeepsShoulder(false);
    await viewBy(lab, 'top');
  }
}
