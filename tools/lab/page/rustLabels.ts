// `lab rustcheck`'s check of the world's labels drawn by the engine (engine/overlay.ts, Bulwark's gpu/overlay.rs):
// a label shown in the middle of the screen is in the page's picture, on the engine's canvas, with three's canvas
// left out of the page's frame (no outline to draw), and gone the frames after it's taken off. Read off the page's
// picture, never the labels' list: the canary hands the engine none while the list still has it. Drawn by three on a
// canvas of its own over the engine's, the browser laid that canvas over the frame whenever a label showed.
import type { Lab } from './lab';
import { type Checked, failed, passed, pictureIn } from './rustPixels';
import { Label, ORDER } from '../../../src/ui/overlay/layer';
import { overCanvasLeftOut, overFrame } from '../../../src/core/renderer';
import { outline } from '../../../src/ui/overlay/outline';

/** the label's size (px of its art) and the least of its pixels that must show in the page's picture */
const SIZE = { w: 160, h: 60 };
const SHOWN_LEAST = 2000;
/** the frames a change is given to show */
const FRAMES = 3;

/** How many of a picture's pixels are the label's colour (magenta: red and blue high, green low). */
function magenta(picture: ImageData): number {
  const { data } = picture;
  let count = 0;
  for (let at = 0; at < data.length; at += 4) {
    if (data[at] > 200 && data[at + 2] > 200 && data[at + 1] < 60) count++;
  }
  return count;
}

/** A magenta box shown as a label in the middle of the page. */
function boxLabel(): Label {
  const label = new Label(ORDER.marker);
  label.show({ w: SIZE.w, h: SIZE.h, paint: (context) => {
    context.fillStyle = '#ff00ff';
    context.fillRect(0, 0, SIZE.w, SIZE.h);
  } });
  label.ax = 0.5;
  label.ay = 0.5;
  label.x = innerWidth / 2;
  label.y = innerHeight / 2;
  label.shown = true;
  return label;
}

/** The page's magenta pixels a few frames on. */
async function magentaAfter(lab: Lab, label: string): Promise<number> {
  await lab.step(FRAMES);
  return magenta(await pictureIn(lab, undefined, label));
}

/**
 * A label in the middle of the screen drawn by the engine: its pixels in the page's picture with three's canvas
 * left out, none the frames after it's taken off. The canary: the engine handed no labels while the page's list has
 * the box, which must not show.
 */
export async function labelsByTheEngine(lab: Lab): Promise<Checked> {
  const drawing = lab.drawing;
  lab.drawing = true;
  outline(null);
  const before = await magentaAfter(lab, 'before the label');
  const label = boxLabel();
  const send = overFrame.labels;
  try {
    const shown = (await magentaAfter(lab, 'a label shown')) - before;
    const leftOut = overCanvasLeftOut();
    overFrame.labels = () => send(false);
    const canary = (await magentaAfter(lab, 'the canary: handed over as none')) - before;
    overFrame.labels = send;
    label.remove();
    const gone = (await magentaAfter(lab, 'the label taken off')) - before;
    if (shown < SHOWN_LEAST) return failed(`a label of ${SIZE.w} by ${SIZE.h} showed in ${shown} pixels: not drawn`);
    if (!leftOut) return failed('with a label shown and no outline three\'s canvas is still laid over the frame');
    if (gone > shown / 20) return failed(`${gone} of the label's ${shown} pixels are left once it's taken off`);
    if (canary > shown / 2) return failed(`the canary: none handed to the engine, ${canary} pixels still showed`);
    return passed(`a label drawn by the engine in ${shown} pixels; ${gone} left once taken `
      + `off (the canary, none handed over: ${canary})`);
  } finally {
    overFrame.labels = send;
    label.remove();
    await lab.step(2);
    lab.drawing = drawing;
  }
}
