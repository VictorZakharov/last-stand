// `lab rustcheck`'s checks of the game's own look over the Rust engine's frame (`src/engine/frameLook.ts`): photo
// mode's look reaches the grade, the blood shows round the screen's edges at low health, and a picture taken of the
// frame holds it (a photo, a bug report's shot: read from three's canvas they were blank).
import type { Clip, Lab } from './lab';
import { frameShot } from '../../../src/core/renderer';
import { NEUTRAL_LOOK, applyPhotoLook } from '../../../src/core/photoLook';
import { type Checked, failed, passed, pictureIn } from './rustPixels';

/** how many times the colour of the frame under photo mode's look of twice the saturation must be its colour
 *  under one of none (each block's spread of its channels apart from the frame's mean tint, of 255: on the
 *  village's square 7.5 and 1.4, as played 3.9) */
const RICH_OVER_GREY = 3;
/** the share of the screen's height read along its top edge, and how much redder than green its blood must be
 *  there (of 255) against the frame without it */
const EDGE = 0.07;
const BLOOD_REDDER = 12;
/** the share of his Health he's held at for the blood, and the frames the look is given to come */
const NEXT_TO_NONE = 0.04;
const SETTLE_FRAMES = 60;
/** a picture's mean light below which it's blank (of 255) */
const BLANK = 4;
/** the share of the screen read for the look each side of its middle, across and down: the scene, none of the HUD
 *  (the engine draws the UI's panels on its own canvas, and the look leaves their colours be) */
const SCENE_HALF: [number, number] = [0.3, 0.25];

/** The screen's middle, where the scene is and none of the HUD. */
function sceneMiddle(): Clip {
  const width = Math.round(innerWidth * SCENE_HALF[0] * 2);
  const height = Math.round(innerHeight * SCENE_HALF[1] * 2);
  return { x: Math.round((innerWidth - width) / 2), y: Math.round((innerHeight - height) / 2), width, height };
}

/** the side of the blocks colour is read over (px): the grain's colour, pixel by pixel, averages away in one */
const BLOCK = 8;

/** The mean of the picture's block at block column `column`, row `row`: its red, green and blue. */
function blockMean(picture: ImageData, column: number, row: number): [number, number, number] {
  const sums: [number, number, number] = [0, 0, 0];
  for (let y = row * BLOCK; y < (row + 1) * BLOCK; y++) {
    for (let x = column * BLOCK; x < (column + 1) * BLOCK; x++) {
      const at = (y * picture.width + x) * 4;
      for (let channel = 0; channel < 3; channel++) sums[channel] += picture.data[at + channel];
    }
  }
  return [sums[0] / BLOCK ** 2, sums[1] / BLOCK ** 2, sums[2] / BLOCK ** 2];
}

/** Each block's colour apart from its grey: its channels less their mean. */
function chromasOf(picture: ImageData): number[][] {
  const columns = Math.floor(picture.width / BLOCK);
  const rows = Math.floor(picture.height / BLOCK);
  const chromas: number[][] = [];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const mean = blockMean(picture, column, row);
      const grey = (mean[0] + mean[1] + mean[2]) / 3;
      chromas.push(mean.map((channel) => channel - grey));
    }
  }
  return chromas;
}

/** How much colour the picture has: its blocks' mean spread of their channels apart from the frame's mean tint (a
 *  tint over everything reads as none), the grain's left out. */
function colourOf(picture: ImageData): number {
  const chromas = chromasOf(picture);
  const count = Math.max(1, chromas.length);
  const tint = [0, 1, 2].map((channel) => chromas.reduce((sum, chroma) => sum + chroma[channel], 0) / count);
  let spread = 0;
  for (const chroma of chromas) {
    const apart = chroma.map((channel, at) => channel - tint[at]);
    spread += Math.max(...apart) - Math.min(...apart);
  }
  return spread / count;
}

/** How much redder than green the picture's top rows are, on average. */
function redOver(picture: ImageData): number {
  const rows = Math.max(1, Math.round(picture.height * EDGE));
  let red = 0;
  for (let at = 0; at < rows * picture.width * 4; at += 4) red += picture.data[at] - picture.data[at + 1];
  return red / (rows * picture.width);
}

/** The scene's colour under photo mode's look at `saturation`. */
async function colourAt(lab: Lab, saturation: number): Promise<number> {
  applyPhotoLook({ ...NEUTRAL_LOOK, saturation }, true);
  await lab.step(2);
  return colourOf(await pictureIn(lab, sceneMiddle(), `the frame, photo mode's look at saturation ${saturation}`));
}

/**
 * Photo mode's look at no saturation and at twice it: the scene drawn near grey and richer. The canary: the frame
 * as played lies between them.
 */
export async function photoLookDrawn(lab: Lab): Promise<Checked> {
  await lab.step(2);
  const plain = colourOf(await pictureIn(lab, sceneMiddle(), 'the frame as played'));
  let grey = 0;
  let rich = 0;
  try {
    grey = await colourAt(lab, 0);
    rich = await colourAt(lab, 2);
  } finally {
    applyPhotoLook(NEUTRAL_LOOK, false);
    await lab.step(2);
  }
  const said = `the scene's colour ${grey.toFixed(1)} of 255 under photo mode's look of no saturation, `
    + `${plain.toFixed(1)} as played, ${rich.toFixed(1)} at twice the saturation`;
  if (rich < grey * RICH_OVER_GREY) return failed(`photo mode's look doesn't reach the engine's frame: ${said}`);
  if (plain <= grey || plain >= rich) return failed(`the canary: the frame as played isn't between the two: ${said}`);
  return passed(said);
}

/**
 * At next to no Health the blood shows along the screen's top edge. The canary: at full Health it isn't there.
 */
export async function bloodAtLowHealth(lab: Lab): Promise<Checked> {
  // (his Health held, as `lab health` holds it: the game sets the look from it each frame)
  const held = lab.lifeShare;
  lab.lifeShare = 1;
  await lab.step(SETTLE_FRAMES);
  const well = redOver(await pictureIn(lab, undefined, 'the frame at full Health'));
  lab.lifeShare = NEXT_TO_NONE;
  let low = 0;
  try {
    await lab.step(SETTLE_FRAMES);
    low = redOver(await pictureIn(lab, undefined, 'the frame at next to no Health'));
  } finally {
    lab.lifeShare = held;
    await lab.step(SETTLE_FRAMES);
  }
  const said = `the top edge's red over its green: ${well.toFixed(1)} of 255 at full Health, ${low.toFixed(1)} at next to none`;
  if (low - well < BLOOD_REDDER) return failed(`no blood round the screen's edges at low Health: ${said}`);
  return passed(said);
}

/** A picture taken of the frame in its own task, as photo mode takes one, holds the frame. */
export async function frameShotHoldsTheFrame(lab: Lab): Promise<Checked> {
  let light = -1;
  frameShot.take = (canvas) => {
    const side = 64;
    const small = document.createElement('canvas');
    small.width = side;
    small.height = side;
    const context = small.getContext('2d', { willReadFrequently: true })!;
    context.drawImage(canvas, 0, 0, side, side);
    const { data } = context.getImageData(0, 0, side, side);
    light = data.reduce((sum, value, at) => (at % 4 === 3 ? sum : sum + value), 0) / (side * side * 3);
  };
  const drawing = lab.drawing;
  lab.drawing = true;
  try {
    await lab.step(1);
  } finally {
    lab.drawing = drawing;
    frameShot.take = null;
  }
  if (light < 0) return failed('a picture asked of the frame was never taken: photo mode\'s shot would wait for ever');
  if (light < BLANK) return failed(`a picture taken of the frame is blank (its mean light ${light.toFixed(1)} of 255)`);
  return passed(`a picture taken of the frame holds it (its mean light ${light.toFixed(0)} of 255)`);
}
