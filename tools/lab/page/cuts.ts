// tools/lab cuts: how a cut through the eyes lands and goes on (lab eyes). Which part of its blade crosses the aim, the
// crosshair, as it lands (its tip's third, or its middle); how wide its striking part sweeps against the skill's arc,
// which it strikes every foe in; and how the cuts of a row follow each other: one from the arms at rest is the
// forehand, one straight after another starts where that one ended (not back at rest first), and the last one's end
// is held a while before the arms go back. And how much of each held weapon is in the frame at rest.
// (The owner: "current dual wield attack is like touching the enemy with the middle of the blade, lame"; "our attacks
// strike multiple targets, so that cannot appear to hit only one"; "should naturally hit towards left with 2 handed,
// then dont return to neutral right away, wait for another attack, if user keeps attacking, swipe the other
// direction"; "for dual wield right hand looks fine, but left is mostly off screen".)
import * as THREE from 'three';
import type { Lab } from './lab';
import { armsLens } from './inFrame';
import { isWeapon, SIDES_NAMED } from './strike';

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
}

type Hand = 'right' | 'left';

/** Each held weapon's blade at rest, by the hand holding it. */
export type RestBlades = Partial<Record<Hand, CutFrame>>;

/** where along the blade its blow lands (strike.ts `PERCUSSION`): the point whose sweep is measured */
const PERCUSSION = 0.75;
/** a cut lands with its tip's part: it crosses the aim at least this far from the hilt to the tip (its middle is
 *  0.5), and not beyond the tip */
const MEETS_LEAST = 0.6;
const MEETS_MOST = 1.05;
/** a cut sweeps at least this share of the skill's arc with its striking part (it strikes every foe in it) */
const SWEEP_LEAST = 0.6;
/** the blade is at rest when its striking part is within this of where it was at rest, seen from the eyes (degrees) */
const REST_NEAR = 12;
/** a cut's end is held at least this long (ms) before the arms go back, a while for another attack to follow it; held
 *  so while its striking part keeps within `HELD_NEAR` of where it ended (degrees) */
const HELD_LEAST = 400;
const HELD_NEAR = 6;
/** a held weapon at rest is at least this share in the frame, along its length (the one-hander's rest the owner took,
 *  after Vermintide 2's, upright at the frame's right edge, is 36% in it; the left of two was 0%, "mostly off
 *  screen") */
const REST_IN_VIEW = 0.3;
/** the points along a weapon its share in the frame is counted at */
const ALONG_POINTS = 11;

const DEG = 180 / Math.PI;

/** The striking part's way from the eyes. */
const strikingWay = (frame: CutFrame) => frame.grip.clone().lerp(frame.tip, PERCUSSION).normalize();

/** How far apart two ways are (degrees). */
const apart = (a: THREE.Vector3, b: THREE.Vector3) => a.angleTo(b) * DEG;

/** The aim's line against a frame's blade, as the screen has it: how far the crosshair is off the blade's line
 *  (signed, the screen's units a metre ahead), and the share of the blade from the hilt to the tip nearest it (beyond
 *  0 to 1 off the blade). Null when the blade isn't ahead of the eyes. */
function aimAgainst(frame: CutFrame): { off: number; share: number } | null {
  const near = -frame.grip.z;
  const far = -frame.tip.z;
  if (near <= 0 || far <= 0) return null;
  const a = new THREE.Vector2(frame.grip.x / near, frame.grip.y / near);
  const b = new THREE.Vector2(frame.tip.x / far, frame.tip.y / far);
  const along = b.clone().sub(a);
  const length = along.length();
  if (length < 1e-6) return null;
  const off = (along.x * -a.y - along.y * -a.x) / length;
  const t = -a.dot(along) / (length * length);
  // (from the screen's share of the blade to its own: the far part of it is drawn smaller)
  const share = (t * near) / (far * (1 - t) + t * near);
  return { off, share };
}

/**
 * Where the blade crosses the aim among `frames` from `from` to `to` (indices): the share of the way from its hilt to
 * its tip at the crossing nearest `at`, and the frame it crossed after; null when it never crosses.
 */
export function aimCrossing(frames: CutFrame[], from: number, to: number, at: number):
  { share: number; frame: number } | null {
  let found: { share: number; frame: number; index: number } | null = null;
  for (let i = Math.max(0, from); i < Math.min(frames.length - 1, to + 1); i++) {
    const now = aimAgainst(frames[i]);
    const next = aimAgainst(frames[i + 1]);
    if (!now || !next || Math.sign(now.off) === Math.sign(next.off)) continue;
    const u = now.off / (now.off - next.off);
    const crossing = { share: now.share + (next.share - now.share) * u, frame: frames[i].frame, index: i };
    if (!found || Math.abs(i - at) < Math.abs(found.index - at)) found = crossing;
  }
  return found && { share: found.share, frame: found.frame };
}

/** How wide the striking part swept across the eyes' view among `frames` from `from` to `to` (degrees, round them),
 *  in the hand holding it at `to` (with a weapon in each hand, the tip moved from one to the other between cuts and
 *  frozen arms read as sweeping 36 degrees). */
export function sweptOver(frames: CutFrame[], from: number, to: number): number {
  const hand = frames[Math.min(to, frames.length - 1)]?.hand;
  const yaws = frames.slice(from, to + 1).filter((frame) => frame.hand === hand).map((frame) => {
    const way = strikingWay(frame);
    return Math.atan2(way.x, -way.z) * DEG;
  });
  return yaws.length ? Math.max(...yaws) - Math.min(...yaws) : 0;
}

/** A strike's landing through the eyes: where its blade crossed the aim, and how much of the arc it swept. */
export interface Landing {
  meets: { share: number; frame: number } | null;
  swept: number;
  /** the skill's arc (degrees; null: it has none) */
  arc: number | null;
}

/** A landing as words. */
export function describeLanding(landing: Landing): string {
  const meets = landing.meets
    ? `its blade crossed the aim ${(landing.meets.share * 100).toFixed(0)}% of the way from its hilt to its tip `
      + `(frame ${landing.meets.frame})`
    : 'its blade never crossed the aim';
  const arc = landing.arc === null ? '' : ` of the skill's ${landing.arc.toFixed(0)}° arc`;
  return `${meets}; its striking part swept ${landing.swept.toFixed(0)}°${arc}`;
}

/** A landing's problems: met with its middle or not at all, short of the aim, or a narrow sweep. */
export function landingProblems(landing: Landing, weapon: string): string[] {
  const problems: string[] = [];
  const { meets } = landing;
  if (!meets) problems.push(`the ${weapon}'s blade never crosses the aim through its blow`);
  else if (meets.share < MEETS_LEAST) {
    problems.push(`the ${weapon} meets the aim with its blade's inner part, ${(meets.share * 100).toFixed(0)}% of `
      + `the way to its tip (at least ${MEETS_LEAST * 100}%: a cut lands with its tip's part)`);
  } else if (meets.share > MEETS_MOST) {
    problems.push(`the ${weapon}'s tip falls short of the aim: it passed ${(meets.share * 100).toFixed(0)}% of `
      + 'its length out');
  }
  if (landing.arc !== null && landing.swept < landing.arc * SWEEP_LEAST) {
    problems.push(`the ${weapon}'s blow sweeps ${landing.swept.toFixed(0)}° of the skill's ${landing.arc.toFixed(0)}°`
      + ` arc (at least ${SWEEP_LEAST * 100}%: it strikes every foe in it)`);
  }
  return problems;
}

/** Each cast of a row of cuts: its frames (from the frame before it began, as `castFrames` has them) and the index
 *  among them its strike starts at (none: its frames' end). */
export interface RowCast {
  frames: CutFrame[];
  strikeFrom: number;
}

/** The first frame of a cast that's in it. */
const firstIn = (cast: RowCast) => cast.frames.find((frame) => frame.inCast) ?? cast.frames[0];

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
    const fromRest = atRest !== undefined && apart(strikingWay(begun), strikingWay(atRest)) <= REST_NEAR;
    const from = fromRest ? 'from the rest' : 'where the last cut left the blade';
    lines.push(`cut ${i + 1}: ${sideWords(begun)}, begun ${from}`);
    // (a blade in each hand: the left's cut in a row begins from its own rest, as the right's did, and is its forehand)
    if (fromRest && begun.side !== null && !isForehand(begun)) {
      problems.push(`cut ${i + 1} began from the rest with a backhand, ${sideWords(begun)}: a cut from the rest is `
        + 'its hand\'s forehand');
    }
    if (i === 0 && begun.hand !== 'right') {
      problems.push(`the row began with ${sideWords(begun)}: a row of cuts starts with the right hand's forehand`);
    }
    if (i === 0 || fromRest || !atRest) return;
    const back = backToRest(casts[i - 1], cast, strikingWay(atRest));
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
  return !blade || apart(strikingWay(frame), strikingWay(blade)) <= REST_NEAR;
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

/** The frame the blade came back to rest on between `last`'s end and `cast`'s blow, or null if it didn't. */
function backToRest(last: RowCast, cast: RowCast, restWay: THREE.Vector3): number | null {
  const lastIn = last.frames.filter((frame) => frame.inCast);
  const ended = lastIn[lastIn.length - 1] ?? last.frames[last.frames.length - 1];
  const between = [...last.frames.slice(last.frames.indexOf(ended) + 1), ...cast.frames.slice(0, cast.strikeFrom)];
  if (apart(strikingWay(ended), restWay) <= 2 * REST_NEAR) return null;
  return between.find((frame) => apart(strikingWay(frame), restWay) <= REST_NEAR)?.frame ?? null;
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

/** A held weapon's share of the frame at rest. */
export interface InView {
  hand: Hand;
  weapon: string;
  share: number;
}

/** Whether `object` and everything it hangs from is shown. */
function shown(object: THREE.Object3D): boolean {
  for (let node: THREE.Object3D | null = object; node; node = node.parent) {
    if (!node.visible) return false;
  }
  return true;
}

/** Each weapon the hero holds, seen, under each hand (none on a game that names no weapons' striking sides: any
 *  named joint would read as one). */
function weaponsHeld(lab: Lab): { hand: Hand; weapon: THREE.Object3D }[] {
  const found: { hand: Hand; weapon: THREE.Object3D }[] = [];
  if (!SIDES_NAMED) return found;
  for (const [hand, joint] of [['right', lab.joints.handR], ['left', lab.joints.handL]] as const) {
    joint.traverse((child) => {
      if (isWeapon(child) && shown(child)) found.push({ hand, weapon: child });
    });
  }
  return found;
}

/** A weapon's meshes' box in its own frame. */
function ownBox(weapon: THREE.Object3D): THREE.Box3 {
  weapon.updateWorldMatrix(true, true);
  const box = new THREE.Box3();
  const toOwn = weapon.matrixWorld.clone().invert();
  weapon.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !mesh.visible) return;
    mesh.geometry.computeBoundingBox();
    box.union(mesh.geometry.boundingBox!.clone().applyMatrix4(toOwn.clone().multiply(mesh.matrixWorld)));
  });
  return box;
}

/** Each held weapon's blade now (its grip's place to the far end of its meshes, in the eyes' space: `eyes` the camera
 *  they see through), by the hand holding it, as a frame before any cast. */
export function restBlades(lab: Lab, eyes: THREE.Camera): RestBlades {
  lab.model.root.updateWorldMatrix(true, true);
  const blades: RestBlades = {};
  for (const { hand, weapon } of weaponsHeld(lab)) {
    const box = ownBox(weapon);
    const middle = box.getCenter(new THREE.Vector3());
    const end = weapon.localToWorld(new THREE.Vector3(middle.x, box.max.y, middle.z));
    const grip = weapon.parent!.getWorldPosition(new THREE.Vector3());
    blades[hand] = {
      grip: eyes.worldToLocal(grip), tip: eyes.worldToLocal(end), hand, side: null, inCast: false, frame: -1,
    };
  }
  return blades;
}

/** Whether a point of the world is in the frame, as the arms are drawn (their own lens, if they have one). */
function inFrame(world: THREE.Vector3): boolean {
  const lens = armsLens();
  if (lens.worldToLocal(world.clone()).z >= 0) return false;
  const ndc = world.clone().project(lens);
  return Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1;
}

/** Each held weapon's share in the frame now: of `ALONG_POINTS` points along its length (its own +Y, through the
 *  middle of its box), those in it. */
export function weaponsInView(lab: Lab): InView[] {
  lab.model.root.updateWorldMatrix(true, true);
  return weaponsHeld(lab).map(({ hand, weapon }) => {
    const box = ownBox(weapon);
    const middle = box.getCenter(new THREE.Vector3());
    let seen = 0;
    for (let i = 0; i < ALONG_POINTS; i++) {
      const y = box.min.y + ((box.max.y - box.min.y) * i) / (ALONG_POINTS - 1);
      if (inFrame(weapon.localToWorld(new THREE.Vector3(middle.x, y, middle.z)))) seen++;
    }
    return { hand, weapon: weapon.name, share: seen / ALONG_POINTS };
  });
}

/** the hero's tip may be this share of its weapon's length off the far end of its meshes */
const TIP_OFF_MOST = 0.1;

/**
 * Whether the hero's tip (`Model.tip`: the measures take it for the weapon's far end, and a blade's share from its
 * hilt by it) is at the far end of the weapon it's on, as a problem if it isn't: the weapon's name and how far off it
 * is (a share of its length). None when no weapon is held.
 */
export function tipAtEnd(lab: Lab): string[] {
  const tip = lab.model.tip;
  const weapon = SIDES_NAMED ? tip?.parent?.children.find((child) => child.visible && isWeapon(child)) : undefined;
  if (!tip || !weapon) return [];
  const box = ownBox(weapon);
  const at = weapon.worldToLocal(tip.getWorldPosition(new THREE.Vector3()));
  const off = Math.abs(at.y - box.max.y) / (box.max.y - box.min.y);
  if (off <= TIP_OFF_MOST) return [];
  return [`the hero's tip is ${(off * 100).toFixed(0)}% of the ${weapon.name}'s length off its far end (at most `
    + `${TIP_OFF_MOST * 100}%): where its blade crosses the aim is measured along a wrong length`];
}

/** The weapons at rest as words, and each one less than `REST_IN_VIEW` in the frame as a problem. */
export function restInView(views: InView[]): { line: string; problems: string[] } {
  const words = views.map((view) => `the ${view.hand} ${view.weapon} ${(view.share * 100).toFixed(0)}%`);
  const problems = views
    .filter((view) => view.share < REST_IN_VIEW)
    .map((view) => `at rest the ${view.hand} hand's ${view.weapon} is ${(view.share * 100).toFixed(0)}% in the `
      + `frame (at least ${REST_IN_VIEW * 100}%)`);
  return { line: `at rest, in the frame along their length: ${words.join(', ') || 'no weapon held'}`, problems };
}
