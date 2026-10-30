// `lab spin`: mouse look turned one way for a long while in each close view, then the other way, as the player spins
// the view (the lab's browser plays the pointer lock). Chrome on Windows sends now and then a move of its own under
// the lock, about half the window's width in one event, as it puts its hidden cursor back: taken as the hand's, it
// turned the view by about 180 degrees at once, and back again spinning the other way (#318, from play: "the jump
// will happen if rotating to one side for the while", "if it jumped one way, rotate camera another way, it will jump
// back"). Mid-spin the browser's jump is sent as Chrome sends it; no frame may turn the view far past the spin's own
// steady turn. `canary` sends the jump twice running, as a hand's move the size of the one before is taken: the view
// turns round by about 180 degrees in a frame, which must be found.
import { middleOf } from './lab';
import type { Fixture, Lab, Report } from './lab';
import type { ViewMode } from '../../../src/core/renderer';
import { cameraYaw } from '../../../src/core/renderer';
import { G } from '../../../src/state';

/** What `lab spin` is given: the set-up, the close views it spins in, and whether the canary runs. */
export interface SpinOptions { fixture: Fixture; views: ViewMode[]; canary: boolean }

/** the frames each way, the hand's move a frame (css px), and the frame of each way the browser's jump comes in */
const SPIN_FRAMES = 240;
const STEP = 24;
const JUMP_AT = 150;
/** the browser's jump, as a share of the window's width */
const JUMP_SHARE = 0.5;
/** the most a frame may turn the view, as times the spin's steady turn a frame */
const MOST_TIMES = 3;
/** the frames the click is given to take the pointer */
const LOCK_FRAMES = 30;

/** One way's spin: the turn each frame (radians, signed the way it went) and the whole turn. */
interface Spun { turns: number[]; whole: number }

/** A move of the mouse under the lock, as the browser sends it to the page. */
function moveBy(dx: number): void {
  window.dispatchEvent(new MouseEvent('mousemove', { movementX: dx, movementY: 0, bubbles: true }));
}

/** The pointer locked for mouse look, as the player's click takes it. */
async function takeLock(lab: Lab): Promise<void> {
  lab.pointerLock(true);
  const canvas = G.renderer.domElement;
  if (document.pointerLockElement !== canvas) await lab.click(middleOf(canvas));
  await lab.until(() => document.pointerLockElement === canvas, LOCK_FRAMES, 'the click never took the pointer');
}

/** The view spun `way` (1 right, -1 left) for `SPIN_FRAMES` frames, the browser's jump sent mid-spin. */
async function spin(lab: Lab, way: number, canary: boolean): Promise<Spun> {
  const turns: number[] = [];
  let last = cameraYaw();
  const start = last;
  for (let frame = 0; frame < SPIN_FRAMES; frame++) {
    moveBy(way * STEP);
    if (frame === JUMP_AT) moveBy(way * innerWidth * JUMP_SHARE);
    if (canary && frame === JUMP_AT) moveBy(way * innerWidth * JUMP_SHARE);
    await lab.step(1);
    const yaw = cameraYaw();
    turns.push(yaw - last);
    last = yaw;
  }
  return { turns, whole: last - start };
}

/** The middle of a list of numbers. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/** One way's lines and problems: the steady turn, the most a frame turned and where, and the whole turn. */
function judged(view: ViewMode, way: string, spun: Spun): { lines: string[]; problems: string[] } {
  const steady = Math.abs(median(spun.turns));
  let most = 0;
  let mostAt = 0;
  spun.turns.forEach((turn, frame) => {
    if (Math.abs(turn) > most) {
      most = Math.abs(turn);
      mostAt = frame;
    }
  });
  const degrees = (radians: number): string => `${((radians * 180) / Math.PI).toFixed(1)}°`;
  const lines = [`${view}, ${way}: ${degrees(steady)} a frame steady, the most ${degrees(most)} at frame ${mostAt}, `
    + `${degrees(Math.abs(spun.whole))} in all`];
  const problems: string[] = [];
  if (steady < 1e-4) problems.push(`${view}, ${way}: the view never turned with the mouse`);
  else if (most > steady * MOST_TIMES) {
    problems.push(`${view}, ${way}: the view jumped ${degrees(most)} in a frame (frame ${mostAt}), `
      + `${(most / steady).toFixed(0)} times the spin's turn`);
  }
  return { lines, problems };
}

/** `lab spin`: the view spun each way in each close view, Chrome's jump under the lock sent mid-spin. */
export async function spinView(lab: Lab, options: SpinOptions): Promise<Report> {
  const lines: string[] = [];
  const problems: string[] = [];
  for (const view of options.views) {
    await lab.setup({ ...options.fixture, view });
    await takeLock(lab);
    for (const [way, sign] of [['right', 1], ['left', -1]] as const) {
      const found = judged(view, way, await spin(lab, sign, options.canary));
      lines.push(...found.lines);
      problems.push(...found.problems);
    }
  }
  await lab.setup({ ...options.fixture, view: 'top' });
  lab.pointerLock(false);
  lines.push(...problems.map((problem) => `! ${problem}`));
  if (!options.canary) return { text: lines.join('\n'), problems };
  const caught = problems.length === options.views.length * 2;
  lines.push(`canary: the view turned round in a frame ${caught ? 'caught every time' : 'went unseen'}`);
  return { text: lines.join('\n'), problems: caught ? [] : ['canary: a turn of 180° in a frame went unseen'] };
}
