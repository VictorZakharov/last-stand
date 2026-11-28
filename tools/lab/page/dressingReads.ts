// What `lab dressing` reads of the tavern as it's built (its parts' boxes as the room's merge kept them,
// `mergedParts`):
// the shelves against its walls clear of the walls' posts, what stands on the mantel standing on its top, and the
// candles' flames wavering from frame to frame.
import { Box3, Mesh, Node, Vec3 } from './sceneApi.ts';
import { partBoxes } from './houses';

/** the candles' flames' mesh's name (`FLAME_NAMES.tongue` in world/candleFlames.ts): spelt here, not
 *  imported, so a commit before it (an A/B's main) still loads this */
const FLAMES = 'candle flames';
/** the fewest candles' flames the tavern shows from the room's middle (it has 18) */
const FLAMES_LEAST = 15;
/** the mantel shelf's size (m: `hearth` in world/rooms.ts, its width 2.3, 0.1 thick, 0.32 deep) */
const MANTEL = new Vec3(2.3, 0.1, 0.32);
/** how near a part's foot must be the mantel's top to be read as standing on it, and how far off it may stand (m) */
const ON_MANTEL = 0.03;
const STANDS_OFF = 0.003;
/** how near two parts are along the mantel to be one thing (a cup and its handle: m between their boxes) */
const ONE_THING = 0.01;

/** A box's size. */
function sizeOf(box: Box3): Vec3 {
  return box.getSize(new Vec3());
}

/** Each post of the room's walls: a timber floor to plate, 0.2 by 0.12 (`shell` in world/rooms.ts). */
export function postsIn(room: Node): Box3[] {
  return partBoxes(room).filter((box) => {
    const size = sizeOf(box);
    const across = [size.x, size.z].sort((a, b) => a - b);
    return size.y > 2.4 && Math.abs(across[0] - 0.12) < 0.01 && Math.abs(across[1] - 0.2) < 0.01;
  });
}

/** Each board standing against a wall (a shelf's: thin, flat and over half a metre long, among what's gathered as
 *  "against the <side> wall"). */
export function boardsIn(room: Node): Box3[] {
  const boards: Box3[] = [];
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
export function readPosts(posts: readonly Box3[], boards: readonly Box3[], lines: string[],
  problems: string[]): void {
  if (!posts.length || !boards.length) throw new Error('lab: dressing: no posts or no shelf boards to read');
  let crossing = 0;
  for (const board of boards) {
    // (a hair in from each face: a board laid against a post's side touches it)
    const inner = board.clone().expandByScalar(-0.002);
    for (const post of posts) {
      if (!inner.intersectsBox(post)) continue;
      crossing++;
      const middle = board.getCenter(new Vec3());
      problems.push(`a shelf's board at (${middle.x.toFixed(2)}, ${middle.y.toFixed(2)}, ${middle.z.toFixed(2)}) `
        + 'runs through a post of its wall');
    }
  }
  lines.push(`${boards.length} shelf boards against the walls, ${posts.length} posts: ${crossing} crossing`);
}

/** The hearth's mantel shelf among the room's parts. */
export function mantelIn(room: Node): Box3 {
  const found = partBoxes(room).filter((box) => sizeOf(box).distanceTo(MANTEL) < 0.012);
  if (found.length !== 1) throw new Error(`lab: dressing: ${found.length} mantels found, not one`);
  return found[0];
}

/** What stands on the mantel: each thing's parts whose foot is near its top, joined where their boxes meet
 *  along it (a cup and its handle), as their boxes. */
export function onMantel(room: Node, mantel: Box3): Box3[] {
  const top = mantel.max.y;
  const parts = partBoxes(room).filter((box) => {
    const middle = box.getCenter(new Vec3());
    const alongIt = middle.x > mantel.min.x && middle.x < mantel.max.x;
    const over = alongIt && middle.z > mantel.min.z && middle.z < mantel.max.z;
    return over && box.min.y > top - ON_MANTEL && box.min.y < top + ON_MANTEL;
  });
  const things: Box3[] = [];
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
export function readMantel(mantel: Box3, things: readonly Box3[], lines: string[],
  problems: string[]): void {
  if (!things.length) throw new Error('lab: dressing: nothing on the mantel to read');
  let most = 0;
  for (const thing of things) {
    const off = thing.min.y - mantel.max.y;
    if (Math.abs(off) > Math.abs(most)) most = off;
    if (Math.abs(off) <= STANDS_OFF) continue;
    const word = off > 0 ? 'over' : 'into';
    problems.push(`a thing on the mantel at x ${thing.getCenter(new Vec3()).x.toFixed(2)} stands `
      + `${(Math.abs(off) * 100).toFixed(1)} cm ${word} its top`);
  }
  lines.push(`${things.length} things on the mantel, the furthest off its top ${(most * 100).toFixed(1)} cm`);
}

/** The candles' flames' points now, and how many points a flame has (none: the room's flames are still meshes merged
 *  with it, as main's). */
export function flamesNow(room: Node): { at: Float32Array; points: number } | null {
  const flames = room.getObjectByName(FLAMES) as Mesh | undefined;
  const points = flames?.userData.flamePoints as number | undefined;
  if (!flames || !points) return null;
  return { at: (flames.geometry.attributes.position.array as Float32Array).slice(), points };
}

/** whether a flame's points (from `from`, `count` floats) are all at one point: drawn in, its wall cut away */
function drawnIn(at: Float32Array, from: number, count: number): boolean {
  for (let k = from + 3; k < from + count; k++) if (at[k] !== at[from + (k - from) % 3]) return false;
  return true;
}

/** How many of the candles' flames shown (not drawn in to nothing, on a wall cut away) moved between `before` and
 *  `after`: every one must, and there must be the tavern's candles' worth. */
export function readFlames(before: ReturnType<typeof flamesNow>, after: ReturnType<typeof flamesNow>, lines: string[],
  problems: string[]): void {
  if (!before || !after) {
    problems.push('the candles\' flames are no mesh of their own: they stand still, merged with the room');
    return;
  }
  const each = before.points * 3;
  let shown = 0;
  let moved = 0;
  for (let from = 0; from < before.at.length; from += each) {
    if (drawnIn(before.at, from, each)) continue;
    shown++;
    const flame = before.at.subarray(from, from + each);
    const still = flame.every((value, k) => Math.abs(value - after.at[from + k]) < 1e-5);
    if (!still) moved++;
  }
  lines.push(`the candles' flames: ${moved} of ${shown} shown moved over the frames read`);
  if (shown < FLAMES_LEAST) problems.push(`${shown} candles' flames shown: the tavern has ${FLAMES_LEAST} at least`);
  if (moved < shown) problems.push(`${shown - moved} of the candles' ${shown} flames stood still`);
}
