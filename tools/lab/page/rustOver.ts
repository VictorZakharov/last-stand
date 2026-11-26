// `lab rustcheck`'s check of the outline drawn by the engine (engine/outlined.ts, Bulwark's gpu/outline.rs): the
// hero outlined shows in the page's picture, another barely shown
// in its place leaves nothing of the first, and none is left once it's let go. Read off the page's picture: the
// canary hands the engine none while the page still outlines him. (Drawn by three on a canvas over the engine's, an
// outline cost a phone that canvas's passes over the screen: 10.9 ms a frame, a report from play, 64P8-0VPK.)
import type { Lab } from './lab';
import { type Checked, failed, passed, pictureIn } from './rustPixels';
import { G } from '../../../src/state';
import { outline } from '../../../src/ui/overlay/outline';
import { overCanvasLeftOut, overFrame } from '../../../src/core/renderer';

/** the outline's colours here: one no scene has (magenta), then another barely shown */
const FIRST = 0xff00ff;
const THEN = 0x00ff00;
const FAINT = 0.02;
/** the frames an outline is given to show, and the least pixels of the first that must (of the page's picture) */
const FRAMES = 3;
const SHOWN_LEAST = 40;

/** How many of a picture's pixels are the first outline's colour: red and blue high, green low. */
function magenta(picture: ImageData): number {
  const { data } = picture;
  let count = 0;
  for (let at = 0; at < data.length; at += 4) {
    if (data[at] > 180 && data[at + 2] > 180 && data[at + 1] < 110) count++;
  }
  return count;
}

/** The page pictured with the hero outlined in `colour` at `strength` (none: nothing outlined) for a few frames. */
async function outlined(lab: Lab, colour: number | null, strength: number, label: string): Promise<ImageData> {
  for (let frame = 0; frame < FRAMES; frame++) {
    outline(colour === null ? null : G.player.obj, colour ?? 0, strength);
    await lab.step(1);
  }
  return pictureIn(lab, undefined, label);
}

/**
 * The hero outlined by the engine: in the page's picture, nothing of it left under
 * another outline barely shown, none once let go. The canary: the engine handed nothing while the page outlines
 * him, and no outline may show.
 */
export async function overCanvasCleared(lab: Lab): Promise<Checked> {
  const drawing = lab.drawing;
  lab.drawing = true;
  const send = overFrame.labels;
  try {
    const before = magenta(await outlined(lab, THEN, FAINT, 'before an outline'));
    const first = magenta(await outlined(lab, FIRST, 1, 'the hero outlined')) - before;
    const leftOut = overCanvasLeftOut();
    const after = magenta(await outlined(lab, THEN, FAINT, 'another outline in its place')) - before;
    const gone = magenta(await outlined(lab, null, 0, 'let go')) - before;
    overFrame.labels = () => send(false);
    const canary = magenta(await outlined(lab, FIRST, 1, 'the canary: handed over as none')) - before;
    overFrame.labels = send;
    if (first < SHOWN_LEAST) return failed(`the hero's outline showed in ${first} pixels: none was drawn over the frame`);
    if (!leftOut) return failed('with the hero outlined three\'s canvas is laid over the frame');
    if (after > first / 20) return failed(`${after} of the first outline's ${first} pixels are left under the next frame's`);
    if (gone > first / 20) return failed(`${gone} of the outline's ${first} pixels are left once it's let go`);
    if (canary > first / 2) return failed(`the canary: none handed to the engine, ${canary} pixels still showed`);
    return passed(`the hero outlined by the engine in ${first} pixels; ${after} left under `
      + `another, ${gone} once let go (the canary, none handed over: ${canary})`);
  } finally {
    overFrame.labels = send;
    outline(null);
    await lab.step(2);
    lab.drawing = drawing;
  }
}
