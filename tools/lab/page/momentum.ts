// tools/lab momentum: a cut's motion as a whole, as a weapon of its weight is swung (lab eyes): how wide its striking
// part sweeps across the view and how steeply; how fast the weapon turns against what a body swings one that heavy
// at; how its speed builds into the blow and dies away after it (carried on through, never stopped dead nor jolted);
// and whether, while it moves fast, it keeps to the plane it's swung in and to its way round (its momentum: turned out
// of the plane or back mid-swing, it read as pushed about by the hands). (The owner, of the two-hander's cuts through
// the eyes: "first slice should be wider, its currently down towards the middle of the screen, then it lifts up to
// left, then left puts axe down and strikes going up... thats not realistic"; "we need to preserve momentum of the
// weapon"; "it should not be jerky, it should feel heavy".)
// The limits are a body's: cuts with a 1.2 kg sword, filmed at 100 frames a second, turn it 1000 to 2000 degrees a
// second at their fastest, after building speed through 30 to 40 degrees of arc (science-and-fiction.org,
// swordfighting/cuts.html); a two-hander's head, with several times a sword's moment of inertia, turns about 1/1.7 as
// fast for the same work. An animator gives a heavy weapon a slower wind-up and recovery, and one arc with no kinks
// in it: kinks and uneven spacing read as weightless.
import * as THREE from 'three';

/** A frame of a held weapon's swing: where its blow lands (world), the way of its length (world), and where that point
 *  is on the screen (0..1 across and down) and whether it's in the frame. */
export interface SwingFrame {
  point: THREE.Vector3;
  axis: THREE.Vector3;
  x: number;
  y: number;
  on: boolean;
}

/** A cut's swing measured whole. */
export interface Momentum {
  /** a two-hander's (held to the heavy limits) */
  heavy: boolean;
  /** the frame it moves fastest on (an index into the frames), its striking part's speed then (m/s) and how fast the
   *  weapon turns then (degrees a second) */
  fastest: number;
  speed: number;
  turn: number;
  /** the way it turns about at its blow (world, a unit way: its plane's, and which way round) */
  about: THREE.Vector3;
  /** how long its speed takes to build from `BUILT_FROM` of its fastest to it, and to die away from it to `DIES_TO`
   *  of it (ms; null: not within the frames) */
  rise: number | null;
  fall: number | null;
  /** how far it turns on round its blow's way as it dies away (degrees) */
  carried: number;
  /** the most its speed changes from one frame to the next, a share of its fastest, and on which frame */
  jolt: number;
  joltAt: number;
  /** the deepest its speed drops while it builds, or comes back while it dies away, a share of its fastest (a stop
   *  and a start mid-swing) */
  dip: number;
  /** while it moves fast: the most the plane it turns in is off its blow's (degrees), and on which frame; the most
   *  that plane turns from one frame to the next (degrees, a kink in its arc), and on which; and the frame it turned
   *  back on, the other way round, before it died away (null: it didn't) */
  offPlane: number;
  offAt: number;
  kink: number;
  kinkAt: number;
  back: number | null;
  /** its striking part's path on the screen while it moves fast: the share of the frame's width it crosses, and how
   *  steeply, from where it's first seen to where it's last (degrees off level); null: not in the frame */
  across: number | null;
  slope: number | null;
}

/** what a weapon may do, as heavy or as light as it is */
interface Limits {
  /** the fastest it may turn (degrees a second) */
  turnMost: number;
  /** the least time its speed builds over, and dies away over (ms) */
  riseLeast: number;
  fallLeast: number;
  /** the least it turns on as it dies away (degrees) */
  carryLeast: number;
}
/** a two-hander's: a sword's ceiling over the square root of its head's several times the inertia; its speed built
 *  over five frames and died away over a fifth of a second, carried half a right angle on */
const HEAVY: Limits = { turnMost: 1200, riseLeast: 80, fallLeast: 200, carryLeast: 45 };
/** a one-hander's: the sword cuts' ceiling */
const LIGHT: Limits = { turnMost: 2000, riseLeast: 50, fallLeast: 120, carryLeast: 30 };
/** its speed built from this share of its fastest, and died away to this share */
const BUILT_FROM = 0.2;
const DIES_TO = 0.2;
/** the most its speed may change in a frame (a share of its fastest: built over four frames at an even push, each
 *  adds a quarter) */
const JOLT_MOST = 0.35;
/** the most its speed may drop as it builds, or come back as it dies away (a share of its fastest) */
const DIP_MOST = 0.15;
/** the most the plane it turns in may be off its blow's while it moves fast (degrees), and turn in a frame: a swing
 *  the trunk drives turns about the spine as the arm turns about its shoulder, and their sum's plane shifts as one
 *  overtakes the other (a two-hander's, 41 degrees over six frames as the arm caught the trunk up), as a golf swing's
 *  does on the way down; a kink turns it at once (lifted mid-swing by as much as it turns, 45 degrees in a frame) */
const PLANE_MOST = 45;
const KINK_MOST = 12;
/** a frame turning less than this share of its fastest turn doesn't say its plane (a weapon all but still) */
const PLANE_FROM = 0.15;
/** its striking part crosses at least this share of the frame's width while it moves fast, at most this steeply
 *  (degrees off level): a cleave sweeps through what's before it */
const ACROSS_LEAST = 0.6;
const SLOPE_MOST = 35;
/** a cut in a row turns in a plane at least this far (degrees) off the last one's run back: a weapon's momentum
 *  carries it round into the next cut, as a figure of eight swings it, and a cut that only reverses the last one's
 *  way stops it dead and drives it back the way it came (the owner, of the two-hander's return cut: "you cannot just
 *  reverse the direction") */
const RUN_BACK_LEAST = 45;
/** a cut's fastest frame is looked for this many frames either side of the strike's */
const NEAR_FASTEST = 3;

const DEG = 180 / Math.PI;

/** How fast its striking part moves on each frame (m/s; 0 on the first), `frameMs` apart. */
function speedsOf(frames: SwingFrame[], frameMs: number): number[] {
  return frames.map((frame, i) => (i ? frame.point.distanceTo(frames[i - 1].point) / (frameMs / 1000) : 0));
}

/** How far the weapon turns on each frame (degrees; 0 on the first), and about which way (a unit way; zero when it
 *  doesn't turn). */
function turnsOf(frames: SwingFrame[]): Turn[] {
  return frames.map((frame, i) => {
    if (!i) return { angle: 0, about: new THREE.Vector3() };
    const before = frames[i - 1].axis;
    const about = new THREE.Vector3().crossVectors(before, frame.axis);
    const angle = before.angleTo(frame.axis) * DEG;
    return { angle, about: about.lengthSq() > 1e-12 ? about.normalize() : about };
  });
}

/** The fastest of `speeds` within `NEAR_FASTEST` of `near`. */
function fastestNear(speeds: number[], near: number): number {
  let fastest = Math.max(1, near - NEAR_FASTEST);
  for (let i = fastest; i <= Math.min(speeds.length - 1, near + NEAR_FASTEST); i++) {
    if (speeds[i] > speeds[fastest]) fastest = i;
  }
  return fastest;
}

type Turn = { angle: number; about: THREE.Vector3 };

/** Whether the weapon turns the other way round from its blow's on frame `i`, and more than all but still. */
const turnsBack = (turns: Turn[], i: number, fastest: number) =>
  turns[i].angle >= turns[fastest].angle * PLANE_FROM && turns[i].about.dot(turns[fastest].about) < 0;

/**
 * The swing round its blow, while it moves fast its blow's way round: from the frame before `fastest` its speed last
 * built from `from` of it, or that it turned round on (a wind-up's end: it builds from there), to the frame after it
 * that it died away to `to` of it on, or that it turned back on (indices; -1 where it doesn't within the frames), and
 * whether it turned back there, its momentum undone.
 */
function spanOf(speeds: number[], turns: Turn[], fastest: number, from: number, to: number):
  { start: number; end: number; back: boolean } {
  const fast = (i: number, share: number) => speeds[i] >= speeds[fastest] * share && !turnsBack(turns, i, fastest);
  let start = fastest;
  while (start > 0 && fast(start, from)) start--;
  let end = fastest;
  while (end < speeds.length && fast(end, to)) end++;
  const back = end < speeds.length && speeds[end] >= speeds[fastest] * to;
  return { start: fast(start, from) ? -1 : start, end: end < speeds.length ? end : -1, back };
}

/** The deepest its speed drops while it builds (from `start` to `fastest`) or comes back while it dies away (on to
 *  `end`), a share of the fastest. */
function dipOf(speeds: number[], start: number, fastest: number, end: number): number {
  let dip = 0;
  let most = 0;
  for (let i = start; i <= fastest; i++) {
    most = Math.max(most, speeds[i]);
    dip = Math.max(dip, most - speeds[i]);
  }
  let least = Infinity;
  for (let i = fastest; i <= end; i++) {
    least = Math.min(least, speeds[i]);
    dip = Math.max(dip, speeds[i] - least);
  }
  return dip / speeds[fastest];
}

/** The most its speed changes from one frame to the next from `start` to `end`, a share of the fastest, and where. */
function joltOf(speeds: number[], start: number, end: number, fastest: number): { jolt: number; at: number } {
  let jolt = 0;
  let at = start;
  for (let i = start + 1; i <= end; i++) {
    const change = Math.abs(speeds[i] - speeds[i - 1]) / speeds[fastest];
    if (change > jolt) {
      jolt = change;
      at = i;
    }
  }
  return { jolt, at };
}

/** While it moves fast (from `start` to `end`), the most the plane it turns in is off the blow's (degrees), and where,
 *  and the most it turns from one frame to the next, and where; frames all but still left out. */
function offPlaneOf(turns: Turn[], start: number, end: number, fastest: number):
  { off: number; at: number; kink: number; kinkAt: number } {
  const blow = turns[fastest];
  let off = 0;
  let at = fastest;
  let kink = 0;
  let kinkAt = fastest;
  let last: Turn | null = null;
  for (let i = Math.max(1, start); i <= end; i++) {
    if (turns[i].angle < blow.angle * PLANE_FROM) continue;
    const angle = blow.about.angleTo(turns[i].about) * DEG;
    if (angle > off) {
      off = angle;
      at = i;
    }
    const turned = last ? last.about.angleTo(turns[i].about) * DEG : 0;
    if (turned > kink) {
      kink = turned;
      kinkAt = i;
    }
    last = turns[i];
  }
  return { off, at, kink, kinkAt };
}

/** How far it turns on round the blow's way from `fastest` to `end` (degrees). */
function carriedOf(turns: Turn[], fastest: number, end: number): number {
  const blow = turns[fastest].about;
  let carried = 0;
  for (let i = fastest + 1; i <= end; i++) carried += turns[i].angle * turns[i].about.dot(blow);
  return carried;
}

/** Its striking part's path on the screen from `start` to `end`: the share of the width it crosses in the frame, and
 *  how steeply from where it's first seen to where it's last. */
function pathOf(frames: SwingFrame[], start: number, end: number): { across: number | null; slope: number | null } {
  const seen = frames.slice(start, end + 1).filter((frame) => frame.on);
  if (seen.length < 2) return { across: null, slope: null };
  const xs = seen.map((frame) => frame.x);
  const first = seen[0];
  const last = seen[seen.length - 1];
  const slope = Math.atan2(Math.abs(last.y - first.y), Math.abs(last.x - first.x)) * DEG;
  return { across: Math.max(...xs) - Math.min(...xs), slope };
}

/**
 * A cut's swing measured whole: `frames` its frames (a cast's, from the frame before it, each a held weapon's), the
 * blow nearest the frame `near` (the strike's fastest), `frameMs` a frame's length; `heavy` a two-hander. Null when the
 * weapon doesn't move.
 */
export function momentumOf(frames: SwingFrame[], near: number, frameMs: number, heavy: boolean): Momentum | null {
  if (frames.length < 3) return null;
  const speeds = speedsOf(frames, frameMs);
  const turns = turnsOf(frames);
  const fastest = fastestNear(speeds, near);
  if (!(speeds[fastest] > 0)) return null;
  const { start, end, back } = spanOf(speeds, turns, fastest, BUILT_FROM, DIES_TO);
  const from = Math.max(0, start);
  const to = end < 0 ? frames.length - 1 : end;
  const { jolt, at: joltAt } = joltOf(speeds, from, to, fastest);
  // (its plane read off the frames within the swing alone: the frames it built from and died away on are the turns
  // round at its ends, a wind-up's, the other way round)
  const inside = { from: start < 0 ? 0 : start + 1, to: end < 0 ? frames.length - 1 : end - 1 };
  const { off: offPlane, at: offAt, kink, kinkAt } = offPlaneOf(turns, inside.from, inside.to, fastest);
  return {
    heavy,
    fastest,
    speed: speeds[fastest],
    turn: turns[fastest].angle / (frameMs / 1000),
    about: turns[fastest].about.clone(),
    rise: start < 0 ? null : (fastest - start) * frameMs,
    fall: end < 0 ? null : (end - fastest) * frameMs,
    carried: carriedOf(turns, fastest, to),
    jolt,
    joltAt,
    dip: dipOf(speeds, from, fastest, to),
    offPlane,
    offAt,
    kink,
    kinkAt,
    back: back ? end : null,
    ...pathOf(frames, from, to),
  };
}

const share = (value: number) => `${(value * 100).toFixed(0)}%`;
const ms = (value: number | null) => (value === null ? 'not within the frames' : `${value.toFixed(0)} ms`);

/** A swing as a line of the report (`at` says a frame's index as words). */
export function describeMomentum(swing: Momentum, at: (i: number) => string): string {
  const path = swing.across === null
    ? 'its striking part never in the frame while it moves fast'
    : `its striking part across ${share(swing.across)} of the frame's width while it moves fast, `
      + `${swing.slope!.toFixed(0)}° off level`;
  return `the swing (${swing.heavy ? 'a heavy' : 'a light'} weapon's): fastest at ${at(swing.fastest)}, `
    + `${swing.speed.toFixed(1)} m/s, turning ${swing.turn.toFixed(0)}°/s; its speed built over ${ms(swing.rise)} `
    + `and died away over ${ms(swing.fall)}, carried ${swing.carried.toFixed(0)}° on; the most it changed in a frame `
    + `${share(swing.jolt)} of its fastest (${at(swing.joltAt)}), the deepest dip ${share(swing.dip)}; its plane at `
    + `most ${swing.offPlane.toFixed(0)}° off the blow's while fast (${at(swing.offAt)}), turning at most `
    + `${swing.kink.toFixed(0)}° in a frame (${at(swing.kinkAt)}); ${path}`;
}

/** A swing's problems against its weight's limits (`at` says a frame's index as words). */
export function momentumProblems(swing: Momentum, at: (i: number) => string): string[] {
  const limits = swing.heavy ? HEAVY : LIGHT;
  const weight = swing.heavy ? 'a two-hander' : 'a one-hander';
  const problems: string[] = [];
  if (swing.turn > limits.turnMost) {
    problems.push(`it turns faster than a body swings ${weight}: ${swing.turn.toFixed(0)}°/s at ${at(swing.fastest)} `
      + `(at most ${limits.turnMost})`);
  }
  if (swing.rise !== null && swing.rise < limits.riseLeast) {
    problems.push(`its speed is built in ${ms(swing.rise)}, jerked into the blow (over ${limits.riseLeast} ms at `
      + 'least)');
  }
  if (swing.fall === null || swing.fall < limits.fallLeast) {
    const dies = swing.fall === null ? 'never' : `in ${ms(swing.fall)}`;
    problems.push(`its momentum is stopped: its speed dies away ${dies} (over ${limits.fallLeast} ms at least)`);
  }
  if (swing.carried < limits.carryLeast) {
    problems.push(`it's carried ${swing.carried.toFixed(0)}° on through its blow (at least ${limits.carryLeast}°)`);
  }
  if (swing.jolt > JOLT_MOST) {
    problems.push(`it's jolted: its speed changes ${share(swing.jolt)} of its fastest in a frame at ${at(swing.joltAt)}`
      + ` (at most ${share(JOLT_MOST)})`);
  }
  if (swing.dip > DIP_MOST) {
    problems.push(`it stops and starts mid-swing: its speed dips ${share(swing.dip)} of its fastest (at most `
      + `${share(DIP_MOST)})`);
  }
  if (swing.back !== null) {
    problems.push(`it turns back while it moves fast, at ${at(swing.back)}: its momentum undone`);
  }
  if (swing.kink > KINK_MOST) {
    problems.push(`its arc kinks while it moves fast: its plane turns ${swing.kink.toFixed(0)}° in a frame at `
      + `${at(swing.kinkAt)} (at most ${KINK_MOST}°)`);
  }
  if (swing.offPlane > PLANE_MOST) {
    problems.push(`it's turned out of its plane while it moves fast: ${swing.offPlane.toFixed(0)}° off the blow's at `
      + `${at(swing.offAt)} (at most ${PLANE_MOST}°)`);
  }
  if (swing.across === null || swing.across < ACROSS_LEAST) {
    const across = swing.across === null ? 'none' : share(swing.across);
    problems.push(`it's a narrow slice: its striking part crosses ${across} of the frame's width while it moves fast `
      + `(at least ${share(ACROSS_LEAST)})`);
  }
  if (swing.slope !== null && swing.slope > SLOPE_MOST) {
    problems.push(`it slices down the view, not across it: ${swing.slope.toFixed(0)}° off level (at most `
      + `${SLOPE_MOST}°)`);
  }
  return problems;
}

/** How far (degrees) the plane `next` turns in is off `last`'s run back: 0 the same way back, 180 the same way on. */
export function runBackOf(last: Momentum, next: Momentum): number {
  return next.about.angleTo(last.about.clone().negate()) * DEG;
}

/** A cut in a row (`next`, the `index`th of it, from 1) against the last one: its line, and its problem if it's that
 *  one run back. */
export function rowOfSwings(last: Momentum, next: Momentum, index: number): { line: string; problems: string[] } {
  const off = runBackOf(last, next);
  const line = `cut ${index} swung in a plane ${off.toFixed(0)}° off cut ${index - 1}'s run back`;
  if (off >= RUN_BACK_LEAST) return { line, problems: [] };
  const problem = `cut ${index} is cut ${index - 1} run back: its plane ${off.toFixed(0)}° off that one's `
    + `reversed (at least ${RUN_BACK_LEAST}°: a weapon's momentum carries it round into the next cut)`;
  return { line, problems: [problem] };
}

/** A fault the canary plants in a swing's frames: its name, and the frames and the fastest's index with it. */
interface Planted {
  name: string;
  frames: SwingFrame[];
  near: number;
}

/** The striking part drawn straight down the middle of the frame, from its top to its bottom over the frames: a cut
 *  swung down the view, whatever way it went. */
function chopped(frames: SwingFrame[]): SwingFrame[] {
  const last = Math.max(1, frames.length - 1);
  return frames.map((frame, i) => ({ ...frame, x: 0.5, y: 0.1 + (0.8 * i) / last, on: true }));
}

/** The frames on the screen drawn in to a third of their width about the frame's middle: a narrow slice. */
function narrowed(frames: SwingFrame[]): SwingFrame[] {
  return frames.map((frame) => ({ ...frame, x: 0.5 + (frame.x - 0.5) / 3 }));
}

/** The weapon held where it is from the frame after `fastest` on: stopped dead after its blow. */
function stopped(frames: SwingFrame[], fastest: number): SwingFrame[] {
  return frames.map((frame, i) => (i > fastest + 1 ? { ...frames[fastest + 1] } : frame));
}

/** The frames before `fastest` run back after it: the weapon turned back the way it came. */
function turnedBack(frames: SwingFrame[], fastest: number): SwingFrame[] {
  return frames.map((frame, i) => (i > fastest ? frames[Math.max(0, 2 * fastest - i)] : frame));
}

/** Every third frame alone: the swing three times as fast. */
function hurried(frames: SwingFrame[]): SwingFrame[] {
  return frames.filter((_, i) => i % 3 === 0);
}

/** The weapon tipped out of its plane each frame after `fastest` by as much again as it turns in it at its blow, the
 *  frames' screen places kept: lifted out of its plane as it moves on, half a right angle off it. */
function lifted(frames: SwingFrame[], fastest: number): SwingFrame[] {
  const about = new THREE.Vector3().crossVectors(frames[fastest].axis, frames[fastest + 1].axis).normalize();
  const tip = new THREE.Vector3().crossVectors(about, frames[fastest].axis).normalize();
  const step = frames[fastest].axis.angleTo(frames[fastest + 1].axis);
  return frames.map((frame, i) => {
    if (i <= fastest) return frame;
    const turn = new THREE.Quaternion().setFromAxisAngle(tip, (i - fastest) * step);
    return { ...frame, axis: frame.axis.clone().applyQuaternion(turn) };
  });
}

/** The faults the canary plants, each with what the measure must find in it. */
function plantedFaults(frames: SwingFrame[], fastest: number): { planted: Planted; finds: RegExp }[] {
  return [
    { planted: { name: 'swung down the view', frames: chopped(frames), near: fastest }, finds: /slices down/ },
    { planted: { name: 'a third as wide', frames: narrowed(frames), near: fastest }, finds: /narrow slice/ },
    { planted: { name: 'stopped dead', frames: stopped(frames, fastest), near: fastest },
      finds: /momentum is stopped/ },
    { planted: { name: 'turned back', frames: turnedBack(frames, fastest), near: fastest }, finds: /turns back/ },
    { planted: { name: 'three times as fast', frames: hurried(frames), near: Math.round(fastest / 3) },
      finds: /turns faster/ },
    { planted: { name: 'lifted out of its plane', frames: lifted(frames, fastest), near: fastest },
      finds: /arc kinks|out of its plane|turns back/ },
  ];
}

/** The row's canary: a cut's swing (`frames`, its fastest frame `fastest`) followed by its own frames run backward,
 *  the next cut only reversing it, which the row's measure must find. */
export function rowCanary(frames: SwingFrame[], fastest: number, frameMs: number, heavy: boolean): string {
  const last = momentumOf(frames, fastest, frameMs, heavy);
  const back = momentumOf([...frames].reverse(), frames.length - 1 - fastest, frameMs, heavy);
  if (!last || !back) return 'missed: the cut run backward didn\'t swing';
  const caught = rowOfSwings(last, back, 2).problems.length > 0;
  const off = runBackOf(last, back).toFixed(0);
  return `${caught ? 'caught' : 'missed'}: a cut followed by itself run backward, ${off}°`;
}

/** The canary: each fault planted in a swing's frames (`frames`, its fastest frame `fastest`), and whether the
 *  measure found it, as verdicts ("caught: ...", "missed: ..."). */
export function momentumCanary(frames: SwingFrame[], fastest: number, frameMs: number, heavy: boolean): string[] {
  if (fastest + 1 >= frames.length) return ['missed: no frames after the blow to plant faults in'];
  return plantedFaults(frames, fastest).map(({ planted, finds }) => {
    const swing = momentumOf(planted.frames, planted.near, frameMs, heavy);
    const found = swing ? momentumProblems(swing, String) : [];
    const caught = found.some((problem) => finds.test(problem));
    return `${caught ? 'caught' : 'missed'}: ${planted.name}`;
  });
}
