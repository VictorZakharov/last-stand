// What something adds to the frame round a point of the world, as the player sees it (tools/lab `draw`): the frame
// drawn by the game's own camera as it is, and drawn again with that thing hidden, compared pixel by pixel in a box
// round the point's place on the screen. A pixel counts as its when its light rose by a tenth of white or more (the
// light as an SDR screen shows it, gamma 2.2, Rec. 709's weights), and as its glare by 0.4 or more; its glare's largest
// patch says whether it glared as one blob. An SDR canvas only, as the lab draws.
import * as THREE from 'three';
import type { Lab } from './lab';
import { G } from '../../../src/state';
import { drawFrame, type Canvas } from './light';
import { largestPatch } from './patches';

/** the box's half side, a share of the frame's height */
const BOX = 0.12;
/** a pixel's light must rise this much (a share of white) to count as the thing's, and this much to count as glare */
const SEEN_RISE = 0.1;
const GLARE_RISE = 0.4;

/** What a thing added round its point: its pixels and their share of the frame's, its strongest rise, where it was. */
export interface Added {
  /** whether the point was in front of the camera and on the screen */
  onScreen: boolean;
  /** the pixels whose light it raised by `SEEN_RISE` or more */
  pixels: number;
  /** those as a share of the frame's pixels */
  share: number;
  /** the pixels whose light it raised by `GLARE_RISE` or more, as a share of the frame's */
  glare: number;
  /** the largest patch of those, as a share of the frame's pixels */
  blob: number;
  /** the most it raised a pixel's light (a share of white) */
  strongest: number;
  /** the point on the screen, shares of its width and height from its top left */
  x: number;
  y: number;
}

/** A pixel's light as an SDR screen shows it, a share of white. */
function lightAt(canvas: Canvas, at: number): number {
  const { pixels } = canvas;
  const red = Math.max(0, pixels[at]) ** 2.2;
  const green = Math.max(0, pixels[at + 1]) ** 2.2;
  const blue = Math.max(0, pixels[at + 2]) ** 2.2;
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/**
 * What `hide` takes away round `point`: the frame drawn as it is, then with `hide()` done (it returns the undoing,
 * which is done after), and the box round the point compared.
 */
export function addedRound(lab: Lab, point: THREE.Vector3, hide: () => () => void): Added {
  const ndc = point.clone().project(G.camera);
  const x = (ndc.x + 1) / 2;
  const y = (1 - ndc.y) / 2;
  const nothing: Added = { onScreen: false, pixels: 0, share: 0, glare: 0, blob: 0, strongest: 0, x, y };
  if (ndc.z > 1 || x < 0 || x > 1 || y < 0 || y > 1) return nothing;
  const shown = drawFrame(lab);
  const show = hide();
  let hidden: Canvas;
  try {
    hidden = drawFrame(lab);
  } finally {
    show();
  }
  const { width, height } = shown;
  const half = Math.round(BOX * height);
  // (the canvas reads from its bottom row up)
  const column = Math.round(x * width);
  const row = Math.round((1 - y) * height);
  const left = Math.max(0, column - half);
  const bottom = Math.max(0, row - half);
  const columns = Math.min(width, column + half) - left;
  const rows = Math.min(height, row + half) - bottom;
  const glaring = new Uint8Array(columns * rows);
  let pixels = 0;
  let glare = 0;
  let strongest = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      const at = ((bottom + r) * width + left + c) * 4;
      const rise = lightAt(shown, at) - lightAt(hidden, at);
      if (rise >= SEEN_RISE) pixels++;
      if (rise >= GLARE_RISE) {
        glare++;
        glaring[r * columns + c] = 1;
      }
      strongest = Math.max(strongest, rise);
    }
  }
  const all = width * height;
  const blob = largestPatch(glaring, columns, rows) / all;
  return { onScreen: true, pixels, share: pixels / all, glare: glare / all, blob, strongest, x, y };
}
