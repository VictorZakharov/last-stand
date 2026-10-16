// tools/lab cutRows: how the cuts of a row through the eyes follow each other (lab eyes, page/cuts.ts): one from the
// arms at rest is the forehand, one straight after another starts where that one ended (not back at rest first), each
// ends with its weapon seen, and the last one's end is held a while before the arms go back. Pure, on the frames the
// eyes saw, so a unit test plants each fault (test/cutRows.test.mjs). (The owner: "should naturally hit towards left
// with 2 handed, then dont return to neutral right away, wait for another attack, if user keeps attacking, swipe the
// other direction".)
import * as THREE from 'three';

/** A frame of a cut as the eyes see it: the weapon's hilt and tip in the camera's space (m: x right, y up, -z ahead),
 *  the hand holding it, which way the cut swings (`Model.swing`: 1 the forehand, right to left; null on a game without
 *  it), whether the frame is in a cast, and its number. */
export interface CutFrame {
  grip: THREE.Vector3;
  tip: THREE.Vector3;
  hand: Hand;
  side: number | null;
  inCast: boolean;
  frame: number;
  /** its weapon in the frame (`weaponsInView`: its share along its length, and how long it looks; none at rest, which
   *  has its own) */
  shown?: number;
  looks?: number;
}

export type Hand = 'right' | 'left';

/** Each held weapon's blade at rest, by the hand holding it. */
export type RestBlades = Partial<Record<Hand, CutFrame>>;

/** where along the blade its blow lands (strike.ts `PERCUSSION`): the point whose sweep is measured */
const PERCUSSION = 0.75;

/** the blade is at rest when its striking part is within this of where it was at rest, seen from the eyes, and its
 *  length within `REST_TURN` of its way then (degrees: by the striking part alone, a mace held high on the right at a
 *  backhand's end was read as back at rest, and its hold as over after 167 ms) */
const REST_NEAR = 12;
const REST_TURN = 25;
/** and between two cuts it's back at rest only if it stops there: its striking part moving at most this far in a frame
 *  (degrees: a sword rising through the rest's place into a row's next wind-up, 21 m/s, was read as back at rest) */
const REST_STILL = 4;
/** a cut's end is held at least this long (ms) before the arms go back, a while for another attack to follow it; held
 *  so while its striking part keeps within `HELD_NEAR` of where it ended (degrees) */
const HELD_LEAST = 400;
const HELD_NEAR = 6;
/** a held weapon at rest is at least this share in the frame, along its length (the one-hander's rest the owner took,
 *  after Vermintide 2's, upright at the frame's right edge, is 36% in it; the left of two was 0%, "mostly off
 *  screen"), and so is one at a cut's end, where it waits for the next cut (a two-hander's forehand ended low on
 *  the left out of the frame, none of it seen for 250 ms of the backhand after it, and the backhand's end held the
 *  handle across the view, its blade out of the frame) */
const REST_IN_VIEW = 0.3;
/** and it looks at least this long on the screen, a share of the frame's height (the owner's one-handed rest 58%, the
 *  two-hander's 86%: a two-hander's forehand held its blade pointing away from the eyes at its end, 45% of it in the
 *  frame and a sliver 31% of the frame's height) */
const LOOKS_LEAST = 0.4;

const DEG = 180 / Math.PI;

/** The striking part's way from the eyes. */
export const strikingWay = (frame: CutFrame) => frame.grip.clone().lerp(frame.tip, PERCUSSION).normalize();

/** The blade's way along its length, in the eyes' space. */
const bladeWay = (frame: CutFrame) => frame.tip.clone().sub(frame.grip).normalize();

/** Whether a frame's blade is where `rest` has it: its striking part and its length (`REST_NEAR`, `REST_TURN`). */
const nearRest = (frame: CutFrame, rest: CutFrame) =>
  apart(strikingWay(frame), strikingWay(rest)) <= REST_NEAR && apart(bladeWay(frame), bladeWay(rest)) <= REST_TURN;

/** How far apart two ways are (degrees). */
const apart = (a: THREE.Vector3, b: THREE.Vector3) => a.angleTo(b) * DEG;

/** Each cast of a row of cuts: its frames (from the frame before it began, as `castFrames` has them) and the index
 *  among them its strike starts at (none: its frames' end). */
export interface RowCast {
  frames: CutFrame[];
  strikeFrom: number;
}

/** The first frame of a cast that's in it, and the last. */
const firstIn = (cast: RowCast) => cast.frames.find((frame) => frame.inCast) ?? cast.frames[0];
const lastIn = (cast: RowCast) => cast.frames.filter((frame) => frame.inCast).pop() ?? cast.frames.at(-1)!;

/**
 * A row of cuts against how a body chains them: each that began with its blade at rest (where that hand's was before
 * the first press, `rest`) the forehand; each straight after another (begun away from rest) not back at rest before
 * its blow; and the last one's end held at least `HELD_LEAST`. Its lines and problems.
 */
export function rowOfCuts(casts: RowCast[], rest: RestBlades, frameMs: number):
  { lines: string[]; problems: string[] } {
  const lines: string[] = [];
  const problems: string[] = [];
  casts.forEach((cast, i) => {
    const begun = firstIn(cast);
    const atRest = rest[begun.hand];
    const fromRest = atRest !== undefined && nearRest(begun, atRest);
    const from = fromRest ? 'from the rest' : 'where the last cut left the blade';
    const ended = lastIn(cast);
    const looks = ended.looks === undefined ? '' : `, looking ${(ended.looks * 100).toFixed(0)}% of its height long`;
    const shown = ended.shown === undefined ? '' : `, ending ${(ended.shown * 100).toFixed(0)}% in the frame${looks}`;
    lines.push(`cut ${i + 1}: ${sideWords(begun)}, begun ${from}${shown}`);
    const unseen = ended.shown === undefined ? null : unseenBy(ended.shown, ended.looks ?? 0);
    if (unseen) problems.push(`cut ${i + 1} ends ${unseen} (where it waits for the next cut, frame ${ended.frame})`);
    // (a blade in each hand: the left's cut in a row begins from its own rest, as the right's did, and is its forehand)
    if (fromRest && begun.side !== null && !isForehand(begun)) {
      problems.push(`cut ${i + 1} began from the rest with a backhand, ${sideWords(begun)}: a cut from the rest is `
        + 'its hand\'s forehand');
    }
    if (i === 0 && begun.hand !== 'right') {
      problems.push(`the row began with ${sideWords(begun)}: a row of cuts starts with the right hand's forehand`);
    }
    if (i === 0 || fromRest || !atRest) return;
    const back = backToRest(casts[i - 1], cast, atRest);
    if (back) problems.push(`cut ${i + 1} went back to the rest (frame ${back}) before its blow: a cut straight `
      + 'after one starts where that one ended');
  });
  const held = heldAfter(casts[casts.length - 1], frameMs);
  if (held !== null) {
    lines.push(`the last cut's end held ${held.toFixed(0)} ms before the arms went back`);
    if (held < HELD_LEAST) problems.push(`the last cut's end is held ${held.toFixed(0)} ms (at least ${HELD_LEAST}: `
      + 'a while for another attack to follow it)');
  }
  return { lines, problems };
}

/** Whether a frame's blade is back where its hand's was at rest (none known: taken as at rest). */
export function atRest(frame: CutFrame, rest: RestBlades): boolean {
  const blade = rest[frame.hand];
  return !blade || nearRest(frame, blade);
}

/** Whether a frame's cut is its hand's forehand (`Model.swing`: 1 right to left, the right hand's forehand; the left
 *  hand's goes left to right). */
const isForehand = (frame: CutFrame) => frame.side !== null && (frame.side > 0) === (frame.hand === 'right');

/** Which way a cut goes, as words. */
function sideWords(frame: CutFrame): string {
  if (frame.side === null) return `a cut in the ${frame.hand} hand`;
  const way = frame.side > 0 ? 'right to left' : 'left to right';
  return `the ${frame.hand} hand's ${isForehand(frame) ? 'forehand' : 'backhand'}, ${way}`;
}

/** The frame the blade came back to rest on between `last`'s end and `cast`'s blow, stopping there (`REST_STILL`), or
 *  null if it didn't. */
function backToRest(last: RowCast, cast: RowCast, rest: CutFrame): number | null {
  const lastIn = last.frames.filter((frame) => frame.inCast);
  const ended = lastIn[lastIn.length - 1] ?? last.frames[last.frames.length - 1];
  const after = [...last.frames.slice(last.frames.indexOf(ended) + 1), ...cast.frames.slice(0, cast.strikeFrom)];
  if (apart(strikingWay(ended), strikingWay(rest)) <= 2 * REST_NEAR) return null;
  const path = [ended, ...after];
  const stopped = (i: number) => apart(strikingWay(path[i]), strikingWay(path[i - 1])) <= REST_STILL;
  for (let i = 1; i < path.length; i++) {
    if (nearRest(path[i], rest) && stopped(i)) return path[i].frame;
  }
  return null;
}

/** How long after a cast's last frame its blade kept within `HELD_NEAR` of where it was then (ms), or null when no
 *  frame came after. */
function heldAfter(cast: RowCast, frameMs: number): number | null {
  const inCast = cast.frames.filter((frame) => frame.inCast);
  const ended = inCast[inCast.length - 1];
  if (!ended) return null;
  const after = cast.frames.slice(cast.frames.indexOf(ended) + 1);
  if (!after.length) return null;
  const endWay = strikingWay(ended);
  const moved = after.findIndex((frame) => apart(strikingWay(frame), endWay) > HELD_NEAR);
  return (moved < 0 ? after.length : moved) * frameMs;
}

/** How a weapon in the frame is too little seen, as words: less than `REST_IN_VIEW` of it in the frame, or looking
 *  shorter than `LOOKS_LEAST`; null when it's seen well enough. */
export function unseenBy(share: number, looks: number): string | null {
  const percent = (value: number) => `${(value * 100).toFixed(0)}%`;
  if (share < REST_IN_VIEW) {
    return `${percent(share)} in the frame along its length (at least ${percent(REST_IN_VIEW)})`;
  }
  if (looks < LOOKS_LEAST) {
    return `looking ${percent(looks)} of the frame's height long, pointing away from the eyes (at least `
      + `${percent(LOOKS_LEAST)})`;
  }
  return null;
}
