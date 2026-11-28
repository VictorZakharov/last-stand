// The atlas the world's overlays are drawn from (ui/overlay): one texture, every label painted into a slot of its
// own when it changes, and the slots painted in a frame sent together as it's drawn (`atlasRows.ts`).
import { overlayAtlas } from '../../engine/overlay';
import { AtlasRows } from './atlasRows';

/** the atlas's side, px, for each canvas pixel a px of a label's art takes (the canvas's ratio times the UI's scale;
 *  rounded up to a multiple of `SIDE_STEP`, at least `SIDE_MIN`): a label's pixels go with that ratio's square, and
 *  at 2 a heavy fight's 250 floating numbers took more than the 2048 px square the atlas was at any ratio */
const SIDE_PER_RATIO = 1536;
const SIDE_MIN = 2048;
const SIDE_STEP = 512;
/** the largest side WebGPU promises every device's textures (`maxTextureDimension2D`'s least) */
const MOST_SIDE = 8192;
/** a slot's height rounds up to one of these (px): each shelf of the atlas holds slots of one height (a downed
 *  partner's marker is some 200 px of art, 1000 at an 8K screen's UI scale at 100%) */
const HEIGHTS = [16, 24, 32, 48, 64, 96, 128, 192, 256, 384, 512, 768, 1024];
/** a full atlas is packed again (every label shown painted anew) when this share of it is slots given back, or as
 *  soon as those would hold this many times the label that didn't fit: kept for a quarter alone, the bug report's
 *  words grown a line at a time and its report's lines shown and put away filled shelves of every height with
 *  slots given back, under a quarter of the atlas, and the next label didn't fit (#973) */
const REPACK_SPARE = 0.25;
const REPACK_WANTED = 2;
/** a full atlas is packed again too when what's painted in it now would fill no more than this share of it packed:
 *  a scrolled page's words given back left slots of their own widths, which the words scrolled in fitted none of, and
 *  the guide's pages filled it with half of it free (#973) */
const REPACK_LIVE = 0.6;
/** a slot's width rounds up to a multiple of this (px) */
const WIDTH_STEP = 16;
/** a slot holds a label of up to this many times its size, and this many px more (more would waste it) */
const SLACK = 2;
const SLACK_PX = 16;
/** px left clear after each slot, right and below: a label filling its slot was sampled, filtered, with a row of
 *  the slot under it (a party card's words underlined in its life bar's red, #973) */
const GUTTER = 2;

/** A slot: its region of the atlas, px from the top left. */
export interface Slot { x: number; y: number; w: number; h: number }

interface Shelf { y: number; h: number; used: number }

const shelves: Shelf[] = [];
/** slots given back, by their height, for the next label of that height they hold (a fight's numbers come in every
 *  width: kept for their own width alone, the atlas filled with slots no new one fitted) */
const spare = new Map<number, Slot[]>();
let nextY = 0;
let side = SIDE_MIN;
/** the area of the slots given back, px, and whether a slot was asked for that didn't fit */
let spareArea = 0;
/** the area of every slot placed on a shelf (px): less the spare, what's painted in the atlas now */
let placedArea = 0;
let full = false;
/** the area of the last slot asked for that didn't fit (px) */
let wantedArea = 0;
/** the rows labels are painted on, sent to the atlas as the frame is drawn */
let rows = new AtlasRows(side, GUTTER);
let warned = false;

/** The atlas's side, px. */
export const atlasSide = (): number => side;

/** The atlas made in the engine at its side (cleared when that changes); false before the engine has started. */
export const atlasReady = (): boolean => overlayAtlas(side);

/** Whether `slot` holds a label of `w` by `h` px, and isn't too large for it. */
export function fits(slot: Slot, w: number, h: number): boolean {
  return slot.w >= w && slot.h >= h && slot.w <= w * SLACK + SLACK_PX && slot.h <= h * SLACK + SLACK_PX;
}

/** The narrowest slot given back of `height` that holds a label of `w` by `h` px, taken off the list; or null. */
function reuse(height: number, w: number, h: number): Slot | null {
  const list = spare.get(height);
  if (!list) return null;
  let best = -1;
  for (let i = 0; i < list.length; i++) {
    if (fits(list[i], w, h) && (best < 0 || list[i].w < list[best].w)) best = i;
  }
  if (best < 0) return null;
  const [slot] = list.splice(best, 1);
  spareArea -= slot.w * slot.h;
  return slot;
}

/** The size class a label of `w` by `h` px takes: its slot's width and height. */
function sizeClass(w: number, h: number): { w: number; h: number } | null {
  const height = HEIGHTS.find((x) => x >= h);
  if (height === undefined || w > side) return null;
  return { w: Math.ceil(w / WIDTH_STEP) * WIDTH_STEP, h: height };
}

/** A slot for a label of `w` by `h` px, or null when none fits (the atlas is full: the label isn't drawn). */
export function takeSlot(w: number, h: number): Slot | null {
  const size = sizeClass(Math.max(1, w), Math.max(1, h));
  if (!size) return null;
  const given = reuse(size.h, Math.max(1, w), Math.max(1, h));
  if (given) return given;
  let shelf = shelves.find((s) => s.h === size.h && s.used + size.w <= side);
  if (!shelf) {
    if (nextY + size.h + GUTTER > side) {
      full = true;
      wantedArea = size.w * size.h;
      if (!crowded() && !warned && import.meta.env.DEV) console.error('overlay: the label atlas is full');
      warned = true;
      return null;
    }
    shelf = { y: nextY, h: size.h, used: 0 };
    shelves.push(shelf);
    nextY += size.h + GUTTER;
  }
  const slot = { x: shelf.used, y: shelf.y, w: size.w, h: size.h };
  shelf.used += size.w + GUTTER;
  placedArea += size.w * size.h;
  return slot;
}

/** Whether the atlas is full of slots given back, and so worth packing again. */
const crowded = (): boolean => full && (spareArea >= REPACK_SPARE * side * side
  || spareArea >= REPACK_WANTED * wantedArea || placedArea - spareArea <= REPACK_LIVE * side * side);

/** Whether the atlas should be emptied for every label shown to be painted again: full of slots given back. */
export const atlasCrowded = crowded;

/** The atlas's side for labels painted at `ratio` canvas pixels per px of their art. */
function sideFor(ratio: number): number {
  const grown = Math.ceil((SIDE_PER_RATIO * ratio) / SIDE_STEP) * SIDE_STEP;
  return Math.min(MOST_SIDE, Math.max(SIDE_MIN, grown));
}

/**
 * Empties the atlas, for labels painted at up to `ratio` canvas pixels per px of their art: every slot is free again,
 * and the atlas is the size for that ratio (made again on its next use when that changed: the labels' material takes
 * it from `atlasTexture`).
 */
export function clearAtlas(ratio: number): void {
  const wanted = sideFor(ratio);
  if (wanted !== side) {
    side = wanted;
    rows = new AtlasRows(side, GUTTER);
  }
  shelves.length = 0;
  spare.clear();
  rows.forget();
  nextY = 0;
  spareArea = 0;
  placedArea = 0;
  full = false;
  wantedArea = 0;
  warned = false;
}

/** The share of the atlas's rows its shelves take (the perf report's). */
export const atlasUse = (): number => nextY / side;

/** Gives a slot back for the next label it holds. */
export function freeSlot(slot: Slot): void {
  let list = spare.get(slot.h);
  if (!list) spare.set(slot.h, (list = []));
  list.push(slot);
  spareArea += slot.w * slot.h;
}

/** The context a label is painted on, cleared over its slot and held to it, and how far along it the slot starts
 *  (px: the art's own place). */
export function paintAt(slot: Slot): { c: CanvasRenderingContext2D; x: number } {
  return rows.paint(slot);
}

/** The label painted on `slot` done, sent with the frame (`sendPainted`): false where it can't be yet (the engine
 *  not started), the label to be painted again. */
export function uploadSlot(slot: Slot): boolean {
  rows.painted(slot);
  return atlasReady();
}

/** The slots painted since the last frame sent to the atlas, a copy a run of them side by side: before the engine
 *  draws the frame. */
export function sendPainted(): void {
  rows.send();
}
