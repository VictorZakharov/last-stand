// The particles' picture at rest against the lobby logo (tools/lab `wind`): pictures of one patch of the screen at its
// own pixels, the particles' laid over what lies behind them as the page lays a canvas over it, how many of their
// pixels are apart and how far, and the move of one over the other that fits it best (which way the logo jumps).

/** A patch of the screen's pixels: RGBA, rows from the top. */
export interface Patch {
  width: number;
  height: number;
  data: Uint8ClampedArray<ArrayBuffer>;
}

/** How far a pixel's channels may be apart before it counts as apart (of 255): past the rounding of one picture's two
 *  copies composited two ways (a canvas's premultiplied pixels, an image's) */
export const APART = 8;
/** how far a pixel must stand from what lies behind the logo to count as the logo's (of 255) */
const SHOWN = 2;
/** the moves tried: up to 2 px each way, in quarter pixels */
const MOST_MOVE = 2, MOVE_STEP = 0.25;
/** the patch's edge left out of a move's fit (px), which a move takes past the patch */
const FIT_EDGE = 3;

/** The patch's pixels from a picture of it (a PNG's data URL), as they are: no colour space or alpha conversion. */
export async function patchOf(png: string): Promise<Patch> {
  const blob = await (await fetch(png)).blob();
  const bitmap = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('lab: wind: no 2D canvas to read a picture with');
  context.drawImage(bitmap, 0, 0);
  const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
  return { width: bitmap.width, height: bitmap.height, data };
}

/** The patch as a PNG's data URL, for a report's pictures. */
export function pngOf(patch: Patch): string {
  const canvas = document.createElement('canvas');
  canvas.width = patch.width;
  canvas.height = patch.height;
  canvas.getContext('2d')?.putImageData(new ImageData(patch.data, patch.width, patch.height), 0, 0);
  return canvas.toDataURL('image/png');
}

/** The particles' picture (premultiplied, as the exit's canvas holds it) laid over the screen behind them, as the page
 *  lays the canvas over it. */
export function laidOver(particles: Patch, behind: Patch): Patch {
  const data = new Uint8ClampedArray(behind.data.length);
  for (let i = 0; i < data.length; i += 4) {
    const through = 1 - particles.data[i + 3] / 255;
    for (let channel = 0; channel < 3; channel++) {
      data[i + channel] = particles.data[i + channel] + behind.data[i + channel] * through;
    }
    data[i + 3] = 255;
  }
  return { width: behind.width, height: behind.height, data };
}

/** How far apart two pictures of the patch are: its pixels apart past APART, the most a channel is apart, the mean
 *  over the logo's pixels (those either picture holds other than what lies behind them), and how many those are. */
export interface Apart {
  apart: number;
  most: number;
  mean: number;
  logo: number;
}

/** How far apart `a` and `b` are, each pixel by its channel the most apart, `behind` saying which are the logo's. */
export function apartOf(a: Patch, b: Patch, behind: Patch): Apart {
  let apart = 0, most = 0, sum = 0, logo = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    const off = channelsApart(a, b, i);
    if (Math.max(channelsApart(a, behind, i), channelsApart(b, behind, i)) <= SHOWN) continue;
    logo++;
    sum += off;
    most = Math.max(most, off);
    if (off > APART) apart++;
  }
  return { apart, most, mean: logo ? sum / logo : 0, logo };
}

/** The most two pictures' channels are apart at the pixel whose red is at `i`. */
function channelsApart(a: Patch, b: Patch, i: number): number {
  const red = Math.abs(a.data[i] - b.data[i]);
  const green = Math.abs(a.data[i + 1] - b.data[i + 1]);
  return Math.max(red, green, Math.abs(a.data[i + 2] - b.data[i + 2]));
}

/** A picture of where two are apart: each pixel's channel the most apart, four times as bright. */
export function differenceOf(a: Patch, b: Patch): Patch {
  const data = new Uint8ClampedArray(a.data.length);
  for (let i = 0; i < data.length; i += 4) {
    data.fill(channelsApart(a, b, i) * 4, i, i + 3);
    data[i + 3] = 255;
  }
  return { width: a.width, height: a.height, data };
}

/** A move of one picture over another, device px: right and down. */
export interface Move {
  dx: number;
  dy: number;
}

/**
 * Where `b`'s picture stands against `a`'s: the move of `a` (in quarter pixels, up to 2 px each way) that fits `b`
 * best, both blurred a pixel first so a metal's grain, drawn otherwise in each, doesn't count. Whole pixels are tried
 * first, then quarters round the best of them.
 */
export function moveOf(a: Patch, b: Patch): Move {
  const from = blurred(lightOf(a), a.width, a.height);
  const to = blurred(lightOf(b), b.width, b.height);
  const offAt = (move: Move): number => movedOff(from, to, a.width, a.height, move);
  const whole = bestMove(offAt, { dx: 0, dy: 0 }, MOST_MOVE, 1);
  return bestMove(offAt, whole, 1 - MOVE_STEP, MOVE_STEP);
}

/** The move round `round` (`reach` each way in steps of `step`, within MOST_MOVE) that `offAt` finds best. */
function bestMove(offAt: (move: Move) => number, round: Move, reach: number, step: number): Move {
  let best = { ...round };
  let least = Infinity;
  for (let dy = round.dy - reach; dy <= round.dy + reach + 1e-9; dy += step) {
    for (let dx = round.dx - reach; dx <= round.dx + reach + 1e-9; dx += step) {
      if (Math.abs(dx) > MOST_MOVE + 1e-9 || Math.abs(dy) > MOST_MOVE + 1e-9) continue;
      const off = offAt({ dx, dy });
      if (off < least) {
        least = off;
        best = { dx, dy };
      }
    }
  }
  return best;
}

/** Each pixel's light (its channels' mean). */
function lightOf(patch: Patch): Float32Array {
  const light = new Float32Array(patch.width * patch.height);
  for (let i = 0; i < light.length; i++) {
    light[i] = (patch.data[i * 4] + patch.data[i * 4 + 1] + patch.data[i * 4 + 2]) / 3;
  }
  return light;
}

/** Each pixel the mean of the 3x3 round it (the edge's as far as the patch goes). */
function blurred(light: Float32Array, width: number, height: number): Float32Array {
  const out = new Float32Array(light.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0, count = 0;
      for (let v = Math.max(0, y - 1); v <= Math.min(height - 1, y + 1); v++) {
        for (let u = Math.max(0, x - 1); u <= Math.min(width - 1, x + 1); u++) {
          sum += light[v * width + u];
          count++;
        }
      }
      out[y * width + x] = sum / count;
    }
  }
  return out;
}

/** The mean light apart between `to` and `from` moved by `move` (read between its pixels), the edge left out. */
function movedOff(from: Float32Array, to: Float32Array, width: number, height: number, move: Move): number {
  let sum = 0, count = 0;
  for (let y = FIT_EDGE; y < height - FIT_EDGE; y++) {
    for (let x = FIT_EDGE; x < width - FIT_EDGE; x++) {
      sum += Math.abs(to[y * width + x] - between(from, width, x - move.dx, y - move.dy));
      count++;
    }
  }
  return count ? sum / count : 0;
}

/** `light` read at a point between its pixels, from the four round it. */
function between(light: Float32Array, width: number, x: number, y: number): number {
  const left = Math.floor(x), top = Math.floor(y);
  const across = x - left, down = y - top;
  const at = (u: number, v: number): number => light[v * width + u];
  const upper = at(left, top) * (1 - across) + at(left + 1, top) * across;
  const lower = at(left, top + 1) * (1 - across) + at(left + 1, top + 1) * across;
  return upper * (1 - down) + lower * down;
}
