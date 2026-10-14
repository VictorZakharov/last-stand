// What pops on the screen for a frame or a few and goes back (tools/lab `cast`): a patch of the fine grid
// (page/screenCells.ts) brightening from the frame before and back near it within a few frames. A mesh showing
// through the floor for a frame, a flicker where two surfaces meet, a light reaching what it shouldn't: each is a
// blink, as is an effect's own crackle, so they're listed, not judged. (Thunder Crescent showed a pale flicker on the
// floor behind the hero for a frame or two.)
import { FINE_ACROSS, FINE_DOWN } from './screenCells';

/** a cell brightening this much over the frame before counts (as stored, 0 to 255) */
const RISE = 20;
/** and back within this many frames, to within this share of its rise over the frame before */
const MOST_FRAMES = 3;
const BACK = 0.3;
/** the largest listed */
const LISTED = 6;

/** A patch that popped: its first frame, how long, where (its brightest cell), by how much, and how many cells. */
export interface Blink {
  frame: number;
  frames: number;
  cell: number;
  rise: number;
  cells: number;
}

/** The blinks through `frames` (each frame's fine cells' means), one for each first frame and length, at the cell
 *  that rose most then. */
export function blinksIn(frames: Float32Array[]): Blink[] {
  const found = new Map<string, Blink>();
  for (let cell = 0; cell < FINE_ACROSS * FINE_DOWN; cell++) {
    for (let frame = 1; frame < frames.length; frame++) {
      const before = frames[frame - 1][cell];
      const rise = frames[frame][cell] - before;
      if (rise < RISE) continue;
      const back = backAfter(frames, cell, frame, before + rise * BACK);
      if (back < 0) continue;
      const key = `${frame} ${back - frame}`;
      const blink = found.get(key);
      if (!blink) found.set(key, { frame, frames: back - frame, cell, rise, cells: 1 });
      else {
        blink.cells++;
        if (rise > blink.rise) Object.assign(blink, { cell, rise });
      }
      frame = back;
    }
  }
  return [...found.values()].sort((a, b) => b.rise - a.rise);
}

/** The first frame after `from`, within `MOST_FRAMES`, where `cell` is back to `level` or under; -1 if none. */
function backAfter(frames: Float32Array[], cell: number, from: number, level: number): number {
  const last = Math.min(frames.length - 1, from + MOST_FRAMES);
  for (let frame = from + 1; frame <= last; frame++) {
    if (frames[frame][cell] <= level) return frame;
  }
  return -1;
}

/** The blinks as lines: how many, and the largest, each at its time from the press (`frameTime` s a frame). */
export function describeBlinks(blinks: Blink[], frameTime: number): string[] {
  const what = `a patch brightening by ${RISE} or more and back within ${MOST_FRAMES} frames`;
  const head = `  blinks (${what}): ${blinks.length}`;
  return [head, ...blinks.slice(0, LISTED).map((blink) => `    ${describeBlink(blink, frameTime)}`)];
}

/** A blink as words. */
function describeBlink(blink: Blink, frameTime: number): string {
  const across = ((blink.cell % FINE_ACROSS + 0.5) / FINE_ACROSS * 100).toFixed(0);
  const down = ((Math.floor(blink.cell / FINE_ACROSS) + 0.5) / FINE_DOWN * 100).toFixed(0);
  const at = `${(blink.frame * frameTime).toFixed(3)} s (frame ${blink.frame})`;
  const size = `${blink.cells} cell${blink.cells > 1 ? 's' : ''}`;
  return `at ${at}, ${across}% across and ${down}% down, +${blink.rise.toFixed(0)} for ${blink.frames} frames, ${size}`;
}
