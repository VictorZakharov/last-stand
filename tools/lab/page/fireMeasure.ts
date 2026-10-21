// tools/lab fire's measures: a fire read back three times from one camera at each moment, with its own light (what
// it draws unlit: its flames, glows and glow particles), without it, and without its smoke too, so the first's
// difference from the second is the fire's light alone, and the second's from the third its smoke (a pale wood smoke
// over the daylit forest lightens what's behind it: read as light, it was counted into the fire's tips). From them:
// how tall and wide the fire burns, its light and hue band by band from its base to its tips, how much of it is blown
// out white, its tongues (the parts its top breaks into), the detail within it, the smoke over it, and from one
// moment to the next how much of it moves and how its light swells; and seen from behind, whether it turns with the
// camera (`turningOf`). Pure functions over the pixels, so a canary is planted on the pixels as drawn.

/** A fire at one moment: the same camera's picture with its own light, without it, and without its smoke too, at the
 *  drawing buffer's pixels. */
export interface FireFrame {
  shown: ImageData;
  hidden: ImageData;
  bare: ImageData;
}

/** A band of the fire's height: its mean light where it's lit (a share of white) and its hue (degrees, 0 red, 60
 *  yellow), from its light summed. */
export interface Band {
  light: number;
  hue: number;
}

/** What one moment of a fire shows. */
export interface FrameStats {
  /** the fire's pixels lit, and its light in all (shares of white summed) */
  lit: number;
  total: number;
  /** the rows (from the top) and columns its light reaches, or null with none lit */
  extent: { top: number; bottom: number; left: number; right: number } | null;
  /** its bands from its base up (`BANDS` of them) */
  bands: Band[];
  /** the share of its lit pixels drawn white (every channel at the top) */
  white: number;
  /** the parts its top `TONGUE_SHARE` of height breaks into */
  tongues: number;
  /** how far its light spreads among its lit pixels (their deviation over their mean) */
  detail: number;
  /** the share of the picture above it that its smoke changes */
  smoke: number;
  /** its light alone, a share of white a pixel (for the next moment's change) */
  alone: Float32Array;
}

/** a pixel of the fire's own light this bright (a share of white) is lit */
export const LIT = 0.03;
/** a row or column is reached with this many lit pixels */
const ROW_LIT = 2;
/** the bands of height its colour is read in, from its base up */
export const BANDS = 4;
/** the share of its height at its top whose parts are its tongues, and the fewest pixels a part has */
const TONGUE_SHARE = 0.4;
const TONGUE_PIXELS = 6;
/** a pixel at or past this in every channel (0-255) is drawn white */
const WHITE_CHANNEL = 250;
/** a pixel the smoke changes by this much (a share of white) is under it */
const SMOKE_CHANGE = 0.01;

/** An encoded channel's light (gamma 2.2). */
const lightOf = (encoded: number): number => (encoded / 255) ** 2.2;

/** Rec. 709's light of red, green and blue lights. */
const luminance = (red: number, green: number, blue: number): number => 0.2126 * red + 0.7152 * green + 0.0722 * blue;

/** The hue of red, green and blue lights (degrees, 0 red, 60 yellow, 120 green), or 0 for grey. */
export function hueOf(red: number, green: number, blue: number): number {
  const most = Math.max(red, green, blue);
  const least = Math.min(red, green, blue);
  const chroma = most - least;
  if (chroma <= 0) return 0;
  let hue: number;
  if (most === red) hue = ((green - blue) / chroma) % 6;
  else if (most === green) hue = (blue - red) / chroma + 2;
  else hue = (red - green) / chroma + 4;
  return (hue * 60 + 360) % 360;
}

/** The light of the pixel at `at` (its first channel's index) of `image`, each channel. */
const rgbAt = (image: ImageData, at: number): number[] =>
  [lightOf(image.data[at]), lightOf(image.data[at + 1]), lightOf(image.data[at + 2])];

/** The fire's own light at each pixel (the shown picture's over the hidden's), each channel, and its luminance; and
 *  how far its smoke changes each (the hidden picture's from the bare one's). */
function fireAlone(frame: FireFrame): { rgb: Float32Array; alone: Float32Array; smoked: Float32Array } {
  const { shown, hidden, bare } = frame;
  const pixels = shown.width * shown.height;
  const rgb = new Float32Array(pixels * 3);
  const alone = new Float32Array(pixels);
  const smoked = new Float32Array(pixels);
  for (let pixel = 0; pixel < pixels; pixel++) {
    const at = pixel * 4;
    const shownRgb = rgbAt(shown, at);
    const hiddenRgb = rgbAt(hidden, at);
    const bareRgb = rgbAt(bare, at);
    for (let channel = 0; channel < 3; channel++) {
      rgb[pixel * 3 + channel] = Math.max(0, shownRgb[channel] - hiddenRgb[channel]);
    }
    alone[pixel] = luminance(rgb[pixel * 3], rgb[pixel * 3 + 1], rgb[pixel * 3 + 2]);
    smoked[pixel] = Math.abs(luminance(hiddenRgb[0], hiddenRgb[1], hiddenRgb[2])
      - luminance(bareRgb[0], bareRgb[1], bareRgb[2]));
  }
  return { rgb, alone, smoked };
}

/** The rows and columns `alone` is lit in (`ROW_LIT` pixels or more), or null with none. */
function extentOf(alone: Float32Array, width: number, height: number): FrameStats['extent'] {
  const rows = new Array<number>(height).fill(0);
  const columns = new Array<number>(width).fill(0);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (alone[y * width + x] < LIT) continue;
      rows[y]++;
      columns[x]++;
    }
  }
  const litRows = rows.flatMap((count, y) => (count >= ROW_LIT ? [y] : []));
  const litColumns = columns.flatMap((count, x) => (count >= ROW_LIT ? [x] : []));
  if (!litRows.length || !litColumns.length) return null;
  return {
    top: litRows[0],
    bottom: litRows[litRows.length - 1],
    left: litColumns[0],
    right: litColumns[litColumns.length - 1],
  };
}

/** The fire's bands from its base up over `extent`: each one's mean light where lit, and the hue of its light. */
function bandsOf(rgb: Float32Array, alone: Float32Array, width: number, extent: NonNullable<FrameStats['extent']>):
  Band[] {
  const span = extent.bottom - extent.top + 1;
  const sums = Array.from({ length: BANDS }, () => ({ red: 0, green: 0, blue: 0, light: 0, lit: 0 }));
  for (let y = extent.top; y <= extent.bottom; y++) {
    // (band 0 is the base: the lowest rows)
    const band = Math.min(BANDS - 1, Math.floor((extent.bottom - y) / span * BANDS));
    for (let x = extent.left; x <= extent.right; x++) {
      const pixel = y * width + x;
      if (alone[pixel] < LIT) continue;
      const sum = sums[band];
      sum.red += rgb[pixel * 3];
      sum.green += rgb[pixel * 3 + 1];
      sum.blue += rgb[pixel * 3 + 2];
      sum.light += alone[pixel];
      sum.lit++;
    }
  }
  return sums.map((sum) => ({
    light: sum.lit ? sum.light / sum.lit : 0,
    hue: hueOf(sum.red, sum.green, sum.blue),
  }));
}

/** The parts of `alone` lit in rows `from` to `to` (4-connected, `TONGUE_PIXELS` or more each). */
function partsIn(alone: Float32Array, width: number, from: number, to: number): number {
  const seen = new Uint8Array(alone.length);
  let parts = 0;
  for (let y = from; y <= to; y++) {
    for (let x = 0; x < width; x++) {
      const start = y * width + x;
      if (seen[start] || alone[start] < LIT) continue;
      if (fill(alone, seen, width, from, to, start) >= TONGUE_PIXELS) parts++;
    }
  }
  return parts;
}

/** Marks the lit part of rows `from` to `to` that `start` is in as seen; returns its pixels. */
function fill(alone: Float32Array, seen: Uint8Array, width: number, from: number, to: number, start: number): number {
  const stack = [start];
  seen[start] = 1;
  let pixels = 0;
  while (stack.length) {
    const pixel = stack.pop()!;
    pixels++;
    const x = pixel % width;
    const y = (pixel - x) / width;
    const next = [
      x > 0 ? pixel - 1 : -1,
      x < width - 1 ? pixel + 1 : -1,
      y > from ? pixel - width : -1,
      y < to ? pixel + width : -1,
    ];
    for (const other of next) {
      if (other < 0 || seen[other] || alone[other] < LIT) continue;
      seen[other] = 1;
      stack.push(other);
    }
  }
  return pixels;
}

/** How far the lit pixels' light spreads: their deviation over their mean. */
function detailOf(alone: Float32Array): number {
  let sum = 0;
  let squares = 0;
  let lit = 0;
  for (const light of alone) {
    if (light < LIT) continue;
    sum += light;
    squares += light * light;
    lit++;
  }
  if (!lit) return 0;
  const mean = sum / lit;
  return Math.sqrt(Math.max(0, squares / lit - mean * mean)) / mean;
}

/** The share of the rows above `top` that the smoke changes by `SMOKE_CHANGE` or more. */
function smokeOf(smoked: Float32Array, width: number, top: number): number {
  const above = top * width;
  if (above === 0) return 0;
  let changed = 0;
  for (let pixel = 0; pixel < above; pixel++) {
    if (smoked[pixel] >= SMOKE_CHANGE) changed++;
  }
  return changed / above;
}

/** The share of the fire's lit pixels the shown picture draws white. */
function whiteOf(shown: ImageData, alone: Float32Array): number {
  let lit = 0;
  let white = 0;
  for (let pixel = 0; pixel < alone.length; pixel++) {
    if (alone[pixel] < LIT) continue;
    lit++;
    const at = pixel * 4;
    const channels = [shown.data[at], shown.data[at + 1], shown.data[at + 2]];
    if (channels.every((channel) => channel >= WHITE_CHANNEL)) white++;
  }
  return lit ? white / lit : 0;
}

/** What `frame` shows of its fire. */
export function frameStats(frame: FireFrame): FrameStats {
  const { width, height } = frame.shown;
  const { rgb, alone, smoked } = fireAlone(frame);
  const extent = extentOf(alone, width, height);
  const lit = alone.reduce((count, light) => count + (light >= LIT ? 1 : 0), 0);
  const total = alone.reduce((sum, light) => sum + (light >= LIT ? light : 0), 0);
  if (!extent) {
    return { lit, total, extent, bands: [], white: 0, tongues: 0, detail: 0, smoke: 0, alone };
  }
  const tongueRows = Math.max(1, Math.round((extent.bottom - extent.top) * TONGUE_SHARE));
  return {
    lit,
    total,
    extent,
    bands: bandsOf(rgb, alone, width, extent),
    white: whiteOf(frame.shown, alone),
    tongues: partsIn(alone, width, extent.top, extent.top + tongueRows),
    detail: detailOf(alone),
    smoke: smokeOf(smoked, width, extent.top),
    alone,
  };
}

/** How much of the fire's light moved from `before` to `after`: the change summed over the light summed. */
export function changeBetween(before: Float32Array, after: Float32Array): number {
  let change = 0;
  let light = 0;
  for (let pixel = 0; pixel < after.length; pixel++) {
    change += Math.abs(after[pixel] - before[pixel]);
    light += Math.max(after[pixel], before[pixel]);
  }
  return light > 0 ? change / light : 0;
}

/** The frequency carrying most of `values`' swing (Hz, the values `step` s apart), from 0.5 Hz to half the rate, by
 *  a discrete Fourier transform of their deviation from their mean, and that swing's share of all of it. */
export function strongestFrequency(values: number[], step: number): { hz: number; share: number } {
  const count = values.length;
  const mean = values.reduce((sum, value) => sum + value, 0) / count;
  const powers: { hz: number; power: number }[] = [];
  for (let k = 1; k < count / 2; k++) {
    let real = 0;
    let imaginary = 0;
    for (let at = 0; at < count; at++) {
      const angle = 2 * Math.PI * k * at / count;
      real += (values[at] - mean) * Math.cos(angle);
      imaginary -= (values[at] - mean) * Math.sin(angle);
    }
    powers.push({ hz: k / (count * step), power: real * real + imaginary * imaginary });
  }
  const all = powers.reduce((sum, each) => sum + each.power, 0);
  const counted = powers.filter((each) => each.hz >= 0.5);
  if (!counted.length || all <= 0) return { hz: 0, share: 0 };
  const strongest = counted.reduce((most, each) => (each.power > most.power ? each : most));
  return { hz: strongest.hz, share: strongest.power / all };
}

/** `values`' deviation over their mean. */
export function swingOf(values: number[]): number {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (mean <= 0) return 0;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

/** How a fire seen from behind compares with its front: how alike its detail is to the mirror of the front's, and to
 *  the front's as it is (Pearson's correlation, -1 to 1). Fire's light passes through it, so from behind a flame is
 *  its own mirror image; a flame drawn on a sheet turned to the camera shows the same face from either side. */
export interface Turning {
  mirrored: number;
  unmirrored: number;
  /** how alike its front's detail is to its own mirror: a front as even both ways (a disc of coals seen edge on, a
   *  single symmetric flame) looks the same turned or not, and says nothing */
  even: number;
}

/** the detail a turning is read on: what's left of the light past its mean round each pixel this far (a share of
 *  the picture's width); the flames' shape alone, alike seen from any side, matched a sheet's mirror as well */
const DETAIL_REACH = 1 / 24;

/** `values` (`width` a row) mirrored left to right. */
export function mirroredOf(values: Float32Array, width: number): Float32Array {
  const mirrored = new Float32Array(values.length);
  for (let pixel = 0; pixel < values.length; pixel++) {
    const x = pixel % width;
    mirrored[pixel - x + (width - 1 - x)] = values[pixel];
  }
  return mirrored;
}

/** The sums of `values` (`width` a row) over every rectangle from the corner, a row and a column more than it. */
function summedOf(values: Float32Array, width: number): Float64Array {
  const height = values.length / width;
  const sums = new Float64Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y++) {
    let row = 0;
    for (let x = 0; x < width; x++) {
      row += values[y * width + x];
      sums[(y + 1) * (width + 1) + x + 1] = sums[y * (width + 1) + x + 1] + row;
    }
  }
  return sums;
}

/** `values` (`width` a row) less their mean over the square `reach` pixels round each (clipped at the edges). */
export function detailIn(values: Float32Array, width: number, reach: number): Float32Array {
  const height = values.length / width;
  const sums = summedOf(values, width);
  const at = (x: number, y: number) => sums[y * (width + 1) + x];
  const detail = new Float32Array(values.length);
  for (let y = 0; y < height; y++) {
    const top = Math.max(0, y - reach);
    const bottom = Math.min(height, y + reach + 1);
    for (let x = 0; x < width; x++) {
      const left = Math.max(0, x - reach);
      const right = Math.min(width, x + reach + 1);
      const sum = at(right, bottom) - at(left, bottom) - at(right, top) + at(left, top);
      detail[y * width + x] = values[y * width + x] - sum / ((right - left) * (bottom - top));
    }
  }
  return detail;
}

/** Pearson's correlation of `a` and `b` (0 where either is flat). */
export function correlationOf(a: Float32Array, b: Float32Array): number {
  const count = a.length;
  let sumA = 0;
  let sumB = 0;
  for (let at = 0; at < count; at++) {
    sumA += a[at];
    sumB += b[at];
  }
  const meanA = sumA / count;
  const meanB = sumB / count;
  let product = 0;
  let squaresA = 0;
  let squaresB = 0;
  for (let at = 0; at < count; at++) {
    product += (a[at] - meanA) * (b[at] - meanB);
    squaresA += (a[at] - meanA) ** 2;
    squaresB += (b[at] - meanB) ** 2;
  }
  return squaresA > 0 && squaresB > 0 ? product / Math.sqrt(squaresA * squaresB) : 0;
}

/** How the fire's light `back` (seen from the opposite side, at the same moment, its axis on the same column) compares
 *  with `front`, both `width` a row. */
export function turningOf(front: Float32Array, back: Float32Array, width: number): Turning {
  const reach = Math.max(1, Math.round(width * DETAIL_REACH));
  const frontDetail = detailIn(front, width, reach);
  const backDetail = detailIn(back, width, reach);
  return {
    mirrored: correlationOf(frontDetail, mirroredOf(backDetail, width)),
    unmirrored: correlationOf(frontDetail, backDetail),
    even: correlationOf(frontDetail, mirroredOf(frontDetail, width)),
  };
}

/** The median of `values` (0 with none). */
export function medianOf(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}
