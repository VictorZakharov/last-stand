// `lab village`'s hall of heroes opening for him from above, each from play:
//
// `doorConeOpens` ("here should open the wall above hero, so user can see in the cone up"): stood at its door, looking
// in, the floor he sees through it shows through the wall over it, and the wall aside of that stays. `--canary`: the
// cone held shut, as it was.
//
// `heroSeenPastHall` ("and here cannot see hero"): stood outside its side wall with the camera over its room, he shows
// through that wall. `--canary`: its walls held whole.
//
// `noDotsBesideHall` ("also this is broken"): while the hall alone is thinned for him, what stands free stays whole:
// the frame hardly changes with the props' thinning held off. `--canary`: they thin as they did, the terrace's coping
// in dots.
import * as THREE from 'three';
import type { Lab } from './lab';
import { G } from '../../../src/state';
import { holdHour } from '../../../src/game/clock';
import { holdHallWallsNone } from '../../../src/game/village';
import { faceCamera, viewMode } from '../../../src/core/renderer';
import {
  doorConeOpen, holdDoorShut, holdPropHole, holdPropsThinned,
} from '../../../src/core/seeThrough';
import { HALL, TERRACE } from '../../../src/data/village';
import { groundHeight } from '../../../src/world/ground';
import { drawFrame, type Canvas } from './light';
import { changedShare, viewBy } from './villageHallCull';
import { hisPixels, shownOf } from './villageHeroInView';
import type { LightsChecked } from './villageLights';

/** the frames he's given to settle, the frames a hold takes to reach what's let go of its depth, and the hour */
const SETTLE = 90;
const HOLD_TAKES = 2;
const HOUR = 12;
/** a mark's side and its height over the floor (m), how little green against red and blue shows it, and how bright */
const MARK = 0.5;
const MARK_OVER = 0.03;
const MARK_SHOWS = 0.7;
const MARK_BRIGHT = 0.3;
/** how far out from the door's outer face he stands (m), and looking in: the camera's on his side of it */
const AT_DOOR = 0.6;
export const LOOKING_IN = Math.PI;
/** how far in from the door the floor's marked, down its middle (m); how far aside of that it's marked, out of what he
 *  sees, how far in (m); and the least shown, the most shown aside */
const FLOOR_IN = [6, 7, 8];
const WALL_ASIDE = [-4.5, -3.8, 3.8, 4.5];
const ASIDE_IN = 1;
export const LEAST_SHOWN = 0.75;
/** how far the cone must have opened by then */
const LEAST_OPEN = 0.5;
const MOST_ASIDE = 0.25;
/** where he stands past the hall's east wall, the camera over its room, and the least of him shown */
const PAST_WALL = HALL.half + 1;
const PAST_WALL_Z = -24;
const LOOKING_EAST = Math.PI / 2;
const LEAST_OF_HIM = 0.5;
/** where he stands in the hall by that wall, the camera past it, and the most of the frame the props' thinning may
 *  change */
const BY_WALL = HALL.inHalf - 0.4;
const BY_WALL_Z = -19.5;
const LOOKING_WEST = -Math.PI / 2;
const MOST_DOTS = 0.002;

/** The hero stood at (x, z), the camera turned to `facing`, let settle. */
export async function standFacing(lab: Lab, x: number, z: number, facing: number): Promise<void> {
  G.player.walkTo = null;
  G.player.place(new THREE.Vector3(x, groundHeight(x, z), z), facing);
  faceCamera(facing);
  await lab.step(SETTLE);
}

/** A bright mark on the hall's floor at (x, z), to read whether that floor shows. */
export function floorMark(x: number, z: number): THREE.Mesh {
  const mark = new THREE.Mesh(
    new THREE.PlaneGeometry(MARK, MARK).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xff00ff }),
  );
  mark.position.set(x, TERRACE.high + MARK_OVER, z);
  G.scene.add(mark);
  return mark;
}

/** Whether `point` is in the camera's frame. */
export function inFrame(point: THREE.Vector3): boolean {
  const place = point.clone().project(G.camera);
  return Math.abs(place.x) < 1 && Math.abs(place.y) < 1 && place.z < 1;
}

/** Whether a pixel of `canvas` over `point` shows a mark. */
function showsMark(canvas: Canvas, point: THREE.Vector3): boolean {
  const place = point.clone().project(G.camera);
  const column = Math.floor(((place.x + 1) / 2) * canvas.width);
  const row = Math.floor(((place.y + 1) / 2) * canvas.height);
  if (column < 0 || column >= canvas.width || row < 0 || row >= canvas.height) {
    throw new Error('lab: village: a mark on the hall\'s floor is out of the frame');
  }
  const at = (row * canvas.width + column) * 4;
  const [red, green, blue] = [canvas.pixels[at], canvas.pixels[at + 1], canvas.pixels[at + 2]];
  return red > MARK_BRIGHT && blue > MARK_BRIGHT && green < Math.min(red, blue) * MARK_SHOWS;
}

/** The share of `marks` that show in the frame drawn now. */
export function shownMarks(lab: Lab, marks: THREE.Mesh[]): number {
  const canvas = drawFrame(lab);
  return marks.filter((mark) => showsMark(canvas, mark.position)).length / marks.length;
}

/** The view from above at noon for `read`, put back after it. */
export async function fromAboveAtNoon<T>(lab: Lab, read: () => Promise<T>): Promise<T> {
  const kept = viewMode();
  holdHour(HOUR);
  try {
    await viewBy(lab, 'top');
    return await read();
  } finally {
    holdHour(null);
    faceCamera(0);
    await viewBy(lab, kept);
  }
}

/** At the hall's door, the floor he sees through it shown through the wall over it, the wall aside of that kept. */
export async function doorConeOpens(lab: Lab, canary: boolean): Promise<LightsChecked> {
  return fromAboveAtNoon(lab, async () => {
    holdDoorShut(canary);
    await standFacing(lab, TERRACE.x, HALL.door + AT_DOOR, LOOKING_IN);
    if (!canary && doorConeOpen() < LEAST_OPEN) {
      throw new Error(`lab: village: the cone through the door never opened (${doorConeOpen().toFixed(2)})`);
    }
    const inCone = FLOOR_IN.map((inside) => floorMark(TERRACE.x, HALL.inFront - inside));
    const aside = WALL_ASIDE.map((off) => floorMark(TERRACE.x + off, HALL.inFront - ASIDE_IN));
    const shown = shownMarks(lab, inCone);
    const changed = shownMarks(lab, aside);
    const shot = canary ? null : await lab.screen('at the door: what he sees through it', []);
    holdDoorShut(true);
    await lab.step(HOLD_TAKES);
    const shutShown = shownMarks(lab, inCone);
    const shutShot = canary ? null : await lab.screen('at the door, the cone held shut', []);
    holdDoorShut(false);
    for (const mark of [...inCone, ...aside]) G.scene.remove(mark);
    const line = `at the hall's door, the floor past it shown through the wall: ${(shown * 100).toFixed(0)}% `
      + `(at least ${LEAST_SHOWN * 100}%; shut ${(shutShown * 100).toFixed(0)}%), `
      + `the floor aside of what he sees shown `
      + `${(changed * 100).toFixed(0)}% (at most ${MOST_ASIDE * 100}%)`;
    const wrong = shown < LEAST_SHOWN || changed > MOST_ASIDE || shutShown > MOST_ASIDE;
    if (canary) return { lines: [line], problems: [], caught: wrong, moments: [] };
    const moments = shot && shutShot ? [shot, shutShot] : [];
    return { lines: [line], problems: wrong ? [line] : [], caught: null, moments };
  });
}

/** The share of him that shows, stood at (x, z) with the camera turned to `facing`. */
async function shownFrom(lab: Lab, x: number, z: number, facing: number): Promise<number> {
  await standFacing(lab, x, z, facing);
  const pixels = hisPixels(lab);
  if (pixels.length < 100) throw new Error("lab: village: the hero isn't in the frame by the hall's wall");
  return shownOf(lab, pixels);
}

/** Past the hall's side wall from the camera, and in the hall a hand from it, he shows through it. */
export async function heroSeenPastHall(lab: Lab, canary: boolean): Promise<LightsChecked> {
  return fromAboveAtNoon(lab, async () => {
    holdHallWallsNone(canary);
    try {
      const past = await shownFrom(lab, TERRACE.x + PAST_WALL, PAST_WALL_Z, LOOKING_EAST);
      const shot = canary ? null : await lab.screen("past the hall's side wall", []);
      const by = await shownFrom(lab, TERRACE.x + BY_WALL, BY_WALL_Z, LOOKING_WEST);
      const byShot = canary ? null : await lab.screen("in the hall, a hand from the wall before the camera", []);
      const line = `of him, past the hall's side wall ${(past * 100).toFixed(0)}% shows, in the hall a hand from it `
        + `${(by * 100).toFixed(0)}% (each at least ${LEAST_OF_HIM * 100}%)`;
      const wrong = past < LEAST_OF_HIM || by < LEAST_OF_HIM;
      if (canary) return { lines: [line], problems: [], caught: wrong, moments: [] };
      const moments = shot && byShot ? [shot, byShot] : [];
      return { lines: [line], problems: wrong ? [line] : [], caught: null, moments };
    } finally {
      holdHallWallsNone(false);
    }
  });
}

/** While the hall alone is thinned for him, the props stay as they'd stand with no thinning. */
export async function noDotsBesideHall(lab: Lab, canary: boolean): Promise<LightsChecked> {
  return fromAboveAtNoon(lab, async () => {
    holdPropsThinned(canary);
    try {
      await standFacing(lab, TERRACE.x + BY_WALL, BY_WALL_Z, LOOKING_WEST);
      const asItIs = drawFrame(lab);
      holdPropHole(true);
      const whole = drawFrame(lab);
      holdPropHole(false);
      const changed = changedShare(asItIs, whole);
      const line = `by the hall's wall, thinning what stands free changes ${(changed * 100).toFixed(2)}% of the frame `
        + `(at most ${MOST_DOTS * 100}%)`;
      const wrong = changed > MOST_DOTS;
      if (canary) return { lines: [line], problems: [], caught: wrong, moments: [] };
      return { lines: [line], problems: wrong ? [line] : [], caught: null, moments: [] };
    } finally {
      holdPropsThinned(false);
    }
  });
}
