// What the engine lays over its finished frame for the page (Bulwark's gpu/overlay.rs): the world's labels' atlas,
// each label's picture copied into it from the canvas it was painted on, and a row a label drawn in one instanced
// call after the grade, on the engine's own canvas (VictorZakharov/last-stand#973: three's canvas laid over the
// engine's for them, the browser blended a second canvas of the screen's pixels over the first each frame).
import { RUST, engineCanvas } from './index';

/** floats a row: its box on the screen (x, y, width, height, the engine's canvas's pixels), its slot's corners' uv,
 *  its share (Bulwark's `ROW_FLOATS`) */
export const OVERLAY_ROW = 9;

/** The engine's handle, none before it has started. */
const engine = () => RUST.bridge?.handle ?? null;

/** The atlas `side` pixels square (made again, cleared, when that changes); false before the engine has started. */
export function overlayAtlas(side: number): boolean {
  const handle = engine();
  if (!handle) return false;
  handle.overlay_atlas(side);
  return true;
}

/** The `w` by `h` pixels of `canvas` from `fromX`, `fromY` copied into the atlas at `x`, `y`; false if it can't be
 *  yet. */
export function overlayPaint(
  canvas: HTMLCanvasElement, fromX: number, fromY: number, w: number, h: number, x: number, y: number,
): boolean {
  return engine()?.overlay_paint(canvas, fromX, fromY, w, h, x, y) ?? false;
}

/**
 * The rows drawn over the engine's next frames: `count` of `rows`, each box in pixels of a frame `width` by `height`
 * (three's canvas's, which the page places by), drawn on the engine's canvas at its own size: at a level that draws
 * the scene at fewer pixels than the screen's the labels are drawn at those too.
 */
export function overlayRows(rows: Float32Array, count: number, width: number, height: number): void {
  const handle = engine();
  const canvas = engineCanvas();
  if (!handle || !canvas) return;
  const sx = canvas.width / Math.max(1, width);
  const sy = canvas.height / Math.max(1, height);
  const used = rows.subarray(0, count * OVERLAY_ROW);
  if (sx !== 1 || sy !== 1) {
    for (let at = 0; at < used.length; at += OVERLAY_ROW) {
      used[at] *= sx;
      used[at + 1] *= sy;
      used[at + 2] *= sx;
      used[at + 3] *= sy;
    }
  }
  handle.overlay_rows(used, canvas.width, canvas.height);
}
