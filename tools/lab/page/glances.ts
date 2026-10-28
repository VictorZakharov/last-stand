// A head's glances read from its turn frame by frame (tools/lab `glance`): where it's turned aside past a bar, how far,
// how fast, how far apart the glances come and whether they come in a loop, and the frames it jerked. Pure, for its
// tests (test/glances.test.mjs).

/** past this turn from the chest (degrees) the head is turned aside: the idle's own sway turns it a degree or two */
export const GLANCE_FROM = 10;

/** One glance: its first and last frame past the bar, its largest turn (degrees) and its side (+1 his left). */
export interface Glanced {
  start: number;
  end: number;
  peak: number;
  side: number;
}

/** A frame the turn jerked on: its index, and how much its move changed from the frame before (degrees). */
export interface Jerk {
  index: number;
  jerk: number;
}

/** Each run of frames the head is turned past `from` degrees either way, a turn across from one side to the other
 *  without coming back within it one glance. */
export function glancesIn(turns: readonly number[], from = GLANCE_FROM): Glanced[] {
  const found: Glanced[] = [];
  let open: Glanced | null = null;
  turns.forEach((turn, index) => {
    const aside = Math.abs(turn) > from;
    if (aside && !open) {
      open = { start: index, end: index, peak: 0, side: Math.sign(turn) };
      found.push(open);
    }
    if (!aside) {
      open = null;
      return;
    }
    const glance = open!;
    glance.end = index;
    if (Math.abs(turn) > Math.abs(glance.peak)) glance.peak = turn;
  });
  return found;
}

/** a glance carried across to the other side passes the middle: one starting within this of the last's end (s), on the
 *  other side, is the same glance */
export const ACROSS_WITHIN = 0.6;

/** `glances` with each carried across to the other side joined into the one it came from (its peak the larger). */
export function joinAcross(glances: readonly Glanced[], rate: number): Glanced[] {
  const joined: Glanced[] = [];
  for (const glance of glances) {
    const last = joined[joined.length - 1];
    const across = last && last.side !== glance.side && (glance.start - last.end) / rate <= ACROSS_WITHIN;
    if (!across) {
      joined.push({ ...glance });
      continue;
    }
    last.end = glance.end;
    if (Math.abs(glance.peak) > Math.abs(last.peak)) last.peak = glance.peak;
  }
  return joined;
}

/** The time between each glance's start and the next's (s), at `rate` frames a second. */
export function startsApart(glances: readonly Glanced[], rate: number): number[] {
  return glances.slice(1).map((glance, i) => (glance.start - glances[i].start) / rate);
}

/** The time between each glance's end and the next's start (s), at `rate` frames a second. */
export function gapsBetween(glances: readonly Glanced[], rate: number): number[] {
  return glances.slice(1).map((glance, i) => (glance.start - glances[i].end) / rate);
}

/** How far `values` spread about their mean (their standard deviation). */
export function spread(values: readonly number[]): number {
  if (!values.length) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const square = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(square);
}

/** Whether glances `apart` s apart come as a loop would: three or more, all within `within` s of their mean. */
export function looped(apart: readonly number[], within = 0.4): boolean {
  if (apart.length < 3) return false;
  const mean = apart.reduce((sum, value) => sum + value, 0) / apart.length;
  return apart.every((value) => Math.abs(value - mean) <= within);
}

/** The fastest the turn moves (degrees a second, at `rate` frames a second), and the frame it does. */
export function fastest(turns: readonly number[], rate: number): { speed: number; index: number } {
  let most = { speed: 0, index: -1 };
  for (let i = 1; i < turns.length; i++) {
    const speed = Math.abs(turns[i] - turns[i - 1]) * rate;
    if (speed > most.speed) most = { speed, index: i };
  }
  return most;
}

/** The largest change of the turn's move a frame (degrees), over every frame. */
export function largestJerk(turns: readonly number[]): Jerk {
  let worst: Jerk = { index: -1, jerk: 0 };
  for (let i = 2; i < turns.length; i++) {
    const jerk = Math.abs(turns[i] - 2 * turns[i - 1] + turns[i - 2]);
    if (jerk > worst.jerk) worst = { index: i, jerk };
  }
  return worst;
}

/** The frames the turn's move a frame changed by over `bar` degrees from the frame before. */
export function jerksIn(turns: readonly number[], bar: number): Jerk[] {
  const found: Jerk[] = [];
  for (let i = 2; i < turns.length; i++) {
    const jerk = Math.abs(turns[i] - 2 * turns[i - 1] + turns[i - 2]);
    if (jerk > bar) found.push({ index: i, jerk });
  }
  return found;
}
