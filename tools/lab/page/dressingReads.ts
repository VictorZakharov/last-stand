// What `lab dressing` reads of the tavern as it's built (its parts' boxes as the room's merge kept them,
// `mergedParts`):
// the shelves against its walls clear of the walls' posts, what stands on the mantel standing on its top, and the
// candles burning as fires, each from frame to frame.
import * as THREE from 'three';
import { partBoxes } from './houses';

/** what a fire's flames are named (`buildFire` in world/fire.ts) */
const FLAMES = 'flames';
/** the fewest fires the tavern burns with its candles as fires: its hearth and its 18 candles (main: its hearth) */
const FIRES_LEAST = 15;
/** the mantel shelf's size (m: `hearth` in world/rooms.ts, its width 2.3, 0.1 thick, 0.32 deep) */
const MANTEL = new THREE.Vector3(2.3, 0.1, 0.32);
/** how near a part's foot must be the mantel's top to be read as standing on it, and how far off it may stand (m) */
const ON_MANTEL = 0.03;
const STANDS_OFF = 0.003;
/** how near two parts are along the mantel to be one thing (a cup and its handle: m between their boxes) */
const ONE_THING = 0.01;

/** A box's size. */
function sizeOf(box: THREE.Box3): THREE.Vector3 {
  return box.getSize(new THREE.Vector3());
}

/** Each post of the room's walls: a timber floor to plate, 0.2 by 0.12 (`shell` in world/rooms.ts). */
export function postsIn(room: THREE.Object3D): THREE.Box3[] {
  return partBoxes(room).filter((box) => {
    const size = sizeOf(box);
    const across = [size.x, size.z].sort((a, b) => a - b);
    return size.y > 2.4 && Math.abs(across[0] - 0.12) < 0.01 && Math.abs(across[1] - 0.2) < 0.01;
  });
}

/** Each board standing against a wall (a shelf's: thin, flat and over half a metre long, among what's gathered as
 *  "against the <side> wall"). */
export function boardsIn(room: THREE.Object3D): THREE.Box3[] {
  const boards: THREE.Box3[] = [];
  room.traverse((object) => {
    if (!object.name.startsWith('against the ')) return;
    for (const box of partBoxes(object)) {
      const size = sizeOf(box);
      if (size.y >= 0.03 && size.y <= 0.06 && Math.max(size.x, size.z) > 0.5) boards.push(box);
    }
  });
  return boards;
}

/** Each board clear of every post: what runs through one, and how many were read. */
export function readPosts(posts: readonly THREE.Box3[], boards: readonly THREE.Box3[], lines: string[],
  problems: string[]): void {
  if (!posts.length || !boards.length) throw new Error('lab: dressing: no posts or no shelf boards to read');
  let crossing = 0;
  for (const board of boards) {
    // (a hair in from each face: a board laid against a post's side touches it)
    const inner = board.clone().expandByScalar(-0.002);
    for (const post of posts) {
      if (!inner.intersectsBox(post)) continue;
      crossing++;
      const middle = board.getCenter(new THREE.Vector3());
      problems.push(`a shelf's board at (${middle.x.toFixed(2)}, ${middle.y.toFixed(2)}, ${middle.z.toFixed(2)}) `
        + 'runs through a post of its wall');
    }
  }
  lines.push(`${boards.length} shelf boards against the walls, ${posts.length} posts: ${crossing} crossing`);
}

/** The hearth's mantel shelf among the room's parts. */
export function mantelIn(room: THREE.Object3D): THREE.Box3 {
  const found = partBoxes(room).filter((box) => sizeOf(box).distanceTo(MANTEL) < 0.012);
  if (found.length !== 1) throw new Error(`lab: dressing: ${found.length} mantels found, not one`);
  return found[0];
}

/** What stands on the mantel: each thing's parts whose foot is near its top, joined where their boxes meet
 *  along it (a cup and its handle), as their boxes. */
export function onMantel(room: THREE.Object3D, mantel: THREE.Box3): THREE.Box3[] {
  const top = mantel.max.y;
  const parts = partBoxes(room).filter((box) => {
    const middle = box.getCenter(new THREE.Vector3());
    const alongIt = middle.x > mantel.min.x && middle.x < mantel.max.x;
    const over = alongIt && middle.z > mantel.min.z && middle.z < mantel.max.z;
    return over && box.min.y > top - ON_MANTEL && box.min.y < top + ON_MANTEL;
  });
  const things: THREE.Box3[] = [];
  for (const part of parts.sort((a, b) => a.min.x - b.min.x)) {
    const last = things[things.length - 1];
    // (by their boxes along it: by their middles, a cup's handle 7 cm from its body was read as a thing of its own)
    const near = last && part.min.x < last.max.x + ONE_THING;
    if (near) last.union(part);
    else things.push(part.clone());
  }
  return things;
}

/** Each thing on the mantel standing on its top: what floats or sinks, and the most found. */
export function readMantel(mantel: THREE.Box3, things: readonly THREE.Box3[], lines: string[],
  problems: string[]): void {
  if (!things.length) throw new Error('lab: dressing: nothing on the mantel to read');
  let most = 0;
  for (const thing of things) {
    const off = thing.min.y - mantel.max.y;
    if (Math.abs(off) > Math.abs(most)) most = off;
    if (Math.abs(off) <= STANDS_OFF) continue;
    const word = off > 0 ? 'over' : 'into';
    problems.push(`a thing on the mantel at x ${thing.getCenter(new THREE.Vector3()).x.toFixed(2)} stands `
      + `${(Math.abs(off) * 100).toFixed(1)} cm ${word} its top`);
  }
  lines.push(`${things.length} things on the mantel, the furthest off its top ${(most * 100).toFixed(1)} cm`);
}

/** A fire's moment now: its loop's frame and its puff, as its flames' shader is given them. */
type FireMoment = [number, number];

/** Each fire's moment in the room now, its hearth's and its candles' (`buildFire`'s flames, named `flames`). */
export function flamesNow(room: THREE.Object3D): FireMoment[] {
  const moments: FireMoment[] = [];
  room.traverse((object) => {
    const uniforms = object.userData.flames as Record<string, { value: number }> | undefined;
    if (object.name === FLAMES && uniforms) moments.push([uniforms.uFrame.value, uniforms.uPuff.value]);
  });
  return moments;
}

/** The room's fires: enough of them that its candles burn as fires, each burning on between `before` and `after`. */
export function readFlames(before: readonly FireMoment[], after: readonly FireMoment[], lines: string[],
  problems: string[]): void {
  const still = before.filter(([frame, puff], k) => frame === after[k]?.[0] && puff === after[k]?.[1]).length;
  lines.push(`${before.length} fires in the room, ${before.length - still} burning on over the frames read`);
  if (before.length < FIRES_LEAST) problems.push(`${before.length} fires in the room: its candles burn none`);
  if (still) problems.push(`${still} of the room's ${before.length} fires stood still`);
}
