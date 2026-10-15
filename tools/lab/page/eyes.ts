// tools/lab eyes: a move as the eyes see it. A skill cast through the eyes (`times` in a row, its key held as the
// player would), stepped frame by frame from the press until the arms are back at rest, with the weapon's blade (its
// middle: a long blade's tip is out of the frame's top as often as not) and both hands placed on the screen each
// frame: where the blade goes across the view (at rest, wound up, through the blow, where it ends), how fast, where it
// is as the skill fires, and whether a two-hander stays in both hands, both seen.
// A film of the frames goes with it. (Through the eyes the warrior's strikes read as weak, #224; the owner: "first
// person view should at least in spirit match common sense, two handed, heavy".)
import * as THREE from 'three';
import { G } from '../../../src/state';
import type { Lab, Fixture, Pictured, Report } from './lab';
import { bindKnown, holdFor, pressing, skillNamed, type BoundSkill } from './cast';
import { bodyBreaches, describeBreach, farFromHeld, whyLetGo } from './range';
import type { Fist, LowerGrip } from '../../../src/types';
import type { Breach } from '../../../src/entities/models/anatomy';

export interface EyesOptions {
  fixture: Fixture;
  /** the skill cast (its key, its behaviour or its name) */
  skill: string;
  /** how many casts in a row, the key held through them (a basic attack's chain of swings) */
  times: number;
  /** a frame pictured into the film every this many */
  every: number;
  /** the film taken (off: the numbers alone) */
  film: boolean;
  /** every frame listed: the grip, the weapon's way and the other hand in the eyes' frame */
  frames: boolean;
  canary: boolean;
}

/** A point of the hero's as the eyes see it: across the screen (0 its left edge, 1 its right) and down it (0 its top,
 *  1 its bottom), whether it's in the frame, where it is in the camera's space (m: x right, y up, -z ahead, as the
 *  moves through the eyes are keyed) and the way to it from the camera (which holds behind the camera too, where the
 *  screen's places don't). */
interface Spot {
  x: number;
  y: number;
  on: boolean;
  ahead: boolean;
  /** in the frame or near its edge (`NEAR_FRAME`) */
  near: boolean;
  at: THREE.Vector3;
  way: THREE.Vector3;
}

/** A frame as the eyes saw it. */
interface Seen {
  frame: number;
  /** the cast of the row it's in (0 on, -1 before the first), and how far through it (null outside a cast) */
  cast: number;
  share: number | null;
  /** the skill fired on this frame */
  fires: boolean;
  /** the weapon's tip, and its blade: the middle of the weapon from its grip to its tip */
  tip: Spot;
  blade: Spot;
  /** the hand holding the weapon (its grip), and the other hand (its fist) */
  grip: Spot;
  other: Spot;
  /** a two-hander's lower grip, where the other hand holds it (`Model.offGrip`: none for any other weapon, nor on a
   *  game without it) */
  lower: Spot | null;
  /** a two-hander's lower grip held by the other hand (`Model.lowerGrip`): null for any other weapon; and as it was
   *  when let go of, for why */
  held: boolean | null;
  grasp: LowerGrip | null;
  /** how far the blade moved across the eyes' view since the frame before (degrees), and as seen: only while it's in
   *  or near the frame (passing close beside the eyes out of the view, it swept 90 degrees of their view in a frame,
   *  and that read as the blow) */
  moved: number;
  seenMoved: number;
  /** the arms' joints past their ranges, the worst first (what the eyes see of the body) */
  armsPast: Breach[];
  /** each hand holding a handle: how it holds it, and whether its fist is in the frame */
  fists: SeenFist[];
}

interface SeenFist extends Fist {
  on: boolean;
}

/** idle frames before the press, so the arms are at rest */
const SETTLE_FRAMES = 30;
/** after the last cast: at rest once the blade moves less than this a frame (degrees) for `REST_FRAMES` */
const REST_MOVE = 0.1;
const REST_FRAMES = 10;
/** the most frames followed after the last cast is over */
const AFTER_FRAMES = 240;
/** the most frames a row of casts is followed */
const MOST_FRAMES = 900;
/** a two-hander's other hand out of the frame for longer than this (ms) has it seen in one hand: the frame is too
 *  narrow to hold both fists, a quarter of a metre apart up the handle, through a wind-up beside the head (where a
 *  person's own eyes lose them too) */
const ONE_HAND_SPELL = 200;
/** a spot this far out from the frame's middle is near it (its edge is 1 each way) */
const NEAR_FRAME = 1.3;
/** the blow: the frames round the fastest that move at least this share of it */
const BLOW_SHARE = 0.4;
/** a move whose fastest frame is under this (degrees a frame) has no blow (the canary's frozen arms) */
const NO_BLOW = 1;
/** how far ahead of the hero the skill is aimed (m) */
const AIM_AHEAD = 6;
/** the film: frames across a row, and each frame's width (px) */
const FILM_COLUMNS = 5;
const FILM_WIDTH = 384;
/** where a fist closes, along the hand from its wrist (m, before the model's scale): the other hand is seen there
 *  (read at the wrist, a fist on a two-hander's lower grip at the bottom of the frame read as out of it) */
const FIST_ALONG = 0.08;
/** the canary turns the other arm down this far (rad), out of the frame */
const CANARY_DROP = 1.6;
/** a fist this far off its handle's axis (m), or with its fingers curled less than this (rad, their joints' mean
 *  bend), holds it as an open hand: through the eyes the fingers stood straight out beside the handle */
const FIST_OFF = 0.012;
const FIST_OPEN = 0.5;
/** the canary lifts the weapon this far up the view (m), out of the fists, its lower grip into the frame */
const CANARY_LIFT = 0.15;

/** the ranges of the arms' joints, by their names in `breaches` */
const ARM_RANGE = /^(shoulder|elbow|forearm|wrist)[LR]\./;

/** the joints the canary holds as they were at the press: the arms, and the trunk they hang from (frozen alone, the
 *  arms swung with the trunk's turn, and that read as a blow) */
const FROZEN_JOINTS = ['spine', 'chest', 'shoulderR', 'elbowR', 'handR', 'shoulderL', 'elbowL', 'handL'] as const;

/** Casts the skill through the eyes and reports what the eyes saw; with the canary, again with its faults planted. */
export async function eyes(lab: Lab, options: EyesOptions): Promise<Report> {
  const setup = await lab.setup({ ...options.fixture, view: 'first' });
  bindKnown(options.skill);
  const skill = skillNamed(options.skill);
  const film = options.film ? new Film(options.every) : null;
  const seen = await follow(lab, skill, options.times, film);
  const lines = [`set up as ${JSON.stringify(setup)}`, shouldersSeen(lab), ...describeCasts(seen, skill.def.name)];
  lines.push(describeArmsPast(seen));
  const unseen = seen.filter((frame) => frame.held === false && !frame.other.on);
  if (unseen.length) lines.push(`the two-hander let go of out of the frame, unseen: ${framesOf(unseen)}`);
  if (options.frames) lines.push(...describeFrames(seen));
  lines.push(describeFists(seen));
  const problems = [...oneHanded(seen), ...openFists(seen)].map((line) => `${skill.def.name}: ${line}`);
  if (options.canary) {
    await lab.setup({ ...options.fixture, view: 'first' });
    const planted = await follow(lab, skill, options.times, null, plantFaults(lab));
    const caught = canaryCaught(planted, seen);
    lines.push(`canary, the arms held as they were at the press and the other arm dropped: ${caught.join('; ')}`);
    if (caught.some((verdict) => verdict.startsWith('missed'))) problems.push('the canary was missed');
  }
  const moments: Pictured[] = film ? [film.moment(`${skill.def.name} through the eyes`)] : [];
  return { text: lines.join('\n'), problems, moments };
}

/**
 * The frames from the press of `skill`'s key (held through `times` casts, or as long as the player would) until the
 * arms are at rest again, each as the eyes saw it; `plant`, if given, changes each frame before it's read.
 */
async function follow(
  lab: Lab, skill: BoundSkill, times: number, film: Film | null, plant?: () => void,
): Promise<Seen[]> {
  await lab.step(SETTLE_FRAMES);
  const aim = aheadOf(lab, AIM_AHEAD);
  const holdFrames = Math.round(holdFor(skill.def) / (window.__labClock.frame / 1000));
  const seen: Seen[] = [];
  const casts = new CastCount(lab);
  let resting = 0;
  let after = 0;
  for (let frame = 0; frame < MOST_FRAMES; frame++) {
    const held = casts.started < times || frame < holdFrames;
    await lab.step(1, () => pressing(skill.key, aim, held));
    casts.read();
    plant?.();
    const now = seeFrame(lab, frame, casts, seen[seen.length - 1]);
    seen.push(now);
    await film?.take(lab, now);
    if (casts.started === 0) {
      if (frame > SETTLE_FRAMES) throw new Error(`lab: eyes: ${skill.def.name} was never cast`);
      continue;
    }
    if (actionNow(lab) || casts.started < times) continue;
    resting = now.moved < REST_MOVE ? resting + 1 : 0;
    after++;
    if (resting >= REST_FRAMES || after >= AFTER_FRAMES) break;
  }
  const name = skill.def.name;
  if (casts.started < times) throw new Error(`lab: eyes: ${name} was cast ${casts.started} times of ${times}`);
  return seen;
}

/** Where the shoulders are in the eyes' frame (m: right, up, ahead of the camera), and how far an arm reaches from
 *  one to the middle of its fist: where a pose through the eyes can put the hands. */
function shouldersSeen(lab: Lab): string {
  lab.model.root.updateWorldMatrix(true, true);
  G.camera.updateMatrixWorld();
  const inEyes = (joint: THREE.Object3D) => {
    const at = G.camera.worldToLocal(joint.getWorldPosition(new THREE.Vector3()));
    return `(${at.x.toFixed(2)}, ${at.y.toFixed(2)}, ${(-at.z).toFixed(2)})`;
  };
  const P = lab.joints.P;
  const reach = (P.upperL + P.foreL + P.handR) * lab.model.root.scale.x;
  const shoulders = `left ${inEyes(lab.joints.shoulderL)}, right ${inEyes(lab.joints.shoulderR)}`;
  const frame = 'the eyes\' frame (m: right, up, ahead)';
  return `at rest, the shoulders in ${frame}: ${shoulders}; an arm reaches ${reach.toFixed(2)}`;
}

/** The point `distance` m ahead of the hero, the way he faces. */
function aheadOf(lab: Lab, distance: number): THREE.Vector3 {
  const facing = lab.player.facing;
  const way = new THREE.Vector3(Math.sin(facing), 0, Math.cos(facing));
  return lab.player.pos.clone().addScaledVector(way, distance);
}

/** The casts begun since the press, told apart by the hero's cast state, and whether the current one has fired. */
class CastCount {
  started = 0;
  fires = false;
  private current: object | null = null;
  private fired = false;

  constructor(private readonly lab: Lab) {}

  /** Reads this frame's cast: a new one counted, and whether it fired on this frame. */
  read(): void {
    const now = actionNow(this.lab);
    if (now && now.action !== this.current) {
      this.started++;
      this.fired = false;
    }
    this.current = now?.action ?? null;
    this.fires = Boolean(now?.fired) && !this.fired;
    if (now?.fired) this.fired = true;
  }
}

/** What the hero does this frame, as his model is posed by it (`Player.animateBody`): a dash (a lunge, a charge), a
 *  cast or a channel; how far through it (none for a channel, held as long as its key), and whether it has fired.
 *  (Counted by its casts alone, an instant skill that lunges and a channel were never cast.) */
function actionNow(lab: Lab): { action: object; share: number | null; fired: boolean } | null {
  const { dash, casting, channel } = lab.player;
  if (dash) return { action: dash, share: Math.min(1, dash.t / (dash.dur + dash.hold)), fired: false };
  if (casting) {
    const share = Number.isFinite(casting.dur) ? casting.t / casting.dur : null;
    return { action: casting, share, fired: Boolean(casting.fired) };
  }
  if (channel) return { action: channel, share: null, fired: false };
  return null;
}

/** This frame as the eyes see it. */
function seeFrame(lab: Lab, frame: number, casts: CastCount, last: Seen | undefined): Seen {
  lab.model.root.updateWorldMatrix(true, true);
  G.camera.updateMatrixWorld();
  const action = actionNow(lab);
  const tipObject = lab.model.tip ?? lab.joints.handR;
  const gripObject = lab.model.tip?.parent ?? lab.joints.handR;
  const tip = spotOf(tipObject);
  const grip = spotOf(gripObject);
  const tipAt = tipObject.getWorldPosition(new THREE.Vector3());
  const blade = spotOf(tipAt.lerp(gripObject.getWorldPosition(new THREE.Vector3()), 0.5));
  const lower = lab.model.lowerGrip;
  return {
    frame,
    cast: casts.started - 1,
    share: action?.share ?? null,
    fires: casts.fires,
    tip,
    blade,
    grip,
    other: spotOf(fistOf(lab, lab.joints.handL)),
    lower: lab.model.offGrip ? spotOf(lab.model.offGrip) : null,
    held: lower ? lower.held || lower.free : null,
    grasp: lower ? { ...lower } : null,
    moved: last ? THREE.MathUtils.radToDeg(last.blade.way.angleTo(blade.way)) : 0,
    seenMoved: last?.blade.near && blade.near ? THREE.MathUtils.radToDeg(last.blade.way.angleTo(blade.way)) : 0,
    armsPast: bodyBreaches(lab.joints).found.filter((breach) => ARM_RANGE.test(breach.name)),
    fists: fistsSeen(lab),
  };
}

/** Each hand holding a handle, how it holds it (`Model.fists`: none on a game without it) and whether its fist is in
 *  the frame. */
function fistsSeen(lab: Lab): SeenFist[] {
  return (lab.model.fists ?? []).map((fist) => {
    const hand = fist.hand === 'right' ? lab.joints.handR : lab.joints.handL;
    return { ...fist, on: spotOf(fistOf(lab, hand)).on };
  });
}

/** Where a hand's fist closes (world): along the hand from its wrist (its -y, as the rig hangs the hand). */
function fistOf(lab: Lab, hand: THREE.Object3D): THREE.Vector3 {
  const along = new THREE.Vector3(0, -1, 0).transformDirection(hand.matrixWorld);
  const wrist = hand.getWorldPosition(new THREE.Vector3());
  return wrist.addScaledVector(along, FIST_ALONG * lab.model.root.scale.x);
}

/** Where `object` (or a point of the world) is as the game's camera shows it. */
function spotOf(object: THREE.Object3D | THREE.Vector3): Spot {
  const world = object instanceof THREE.Vector3 ? object.clone() : object.getWorldPosition(new THREE.Vector3());
  const at = G.camera.worldToLocal(world.clone());
  const way = at.clone().normalize();
  const ndc = world.project(G.camera);
  const ahead = way.z < 0;
  const on = ahead && Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1;
  const near = ahead && Math.abs(ndc.x) <= NEAR_FRAME && Math.abs(ndc.y) <= NEAR_FRAME;
  return { x: (ndc.x + 1) / 2, y: (1 - ndc.y) / 2, on, ahead, near, at, way };
}

/** The frames of a blow: the fastest frame's index, and the frames round it moving at least `BLOW_SHARE` of it. */
interface Blow {
  from: number;
  to: number;
  fastest: number;
}

/** The blow among `frames` (indices into them), or null when nothing moved. */
function blowIn(frames: Seen[]): Blow | null {
  let fastest = -1;
  for (let i = 1; i < frames.length; i++) {
    if (fastest < 0 || frames[i].seenMoved > frames[fastest].seenMoved) fastest = i;
  }
  if (fastest < 0) return null;
  const least = frames[fastest].seenMoved * BLOW_SHARE;
  let from = fastest;
  while (from > 1 && frames[from - 1].seenMoved >= least) from--;
  let to = fastest;
  while (to < frames.length - 1 && frames[to + 1].seenMoved >= least) to++;
  return { from, to, fastest };
}

/** Each cast's frames, from the frame before it began (the arms as they were) to the next cast's start or the end. */
function castFrames(seen: Seen[]): Seen[][] {
  const casts: Seen[][] = [];
  for (const [i, now] of seen.entries()) {
    if (now.cast < 0) continue;
    if (!casts[now.cast]) casts[now.cast] = i > 0 ? [seen[i - 1]] : [];
    casts[now.cast].push(now);
  }
  return casts;
}

/** Each cast of the row as words. */
function describeCasts(seen: Seen[], name: string): string[] {
  return castFrames(seen).map((frames, i) => `${name} ${i + 1}: ${describeCast(frames)}`);
}

/** One cast as words: where the blade began, the wind-up, the blow, where the skill fired and where the blade ended. */
function describeCast(frames: Seen[]): string {
  const start = frames[0];
  const blow = blowIn(frames);
  const parts = [`${frames.length - 1} frames; the blade from ${describeSpot(start.blade)}`];
  if (!blow || frames[blow.fastest].seenMoved < NO_BLOW) {
    return `${parts[0]}; no blow (at most ${speedOf(blow, frames)})`;
  }
  const into = frames[blow.from - 1];
  const out = frames[blow.to];
  const wound = hidden(frames, 1, blow.from);
  parts.push(`wound up to ${describeSpot(into.blade)} by frame ${into.frame} (${shareOf(into)})${wound}`);
  const count = blow.to - blow.from + 1;
  const ms = Math.round(count * window.__labClock.frame);
  const span = `${shareOf(frames[blow.from])} to ${shareOf(out)}`;
  const fastest = `the fastest ${speedOf(blow, frames)} on frame ${frames[blow.fastest].frame}`;
  parts.push(`the blow over ${count} frames (${ms} ms, ${span}) to ${describeSpot(out.blade)}, ${fastest}`);
  const fired = frames.find((frame) => frame.fires);
  if (fired) parts.push(`it fired on frame ${fired.frame} (${shareOf(fired)}, ${firedAgainst(fired, frames, blow)})`);
  const end = frames[frames.length - 1];
  parts.push(`ending at ${describeSpot(end.blade)}${hidden(frames, blow.to + 1, frames.length)}`);
  return parts.join('; ');
}

/** The fastest frame of a blow, as words (degrees of the view a frame). */
function speedOf(blow: Blow | null, frames: Seen[]): string {
  const fastest = blow ? frames[blow.fastest].seenMoved : 0;
  return `${fastest.toFixed(1)}° of the view a frame`;
}

/** Where the skill fired against the blow: before it, in it, or after it, by frames. */
function firedAgainst(fired: Seen, frames: Seen[], blow: Blow): string {
  const at = frames.indexOf(fired);
  if (at < blow.from) return `${blow.from - at} frames before the blow, the blade at ${describeSpot(fired.blade)}`;
  if (at > blow.to) return `${at - blow.to} frames after the blow, the blade at ${describeSpot(fired.blade)}`;
  return `in the blow, the blade at ${describeSpot(fired.blade)}`;
}

/** How many of `frames` from `from` up to `to` had the blade out of the frame, as words (none: nothing). */
function hidden(frames: Seen[], from: number, to: number): string {
  const out = frames.slice(from, to).filter((frame) => !frame.blade.on).length;
  return out ? `, out of the frame on ${out}` : '';
}

/** A spot as words. */
function describeSpot(spot: Spot): string {
  if (!spot.ahead) return 'behind the eyes';
  const at = `${Math.round(spot.x * 100)}% across, ${Math.round(spot.y * 100)}% down`;
  return spot.on ? at : `${at} (out of the frame)`;
}

/** A frame's share of its cast, as words. */
function shareOf(frame: Seen): string {
  return frame.share === null ? 'after the cast' : `${frame.share.toFixed(2)} of the cast`;
}

/** The frames a two-hander was seen in one hand: let go of by the other hand in the frame (below it, out of the view,
 *  it isn't seen), or its lower grip in the frame with that hand out of it for longer than `ONE_HAND_SPELL`; as
 *  problems (none for any other weapon). (A fist below the frame on a handle that runs out of it is lost to a
 *  person's own eyes too: counted as soon as the weapon's hand was seen, the middle guard read as one-handed.) */
function oneHanded(seen: Seen[]): string[] {
  const two = seen.filter((frame) => frame.held !== null);
  const letGo = two.filter((frame) => frame.held === false && frame.other.on);
  const unseen = longSpells(seen, (frame) => !frame.other.on && (frame.lower?.on ?? (Boolean(frame.held) && frame.grip.on)));
  const problems: string[] = [];
  if (letGo.length) {
    const worst = letGo.reduce((most, frame) => (farFromHeld(frame.grasp!) > farFromHeld(most.grasp!) ? frame : most));
    const why = `the worst, frame ${worst.frame}: ${whyLetGo(worst.grasp!)}`;
    problems.push(`the two-hander let go of by the other hand on ${framesOf(letGo)}; ${why}`);
  }
  if (unseen.length) problems.push(`the two-hander seen in one hand, its lower grip bare: ${framesOf(unseen)}`);
  return problems;
}

/** Whether a fist holds its handle as an open hand: off it, or its fingers barely curled. */
function isOpen(fist: Fist): boolean {
  return fist.off > FIST_OFF || fist.curl < FIST_OPEN;
}

/** A fist on its handle, as words. */
function describeFist(fist: Fist): string {
  const off = `the handle ${(fist.off * 100).toFixed(1)} cm from where the fist closes`;
  return `${off}, the fingers curled ${THREE.MathUtils.radToDeg(fist.curl).toFixed(0)}°`;
}

/** Each hand's fist on its handle over every frame: the furthest off it and the least curled, seen or not. */
function describeFists(seen: Seen[]): string {
  const hands = (['right', 'left'] as const).flatMap((hand) => {
    const fists = seen.flatMap((frame) => frame.fists.filter((fist) => fist.hand === hand));
    if (!fists.length) return [];
    const off = Math.max(...fists.map((fist) => fist.off));
    const curl = Math.min(...fists.map((fist) => fist.curl));
    return [`${hand}, at most ${(off * 100).toFixed(1)} cm off, curled ${THREE.MathUtils.radToDeg(curl).toFixed(0)}° at least`];
  });
  return `the fists on their handles: ${hands.join('; ') || 'none'}`;
}

/** The frames a hand was seen holding its handle as an open hand, each hand's as a problem. */
function openFists(seen: Seen[]): string[] {
  const problems: string[] = [];
  for (const hand of ['right', 'left'] as const) {
    const fistIn = (frame: Seen) => frame.fists.find((fist) => fist.hand === hand);
    const open = seen.filter((frame) => {
      const fist = fistIn(frame);
      return fist !== undefined && fist.on && isOpen(fist);
    });
    if (!open.length) continue;
    const worst = open.reduce((most, frame) => (fistIn(frame)!.off > fistIn(most)!.off ? frame : most));
    const why = `the worst, frame ${worst.frame}: ${describeFist(fistIn(worst)!)}`;
    problems.push(`the ${hand} hand open on its handle, seen: ${framesOf(open)}; ${why}`);
  }
  return problems;
}

/** Every frame as a line: its share of the cast, where the grip and the other hand are and the weapon's way, in the
 *  camera's space as the moves through the eyes are keyed, and whether a two-hander's lower grip is held. */
function describeFrames(seen: Seen[]): string[] {
  const lines = ['each frame, in the camera\'s space (m: x right, y up, -z ahead):'];
  for (const now of seen) {
    const share = now.share === null ? '' : ` (${now.share.toFixed(2)})`;
    const weapon = now.tip.at.clone().sub(now.grip.at).normalize();
    const held = now.held === null ? '' : `, ${now.held ? 'held' : `let go: ${whyLetGo(now.grasp!)}`}`;
    const past = now.armsPast.length ? `; past: ${now.armsPast.map(describeBreach).join(', ')}` : '';
    const fists = now.fists.map((fist) => `; the ${fist.hand} fist: ${describeFist(fist)}`).join('');
    const parts = [
      `the grip ${triple(now.grip.at)}`,
      `the weapon ${triple(weapon)}`,
      `the other hand ${triple(now.other.at)}`,
    ];
    lines.push(`  ${now.frame}${share}${now.fires ? ' fires' : ''}: ${parts.join(', ')}${held}${fists}${past}`);
  }
  return lines;
}

/** The arms' joints past their ranges over every frame, the worst first: each one's worst, and on how many frames. */
function describeArmsPast(seen: Seen[]): string {
  const worst = new Map<string, { breach: Breach; frame: number; frames: number }>();
  for (const now of seen) {
    for (const breach of now.armsPast) {
      const record = worst.get(breach.name);
      if (!record) worst.set(breach.name, { breach, frame: now.frame, frames: 1 });
      else {
        record.frames++;
        if (breach.by > record.breach.by) Object.assign(record, { breach, frame: now.frame });
      }
    }
  }
  if (worst.size === 0) return 'the arms within their ranges throughout';
  const records = [...worst.values()].sort((a, b) => b.breach.by - a.breach.by);
  const words = records.map((r) => `${describeBreach(r.breach)} on ${r.frames} frames, the worst on ${r.frame}`);
  return `the arms past their ranges, the worst first: ${words.join('; ')}`;
}

/** A point or a way as words, to the centimetre. */
function triple(v: THREE.Vector3): string {
  return `(${v.toArray().map((value) => value.toFixed(2)).join(', ')})`;
}

/** The frames of each run of frames in a row that `holds` for longer than `ONE_HAND_SPELL`. */
function longSpells(seen: Seen[], holds: (frame: Seen) => boolean): Seen[] {
  const longest = ONE_HAND_SPELL / window.__labClock.frame;
  const found: Seen[] = [];
  let spell: Seen[] = [];
  for (const frame of [...seen, null]) {
    if (frame && holds(frame)) {
      spell.push(frame);
      continue;
    }
    if (spell.length > longest) found.push(...spell);
    spell = [];
  }
  return found;
}

/** Frames as words: how many, and the first few. */
function framesOf(frames: Seen[]): string {
  const first = frames.slice(0, 6).map((frame) => frame.frame).join(', ');
  return `${frames.length} frames (${first}${frames.length > 6 ? '...' : ''})`;
}

/** The canary's faults, planted after each frame: the arms held as they were at the press (no blow), the other arm
 *  turned down out of the frame, and the weapon lifted up the view out of the fists (open hands; a two-hander's lower
 *  grip in the frame with no hand on it). */
function plantFaults(lab: Lab): () => void {
  let held: THREE.Quaternion[] | null = null;
  return () => {
    const joints = FROZEN_JOINTS.map((name) => lab.joints[name]);
    held ??= joints.map((joint) => joint.quaternion.clone());
    joints.forEach((joint, i) => joint.quaternion.copy(held![i]));
    lab.joints.shoulderL.rotateX(CANARY_DROP);
    lab.model.root.updateWorldMatrix(true, true);
    const grip = lab.model.tip?.parent;
    if (grip?.parent) liftInView(grip, CANARY_LIFT);
    lab.model.root.updateWorldMatrix(true, true);
  };
}

/** Moves `object` up the eyes' view by `by` (m). */
function liftInView(object: THREE.Object3D, by: number): void {
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(G.camera.getWorldQuaternion(new THREE.Quaternion()));
  const lifted = object.getWorldPosition(new THREE.Vector3()).addScaledVector(up, by);
  object.position.copy(object.parent!.worldToLocal(lifted));
}

/** Whether the canary's faults were caught, each as words: `caught ...` or `missed ...`. */
function canaryCaught(planted: Seen[], seen: Seen[]): string[] {
  const still = castFrames(planted).every((frames) => {
    const blow = blowIn(frames);
    return !blow || frames[blow.fastest].seenMoved < NO_BLOW;
  });
  const verdicts = [still ? 'caught: no blow' : 'missed: the frozen arms still read as a blow'];
  if (seen.some((frame) => frame.held !== null)) {
    const caught = oneHanded(planted).length > 0;
    verdicts.push(caught ? 'caught: the two-hander seen in one hand' : 'missed: the dropped arm read as holding');
  }
  if (seen.some((frame) => frame.fists.some((fist) => fist.on))) {
    const caught = openFists(planted).length > 0;
    verdicts.push(caught ? 'caught: a fist off its handle' : 'missed: the lifted weapon read as held');
  }
  return verdicts;
}

/** The film: every `every`th frame pictured through the eyes, small, in rows, each with its frame and share. */
class Film {
  private readonly frames: HTMLCanvasElement[] = [];

  constructor(private readonly every: number) {}

  /** Pictures `now`'s frame, if it's one the film takes. */
  async take(lab: Lab, now: Seen): Promise<void> {
    if (now.frame % this.every !== 0) return;
    const [tile] = lab.capture(['eyes']);
    const image = await createImageBitmap(await (await fetch(tile.png)).blob());
    const canvas = document.createElement('canvas');
    canvas.width = FILM_WIDTH;
    canvas.height = Math.round(FILM_WIDTH * tile.height / tile.width);
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    image.close();
    label(context, `${now.frame}  ${now.share === null ? '' : now.share.toFixed(2)}${now.fires ? '  fires' : ''}`);
    this.frames.push(canvas);
  }

  /** The film as one picture, a moment of the report. */
  moment(name: string): Pictured {
    const rows = Math.ceil(this.frames.length / FILM_COLUMNS);
    const height = this.frames[0]?.height ?? 0;
    const sheet = document.createElement('canvas');
    sheet.width = FILM_WIDTH * Math.min(FILM_COLUMNS, this.frames.length);
    sheet.height = height * rows;
    const context = sheet.getContext('2d')!;
    this.frames.forEach((frame, i) => {
      context.drawImage(frame, (i % FILM_COLUMNS) * FILM_WIDTH, Math.floor(i / FILM_COLUMNS) * height);
    });
    const png = sheet.toDataURL('image/png');
    return { label: name, tiles: [{ view: 'eyes', png, width: sheet.width, height: sheet.height }], notes: [] };
  }
}

/** `text` written on a film frame's top left. */
function label(context: CanvasRenderingContext2D, text: string): void {
  context.font = 'bold 15px system-ui, sans-serif';
  context.lineWidth = 3;
  context.strokeStyle = '#000';
  context.fillStyle = '#fff';
  context.strokeText(text, 6, 18);
  context.fillText(text, 6, 18);
}
