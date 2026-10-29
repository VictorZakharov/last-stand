// A frame's light as the canvas shows it, read back right after it was drawn (tools/lab `cast`): over the whole frame
// and by cells of a grid over it. Its brightness is a pixel's as stored, 0 to 255 by Rec. 709's weights on the
// encoded channels (the budget for an effect's light was taken that way from the owner's screenshots); its light, for
// the flashes, is the relative luminance a screen shows (gamma 2.2), a share of white. An SDR canvas only: the lab
// draws in SDR unless a command puts HDR on.
import { G } from '../../../src/state';
import { sampledPixels, type Sampled } from './sampledPixels';

/** the cells across and down the frame: each a sixteenth of it, about the area a flash is judged over */
export const CELLS = 4;
/** a pixel this bright or more, as stored, counts as bright */
const BRIGHT = 200;
/** the pixels read each way: every this many */
const SAMPLE_STEP = 2;
/** a finer grid's cells across and down the frame, about 30 pixels each on a 1920 by 1080 screen: a patch that pops
 *  for a frame or two shows in it (page/blinks.ts) */
export const FINE_ACROSS = 64, FINE_DOWN = 36;

/** A frame's light: the whole frame's and each cell's, the cells row by row from the top left. */
export interface FrameCells {
  /** the mean brightness as stored, 0 to 255 */
  mean: number;
  /** each cell's mean brightness as stored */
  cellMeans: number[];
  /** each cell's mean light, a share of white */
  cellLights: number[];
  /** the share of the pixels at least `BRIGHT` */
  brightShare: number;
  /** each fine cell's mean brightness as stored (`FINE_ACROSS` by `FINE_DOWN`, row by row from the top left) */
  fineMeans: Float32Array;
}

/** an encoded channel's light (gamma 2.2), by its stored value */
const LIGHT_OF = Float32Array.from({ length: 256 }, (_, value) => (value / 255) ** 2.2);

/** whether the pixels picked on the GPU have been checked against the whole canvas read back, on this page */
let pickingChecked = false;

/** The canvas's pixels as last drawn, bottom row first, and its size. */
function readCanvas(): { pixels: Uint8Array; width: number; height: number } {
  const gl = G.renderer.getContext();
  G.renderer.setRenderTarget(null);
  const width = gl.drawingBufferWidth;
  const height = gl.drawingBufferHeight;
  const pixels = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  return { pixels, width, height };
}

/** Throws unless `sampled` holds the colour of every `SAMPLE_STEP`th pixel of the whole canvas read back. */
function checkPicking(sampled: Sampled): void {
  const whole = readCanvas();
  for (let row = 0; row < sampled.height; row++) {
    for (let column = 0; column < sampled.width; column++) {
      const at = (row * sampled.width + column) * 4;
      const from = (row * SAMPLE_STEP * whole.width + column * SAMPLE_STEP) * 4;
      for (let channel = 0; channel < 3; channel++) {
        if (sampled.pixels[at + channel] === whole.pixels[from + channel]) continue;
        throw new Error(`lab: the pixels picked on the GPU differ from the canvas's at ${column}, ${row}`);
      }
    }
  }
}

/** The canvas's every `SAMPLE_STEP`th pixel each way as last drawn (`sampledPixels`), bottom row first. */
function sampleCanvas(): Sampled {
  const gl = G.renderer.getContext() as WebGL2RenderingContext & { drawingBufferFormat?: number };
  if (gl.drawingBufferFormat === gl.RGBA16F) {
    throw new Error('lab: cast: the canvas is HDR; its frames are read in SDR');
  }
  const sampled = sampledPixels(SAMPLE_STEP);
  if (!pickingChecked) checkPicking(sampled);
  pickingChecked = true;
  return sampled;
}

/** The frame last drawn, as its light. Read it in the frame it was drawn in: the canvas is cleared after. */
export function frameCells(): FrameCells {
  const { pixels, width: across, height: down } = sampleCanvas();
  const gl = G.renderer.getContext();
  const width = gl.drawingBufferWidth;
  const height = gl.drawingBufferHeight;
  const cellCount = CELLS * CELLS;
  const sums = new Float64Array(cellCount);
  const lights = new Float64Array(cellCount);
  const counts = new Float64Array(cellCount);
  const fineSums = new Float32Array(FINE_ACROSS * FINE_DOWN);
  const fineCounts = new Float32Array(FINE_ACROSS * FINE_DOWN);
  let bright = 0;
  for (let sampledRow = 0; sampledRow < down; sampledRow++) {
    // (the canvas reads from its bottom row up)
    const y = sampledRow * SAMPLE_STEP;
    const row = Math.min(CELLS - 1, Math.floor((height - 1 - y) / height * CELLS));
    const fineRow = Math.min(FINE_DOWN - 1, Math.floor((height - 1 - y) / height * FINE_DOWN));
    for (let sampledColumn = 0; sampledColumn < across; sampledColumn++) {
      const x = sampledColumn * SAMPLE_STEP;
      const at = (sampledRow * across + sampledColumn) * 4;
      const red = pixels[at];
      const green = pixels[at + 1];
      const blue = pixels[at + 2];
      const brightness = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
      const cell = row * CELLS + Math.min(CELLS - 1, Math.floor(x / width * CELLS));
      sums[cell] += brightness;
      lights[cell] += 0.2126 * LIGHT_OF[red] + 0.7152 * LIGHT_OF[green] + 0.0722 * LIGHT_OF[blue];
      counts[cell]++;
      const fine = fineRow * FINE_ACROSS + Math.min(FINE_ACROSS - 1, Math.floor(x / width * FINE_ACROSS));
      fineSums[fine] += brightness;
      fineCounts[fine]++;
      if (brightness >= BRIGHT) bright++;
    }
  }
  const sampled = counts.reduce((total, count) => total + count, 0);
  return {
    mean: sums.reduce((total, sum) => total + sum, 0) / sampled,
    cellMeans: Array.from(sums, (sum, cell) => sum / counts[cell]),
    cellLights: Array.from(lights, (light, cell) => light / counts[cell]),
    brightShare: bright / sampled,
    fineMeans: fineSums.map((sum, fine) => sum / fineCounts[fine]),
  };
}

/** A cell's place in the grid as words (`top left`, `second row, third`...). */
export function cellName(cell: number): string {
  const row = Math.floor(cell / CELLS);
  const column = cell % CELLS;
  return `row ${row + 1} of ${CELLS} from the top, column ${column + 1} from the left`;
}
