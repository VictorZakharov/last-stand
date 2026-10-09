// A run's footfalls drawn as gait analysis draws them (a footfall diagram, after Hildebrand), for `lab gait --frames`:
// a character a frame for each foot, on the ground or in the air, each stride's start marked with why it left, and
// under each foot the walk cycle's own plan for it (its swing's window), so a stride out of its window and two feet in
// the air together show at a glance over a whole run; a row beneath marks the frames the run's measures caught (the
// gallops, the hops, both thighs swinging forward at once). Read frame by frame from the trace, the same faults took
// a scenario's two hundred lines to see.
import type { LegIK } from '../../../src/entities/models/ik';

/** frames a row of the diagram */
const ROW = 100;
/** what a foot's frame is drawn as: on the ground, in the air */
const DOWN = '█';
const UP = '·';
/** the cycle's plan under a foot: its swing's window, and outside it */
const WINDOW = '▔';
const OUTSIDE = ' ';

/** One frame of both feet: each one on the ground or not, and in its swing's window or not (moving only). */
interface FootFrame {
  down: [boolean, boolean];
  inWindow: [boolean, boolean];
}

/** The feet frame by frame, as the IK has them. */
export class FootfallWatch {
  readonly frames: FootFrame[] = [];

  /** A frame of the feet: each one down (planted) or not, and in its window (`Foot.window` 0 to 1) while moving. */
  observe(legs: LegIK, moving: boolean): void {
    const feet = legs.feet;
    const within = (window: number) => moving && window >= 0 && window <= 1;
    this.frames.push({
      down: [feet[0].state === 'plant', feet[1].state === 'plant'],
      inWindow: [within(feet[0].window), within(feet[1].window)],
    });
  }
}

/** A stride's start, for the diagram: its foot, its frame and why it left (`Step.how`). */
export interface Departure {
  foot: number;
  left: number;
  how: string;
}

/** The marks a run's measures put under the diagram: a letter at each of their frames. */
export interface Marks {
  /** the frames a stride left galloping, both feet left or landed together, and both thighs swung forward at once */
  gallops: number[];
  hops: number[];
  together: number[];
}

/** The letter a stride's start is drawn as: why it left. */
function departureLetter(how: string): string {
  if (how.includes('closing')) return 'c';
  if (how.includes('early')) return 'e';
  if (how.includes('late')) return 'l';
  if (how.includes('timed')) return 't';
  return '^';
}

/** A foot's row: on the ground or in the air each frame, its strides' starts by their letters. */
function footRow(frames: FootFrame[], foot: number, departures: Departure[]): string[] {
  const row: string[] = frames.map((frame) => (frame.down[foot] ? DOWN : UP));
  for (const departure of departures) {
    if (departure.foot === foot && departure.left < row.length) row[departure.left] = departureLetter(departure.how);
  }
  return row;
}

/** A foot's plan: in its swing's window each frame, or not. */
function planRow(frames: FootFrame[], foot: number): string[] {
  return frames.map((frame) => (frame.inWindow[foot] ? WINDOW : OUTSIDE));
}

/** The measures' row: G a gallop's start, H a hop, T both thighs forward at once (the first that applies). */
function marksRow(length: number, marks: Marks): string[] {
  const row = new Array<string>(length).fill(' ');
  const put = (frames: number[], letter: string) => {
    for (const frame of frames) if (frame < length && row[frame] === ' ') row[frame] = letter;
  };
  put(marks.gallops, 'G');
  put(marks.hops, 'H');
  put(marks.together, 'T');
  return row;
}

/** A ruler over a row from `from`: each tenth frame's number. */
function ruler(from: number, length: number): string {
  let line = '';
  for (let frame = from; frame < from + length; frame += 10) line += String(frame).padEnd(10);
  return line.slice(0, length);
}

/**
 * The diagram's lines: its key, then a block a `ROW` frames, each a ruler, the left foot and its plan, the right
 * foot and its plan, and the measures' marks.
 */
export function footfallLines(watch: FootfallWatch, departures: Departure[], marks: Marks): string[] {
  const frames = watch.frames;
  const rows = {
    left: footRow(frames, 0, departures),
    leftPlan: planRow(frames, 0),
    right: footRow(frames, 1, departures),
    rightPlan: planRow(frames, 1),
    marks: marksRow(frames.length, marks),
  };
  const lines = [
    `footfalls, a frame a character: ${DOWN} on the ground, ${UP} in the air, a stride's start by why it left (^ its`
      + ` window, e early, l late, t a timed step, c closing a stop); under each foot ${WINDOW} the cycle's window for`
      + ' its swing; G a gallop, H a hop, T both thighs swinging forward at once',
  ];
  for (let from = 0; from < frames.length; from += ROW) {
    const slice = (row: string[]) => row.slice(from, from + ROW).join('');
    lines.push(`         ${ruler(from, Math.min(ROW, frames.length - from))}`);
    lines.push(`    L    ${slice(rows.left)}`);
    lines.push(`         ${slice(rows.leftPlan)}`);
    lines.push(`    R    ${slice(rows.right)}`);
    lines.push(`         ${slice(rows.rightPlan)}`);
    lines.push(`         ${slice(rows.marks)}`.trimEnd());
  }
  return lines;
}
