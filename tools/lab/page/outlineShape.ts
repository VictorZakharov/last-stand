// The outline's shape against the thing it goes round (`lab outlines`): an outline is drawn magenta, a colour no
// scene has, and frames drawn at the same moment with no outline, the thing shown and hidden, give its silhouette
// (read with the outline drawn, its glow blended round the line changed as the thing went, and was taken for it). An outline pixel
// deep inside the silhouette is an edge the mask drew within the thing, an outline pixel far from it is a stray shape.
// From VictorZakharov/last-stand#973: the engine wrote a skinned mesh's mask without its bones, and a hero's outline
// in hero selection ran round his boots' rims and a sleeve held out beside him, as a body in its bind pose; and by
// the inverse of where he was bound, a glove of his floated beside him. A count of the outline's pixels passed both.
import type { Lab } from './lab';
import { drawFrame, type Canvas } from './light';
import { holdAdaptation } from '../../../src/core/renderer';
import { TUNE } from '../../../src/engine/globals';
import { outline, type OutlineTarget } from '../../../src/ui/overlay/outline';

/** The engine's outline, where the commit has one: an A/B's other side may be drawn by three, whose outline pass
 *  reads `outline`'s own state (a named import of a module that commit hasn't got stops its page loading). */
type EngineOutline = { outlineForEngine: (next: null) => void };
const ENGINE_OUTLINE = Object.values(import.meta.glob<EngineOutline>('../../../src/engine/outlined.ts',
  { eager: true }))[0];

/** The outline taken away for the frames drawn next, the engine's as well as the game's. */
function outlineTakenAway(): void {
  outline(null);
  ENGINE_OUTLINE?.outlineForEngine(null);
}
import type { Node } from './sceneApi.ts';

/** the outline's colour here: none of the game's scenes has it */
export const MAGENTA = 0xff00ff;
/** the frames an outline is given to reach the engine (the page sends it once a frame) */
const OUTLINE_FRAMES = 3;
/** the draws before one is read: the engine's first after a change isn't its steady one */
const STEADY_DRAWS = 2;
/** by how much of white a channel moves as the thing is hidden, for a pixel to be the thing's (the light he
 *  takes with him, a hall hero's key light, moves the floor round him a little) */
const SAME = 0.04;
/** how far round an outline pixel the thing must lie on every side for it to be deep inside, and how far out of the
 *  thing an outline pixel is a stray (px of the canvas): the line is some 3 px at the lab's screen, half of it over
 *  the thing's own edge. Read by rays meeting the thing within 14 px, the gaps between his legs and between his arm
 *  and body, which the line rightly fills, were 10% of his outline in the village, on three's commit too. */
const INSIDE_PX = 5;
const FAR_PX = 20;
/** the shares of the outline's pixels that may lie deep inside or far out (a pixel of a frame's grain, a strand of
 *  hair the silhouette's threshold missed) */
export const INSIDE_MOST = 0.02;
export const FAR_MOST = 0.02;

/** What an outline's shape read: its pixels, and the shares of them deep inside the thing and far from it. */
export interface OutlineShape {
  pixels: number;
  inside: number;
  far: number;
}

/** Whether pixel `at` (its first channel) is the outline's magenta. */
function isMagenta(pixels: Float32Array, at: number): boolean {
  return pixels[at] > 0.7 && pixels[at + 2] > 0.7 && pixels[at + 1] < 0.43;
}

/** A summed-area table of `marks` (`width` by `height`), one row and column of zeros before it. */
function summed(marks: Uint8Array, width: number, height: number): Uint32Array {
  const table = new Uint32Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y++) {
    let row = 0;
    for (let x = 0; x < width; x++) {
      row += marks[y * width + x];
      table[(y + 1) * (width + 1) + x + 1] = table[y * (width + 1) + x + 1] + row;
    }
  }
  return table;
}

/** How many of the marks a table sums lie within `reach` of (x, y), and the square's area, cut to the frame. */
function within(table: Uint32Array, width: number, height: number, x: number, y: number,
  reach: number): { marked: number; area: number } {
  const left = Math.max(0, x - reach);
  const right = Math.min(width, x + reach + 1);
  const top = Math.max(0, y - reach);
  const bottom = Math.min(height, y + reach + 1);
  const row = width + 1;
  const marked = table[bottom * row + right] - table[top * row + right] - table[bottom * row + left]
    + table[top * row + left];
  return { marked, area: (right - left) * (bottom - top) };
}

/** How many of `frame`'s pixels are the outline's magenta. */
function magentaIn(frame: Canvas): number {
  let count = 0;
  for (let at = 0; at < frame.pixels.length; at += 4) {
    if (isMagenta(frame.pixels, at)) count++;
  }
  return count;
}

/** The outline's pixels in `lined` and where they lie against the silhouette, `shown` against `hidden` (both drawn
 *  with no outline). */
export function shapeOf(lined: Canvas, shown: Canvas, hidden: Canvas): OutlineShape {
  const { width, height } = shown;
  const count = width * height;
  const line = new Uint8Array(count);
  const thing = new Uint8Array(count);
  for (let pixel = 0; pixel < count; pixel++) {
    const at = pixel * 4;
    if (isMagenta(lined.pixels, at)) line[pixel] = 1;
    const red = Math.abs(shown.pixels[at] - hidden.pixels[at]);
    const green = Math.abs(shown.pixels[at + 1] - hidden.pixels[at + 1]);
    const blue = Math.abs(shown.pixels[at + 2] - hidden.pixels[at + 2]);
    if (Math.max(red, green, blue) > SAME) thing[pixel] = 1;
  }
  const thingTable = summed(thing, width, height);
  let pixels = 0;
  let inside = 0;
  let far = 0;
  for (let pixel = 0; pixel < count; pixel++) {
    if (!line[pixel]) continue;
    pixels++;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    const round = within(thingTable, width, height, x, y, INSIDE_PX);
    if (round.marked === round.area) inside++;
    if (within(thingTable, width, height, x, y, FAR_PX).marked === 0) far++;
  }
  return { pixels, inside: pixels ? inside / pixels : 0, far: pixels ? far / pixels : 0 };
}

/** The frame drawn steady at this moment of the game. */
function steadyFrame(lab: Lab): Canvas {
  for (let draw = 0; draw < STEADY_DRAWS; draw++) drawFrame(lab);
  return drawFrame(lab);
}

/** `targets` outlined in magenta and read against the silhouette of `roots` (hidden for the second frame). The sun's
 *  shadows, the bloom and the eye's adaptation are held: a thing hidden takes its shadow, its glow round it and the
 *  eye's light with it. */
export async function outlineShape(lab: Lab, targets: OutlineTarget[], roots: Node[]): Promise<OutlineShape> {
  const shadows = TUNE.shadows;
  for (let frame = 0; frame < OUTLINE_FRAMES; frame++) {
    outline(targets, MAGENTA, 1);
    await lab.step(1);
  }
  const bloom = TUNE.bloom;
  TUNE.shadows = 0;
  TUNE.bloom = 0;
  holdAdaptation(true);
  const shown = roots.map((root) => root.visible);
  try {
    const lined = steadyFrame(lab);
    outlineTakenAway();
    const withThing = steadyFrame(lab);
    const left = magentaIn(withThing);
    if (left > 0) throw new Error(`outlines: ${left} pixels of outline drawn after it was taken away`);
    for (const root of roots) root.visible = false;
    const withoutThing = steadyFrame(lab);
    return shapeOf(lined, withThing, withoutThing);
  } finally {
    roots.forEach((root, index) => {
      root.visible = shown[index];
    });
    holdAdaptation(false);
    TUNE.shadows = shadows;
    TUNE.bloom = bloom;
    outline(null);
  }
}
