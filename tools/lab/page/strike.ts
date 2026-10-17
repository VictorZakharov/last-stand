// tools/lab strikes: how a held weapon strikes, frame by frame, as physics has a blow land (lab eyes): how fast its
// striking part moves against the eyes, which carry the arms, and whether its striking side leads the way it moves
// (models/weapons.ts `STRIKES_WITH`: a blade's edge, an axe's bit, a maul's face) or its flat does; how much of the
// motion runs along it (a thrust, a draw); how flat the plane it's swung in is; how much faster its striking part
// moves than its hilt (a cut swung round, its tip arcing, or the whole blade slid across); and how long it takes to
// slow after the blow (carried through, stopped by the floor it was driven into, or stopped dead in the air). (The
// owner, of the cuts through the eyes: "it should
// strike according to physics... blade parallel to strike direction"; broadside to the eyes through the blow, the
// flat led every cut. And: "it strikes with whole blade, but it should strike with tip", "strikes feel fake and having
// no momentum".)
import * as THREE from 'three';
import type { Lab } from './lab';
import * as weaponsCode from '../../../src/entities/models/weapons';
import type { StrikingSide } from '../../../src/entities/models/weapons';
import { groundHeight } from '../../../src/world/ground';
import { G } from '../../../src/state';

/** The game's weapon code as far as it goes: `--ab` runs this on main's game, which may not say a striking side (its
 *  weapons read as two-edged then, and the report says so). */
const weaponSides = (weaponsCode as Partial<typeof weaponsCode>).STRIKES_WITH;
const ASSUMED_SIDE: StrikingSide = 'edges';

/** where along the weapon its blow lands, a share of the way from the grip to its tip: a blade's centre of
 *  percussion, about a hafted weapon's head */
const PERCUSSION = 0.75;
/** the frames of a strike: those whose striking part moves at least this share of the fastest */
const STRIKE_SHARE = 0.4;
/** the most a strike's edge may be off the way it moves, speed-weighted over it (degrees), and how far off a frame
 *  leads with its flat */
const LEAD_MOST = 30;
const FLAT_FROM = 45;
/** a blow lands as its skill fires: its fastest frame is from this many frames before the firing to this many after
 *  (the skill's own timing: a hit is dealt then) */
const LANDS_BEFORE = 6;
const LANDS_AFTER = 4;
/** a cut swings its weapon round: its striking part at the blow at least this share as many times as fast as its hilt
 *  as the arm and the weapon swung round the shoulder as one would move it (`StrikeFrame.rigid`; a blade slid across,
 *  the whole of it moving as one, is 1; a wrist's snap is more). (Held to 2 for every weapon, a sword's whip, a
 *  mace's head nearer the hand failed by its length alone: swung round the shoulder as one, it is 1.5.) A spin's
 *  is carried round the body's own up through it rather than the shoulder (`StrikeTracker`'s `spins`: held out low,
 *  its hands at the arm's length from the shoulder, Steel Tempest's two-hander read as slid across, 2.0 to the
 *  shoulder's 2.7, carried round as one). */
const WHIP_LEAST = 1;
/** a blow carries on through: its striking part slows to `STOP_SHARE` of its fastest no sooner than this (ms) */
const STOP_SHARE = 0.2;
const STOP_LEAST = 60;
/** but a blow driven into the ground stops dead there, as it should (Thunder Crescent's): one whose weapon's lowest
 *  point is within this of the floor as it stops was stopped by it (m), and one further under it has sunk into it */
const FLOOR_NEAR = 0.06;

/** A frame of a held weapon. */
export interface StrikeFrame {
  /** the held weapon's base (its group's name), and its striking side */
  weapon: string;
  side: StrikingSide;
  /** where its blow lands (world), how fast it moves there (m/s, the world's), and its hilt (its grip's place) */
  point: THREE.Vector3;
  speed: number;
  gripSpeed: number;
  /** how far its striking side is off the way its striking part moves square to its length (degrees: 0 its edge, bit
   *  or face leading, 90 its flat, 180 an axe's poll); null when it moves too little to tell, or strikes all round */
  lead: number | null;
  /** the share of that motion along its length (a thrust or a draw rather than a cut) */
  along: number;
  /** its length's way (the world's), for the plane it's swung in */
  axis: THREE.Vector3;
  /** how many times as fast as its hilt its striking part would move swung round its pivot with the arm as one (the
   *  ratio of their distances from it), the whip's measure, and that pivot */
  rigid: number;
  pivot: Pivot;
  /** how far its lowest point is over the floor under it (m; less than 0, under it) */
  low: number;
}

/** What a weapon is swung round as one with the arm: the holding arm's shoulder, or a spin's line up through the
 *  body (`StrikeTracker`) */
export type Pivot = 'shoulder' | 'body';

/** The weapon the hero's tip is on: the grip's child seen, named for a base, its hilt (the grip's place), where its
 *  blow lands, the shoulder of the arm holding it, the body's place, the way of its length and the eyes' place (world),
 *  and how far its lowest point is over the floor (`StrikeFrame.low`). */
interface Held {
  weapon: THREE.Object3D;
  grip: THREE.Vector3;
  point: THREE.Vector3;
  shoulder: THREE.Vector3;
  body: THREE.Vector3;
  axis: THREE.Vector3;
  eyes: THREE.Vector3;
  low: number;
}

/** Whether this game says its weapons' striking sides (models/weapons.ts `STRIKES_WITH`). */
export const SIDES_NAMED = Boolean(weaponSides);

/** Whether `object` is a weapon, by its name: a base this game says a striking side for, or any named. */
export const isWeapon = (object: THREE.Object3D) => (weaponSides ? object.name in weaponSides : object.name !== '');

/** The weapon the hero's tip is on, if any (the world matrices current). */
function heldNow(lab: Lab): Held | null {
  const tip = lab.model.tip;
  const grip = tip?.parent;
  const weapon = grip?.children.find((child) => child.visible && isWeapon(child));
  if (!tip || !grip || !weapon) return null;
  const from = grip.getWorldPosition(new THREE.Vector3());
  const point = from.clone().lerp(tip.getWorldPosition(new THREE.Vector3()), PERCUSSION);
  const shoulder = lab.joints[`shoulder${heldIn(lab, grip)}`].getWorldPosition(new THREE.Vector3());
  const body = lab.joints.body.getWorldPosition(new THREE.Vector3());
  const eyes = G.camera.getWorldPosition(new THREE.Vector3());
  return { weapon, grip: from, point, shoulder, body, axis: axisOf(weapon), eyes, low: overFloor(weapon) };
}

/** How far the lowest point of `weapon` as drawn (its meshes seen, the world matrices current) is over the floor
 *  under it (m; less than 0, under it). */
function overFloor(weapon: THREE.Object3D): number {
  const point = new THREE.Vector3();
  const lowest = new THREE.Vector3(0, Infinity, 0);
  weapon.traverseVisible((object) => {
    const mesh = object as THREE.Mesh;
    const positions = mesh.isMesh ? mesh.geometry.getAttribute('position') : undefined;
    if (!positions) return;
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld);
      if (point.y < lowest.y) lowest.copy(point);
    }
  });
  return lowest.y - groundHeight(lowest.x, lowest.z);
}

/** How many times as far from `pivot` as its hilt the held weapon's blow lands (`StrikeFrame.rigid`): from the
 *  shoulder, or from the line up through the body (the world's up: a spin turns the body about it). */
function rigidRound(held: Held, pivot: Pivot): number {
  const from = (at: THREE.Vector3) => (pivot === 'shoulder'
    ? at.distanceTo(held.shoulder)
    : Math.hypot(at.x - held.body.x, at.z - held.body.z));
  return from(held.point) / Math.max(1e-6, from(held.grip));
}

/** Which hand holds `grip`: the hand joint it hangs under (the right's when under neither). */
function heldIn(lab: Lab, grip: THREE.Object3D): 'R' | 'L' {
  for (let at: THREE.Object3D | null = grip; at; at = at.parent) {
    if (at === lab.joints.handL) return 'L';
    if (at === lab.joints.handR) return 'R';
  }
  return 'R';
}

/** A weapon's length (its +Y) and its striking side (its +X), the world's ways. */
const axisOf = (weapon: THREE.Object3D) => new THREE.Vector3(0, 1, 0).transformDirection(weapon.matrixWorld);
const sideOf = (weapon: THREE.Object3D) => new THREE.Vector3(1, 0, 0).transformDirection(weapon.matrixWorld);

/** Where the held weapon's blow lands, followed from frame to frame: how far it moved since the last against the eyes,
 *  which carry the arms (a weapon changed from one hand to the other has no last place: the other's isn't its). (In
 *  the world's own space, Bull Rush's run carried the hilt along at the body's pace, and a cut swung as it ended read
 *  as slid across.) */
class Follower {
  private last: Held | null = null;
  private readonly carried = new THREE.Vector3();
  /** how far the hilt moved, with the blow's point (`moved`) */
  readonly gripMoved = new THREE.Vector3();
  /** and the way of the weapon's length between the two frames: square to the point's move as it's turned round the
   *  hilt, as its way at either end isn't (`moved`) */
  readonly axisBetween = new THREE.Vector3();

  moved(now: Held | null): THREE.Vector3 | null {
    const before = this.last;
    this.last = now;
    if (!now || !before || before.weapon !== now.weapon) return null;
    const carried = this.carried.copy(now.eyes).sub(before.eyes);
    this.gripMoved.copy(now.grip).sub(before.grip).sub(carried);
    this.axisBetween.copy(before.axis).add(now.axis).normalize();
    return now.point.clone().sub(before.point).sub(carried);
  }
}

/** The weapon the hero's tip is on, followed frame by frame; swung round the holding arm's shoulder, or carried round
 *  the body by a spin (`spins`). */
export class StrikeTracker {
  private readonly follower = new Follower();
  private readonly pivot: Pivot;

  constructor(private readonly lab: Lab, spins = false) {
    this.pivot = spins ? 'body' : 'shoulder';
  }

  /** This frame's, `dt` s after the last (null when the tip is on no weapon). The world matrices must be current. */
  next(dt: number): StrikeFrame | null {
    const held = heldNow(this.lab);
    const moved = this.follower.moved(held);
    if (!held) return null;
    const { weapon, axis } = held;
    const side = weaponSides?.[weapon.name] ?? ASSUMED_SIDE;
    const velocity = (moved ?? new THREE.Vector3()).divideScalar(dt);
    const speed = velocity.length();
    const gripSpeed = moved ? this.follower.gripMoved.length() / dt : 0;
    // (against the weapon's way between the frames: against its way at the frame's end, a blade turned 25 degrees a
    // frame round its hilt moved 22% along itself, its move a chord, and a two-hander's rising cut read as a draw)
    const between = moved ? this.follower.axisBetween : axis;
    const along = speed > 0 ? Math.abs(velocity.dot(between)) / speed : 0;
    const lead = leadOf(velocity, axis, sideOf(weapon), side);
    const rigid = rigidRound(held, this.pivot);
    const { pivot } = this;
    const { point, low } = held;
    return { weapon: weapon.name, side, point, speed, gripSpeed, lead, along, axis, rigid, pivot, low };
  }
}

/**
 * A fault for the canary: each frame, the grip the tip is on (the weapon and its tip with it) held at the turn it had
 * on the first (the world's), so the weapon only slides with the hand, which the whip must read as about 1; `restore`
 * puts every grip it held back as it was.
 */
export function plantSlide(lab: Lab): { plant: () => void; restore: () => void } {
  const turned = new Map<THREE.Object3D, { local: THREE.Quaternion; world: THREE.Quaternion }>();
  const plant = () => {
    lab.model.root.updateWorldMatrix(true, true);
    const grip = lab.model.tip?.parent;
    if (!grip?.parent) return;
    if (!turned.has(grip)) {
      turned.set(grip, { local: grip.quaternion.clone(), world: grip.getWorldQuaternion(new THREE.Quaternion()) });
    }
    const parent = grip.parent.getWorldQuaternion(new THREE.Quaternion());
    grip.quaternion.copy(parent.invert().multiply(turned.get(grip)!.world));
    grip.updateMatrixWorld(true);
  };
  const restore = () => {
    for (const [grip, { local }] of turned) grip.quaternion.copy(local);
  };
  return { plant, restore };
}

/**
 * A fault for the canary: each frame, the weapon the tip is on turned about its length so its striking side is
 * `angle` (degrees) off the way its blow's point moves (0: leading; 90: its flat leading), which the measure must read
 * so; `restore` puts every weapon it turned back as it was.
 */
export function plantLead(lab: Lab, angle: number): { plant: () => void; restore: () => void } {
  const turned = new Map<THREE.Object3D, THREE.Quaternion>();
  const follower = new Follower();
  const plant = () => {
    lab.model.root.updateWorldMatrix(true, true);
    const held = heldNow(lab);
    const moved = follower.moved(held);
    if (!held || !moved) return;
    const { weapon } = held;
    if (!turned.has(weapon)) turned.set(weapon, weapon.quaternion.clone());
    const axis = axisOf(weapon);
    const square = moved.addScaledVector(axis, -moved.dot(axis));
    if (square.lengthSq() < 1e-10) return;
    const want = square.normalize().applyAxisAngle(axis, THREE.MathUtils.degToRad(angle));
    const side = sideOf(weapon);
    const turn = Math.atan2(new THREE.Vector3().crossVectors(side, want).dot(axis), side.dot(want));
    weapon.rotateY(turn);
    weapon.updateMatrixWorld(true);
    // (in a mirrored grip, the left hand's, a turn about its own length goes the other way round)
    if (sideOf(weapon).dot(want) < 0.999) {
      weapon.rotateY(-2 * turn);
      weapon.updateMatrixWorld(true);
    }
  };
  const restore = () => {
    for (const [weapon, quaternion] of turned) weapon.quaternion.copy(quaternion);
  };
  return { plant, restore };
}

/** How far `striking` (a unit way) is off `velocity` square to `axis` (degrees), as `StrikeFrame.lead`. */
function leadOf(velocity: THREE.Vector3, axis: THREE.Vector3, striking: THREE.Vector3, side: StrikingSide):
  number | null {
  if (side === 'round') return null;
  const square = velocity.clone().addScaledVector(axis, -velocity.dot(axis));
  if (square.lengthSq() < 1e-8) return null;
  const cos = THREE.MathUtils.clamp(square.normalize().dot(striking), -1, 1);
  // (a two-sided weapon leads with whichever side is ahead)
  return THREE.MathUtils.radToDeg(Math.acos(side === 'bit' ? cos : Math.abs(cos)));
}

/** A strike's frames and what they say. */
export interface Strike {
  weapon: string;
  side: StrikingSide;
  /** the fastest frame (its index among the frames given), its speed, and the frames moving `STRIKE_SHARE` of it */
  fastest: number;
  speed: number;
  from: number;
  to: number;
  /** a frame outside it moving faster than it does, the fastest such (its index and speed) */
  outrun: { at: number; speed: number } | null;
  /** its striking side off the way it moves, speed-weighted over the strike (degrees; null: all round), the worst
   *  frame, and the frames led by its flat */
  lead: number | null;
  worst: number | null;
  flat: number;
  /** the share of its motion along its length, speed-weighted */
  along: number;
  /** how far its length is out of the plane it's swung in, the root mean square over the strike (degrees) */
  plane: number;
  /** at its fastest, how many times as fast as its hilt its striking part moves (Infinity: the hilt still), and as
   *  the arm and the weapon swung round their pivot as one would move it (`StrikeFrame.rigid`, `pivot`) */
  whip: number;
  rigid: number;
  pivot: Pivot;
  /** how long after its fastest it slows to `STOP_SHARE` of it (ms; null: not before the frames end), and how far
   *  its lowest point is over the floor by then (m: the least from its fastest frame to that one; null: not slowed) */
  stop: number | null;
  grounded: number | null;
}

/** The fastest of `frames` from `from` to `to` (indices, both in), or -1 where none moves. */
function fastestIn(frames: (StrikeFrame | null)[], from: number, to: number): number {
  let fastest = -1;
  for (let i = Math.max(0, from); i <= Math.min(frames.length - 1, to); i++) {
    const frame = frames[i];
    if (frame && (fastest < 0 || frame.speed > frames[fastest]!.speed)) fastest = i;
  }
  return fastest >= 0 && frames[fastest]!.speed > 0 ? fastest : -1;
}

/**
 * The strike among `frames` (a cast's, null where no weapon was held): the blow that lands as the skill fires (the
 * fastest frame within `LANDS_BEFORE` before the frame `fires` to `LANDS_AFTER` after it), or with no firing the
 * fastest of all, and the frames round it; and the fastest frame outside it, if that's faster (a wind-up outrunning
 * the blow, a weapon jumping between two moves). `frameMs`: a frame's length.
 */
export function strikeIn(frames: (StrikeFrame | null)[], fires: number, frameMs: number): Strike | null {
  const fastest = fires < 0
    ? fastestIn(frames, 0, frames.length - 1)
    : fastestIn(frames, fires - LANDS_BEFORE, fires + LANDS_AFTER);
  if (fastest < 0) return null;
  const top = frames[fastest]!;
  const least = top.speed * STRIKE_SHARE;
  const fast = (i: number) => Boolean(frames[i] && frames[i]!.speed >= least && frames[i]!.weapon === top.weapon);
  let from = fastest;
  while (from > 0 && fast(from - 1)) from--;
  let to = fastest;
  while (to < frames.length - 1 && fast(to + 1)) to++;
  const strike = frames.slice(from, to + 1) as StrikeFrame[];
  const elsewhere = [fastestIn(frames, 0, from - 1), fastestIn(frames, to + 1, frames.length - 1)]
    .filter((i) => i >= 0 && frames[i]!.speed > top.speed)
    .sort((a, b) => frames[b]!.speed - frames[a]!.speed);
  const outrun = elsewhere.length ? { at: elsewhere[0], speed: frames[elsewhere[0]]!.speed } : null;
  const whip = top.gripSpeed > 0 ? top.speed / top.gripSpeed : Infinity;
  const stopped = stopAt(frames, fastest);
  const stop = stopped < 0 ? null : (stopped - fastest) * frameMs;
  const grounded = stopped < 0 ? null : lowestOver(frames, fastest, stopped);
  const { rigid, pivot } = top;
  const found = {
    weapon: top.weapon, side: top.side, fastest, speed: top.speed, from, to, outrun, whip, rigid, pivot, stop,
    grounded,
  };
  return { ...found, ...leadsOver(strike) };
}

/** The frame after `fastest` the weapon there has slowed to `STOP_SHARE` of its speed by (its index), or -1 if it
 *  never does. */
function stopAt(frames: (StrikeFrame | null)[], fastest: number): number {
  const top = frames[fastest]!;
  for (let i = fastest + 1; i < frames.length; i++) {
    const frame = frames[i];
    if (!frame || frame.weapon !== top.weapon || frame.speed < top.speed * STOP_SHARE) return i;
  }
  return -1;
}

/** How far over the floor the weapon held on `from` came from there to `to` (indices, both in; m, the least). */
function lowestOver(frames: (StrikeFrame | null)[], from: number, to: number): number {
  const weapon = frames[from]!.weapon;
  const lows = frames.slice(from, to + 1).flatMap((frame) => (frame?.weapon === weapon ? [frame.low] : []));
  return Math.min(...lows);
}

/** `frames` as if the floor were `by` under where it is (m): the canary's, a blow stopped by the floor read as one
 *  stopped in the air. */
export function floorLowered(frames: (StrikeFrame | null)[], by: number): (StrikeFrame | null)[] {
  return frames.map((frame) => frame && { ...frame, low: frame.low + by });
}

/** The leads, the motion along it and the plane over a strike's frames. */
function leadsOver(strike: StrikeFrame[]): Pick<Strike, 'lead' | 'worst' | 'flat' | 'along' | 'plane'> {
  const led = strike.filter((frame) => frame.lead !== null);
  const weight = (frames: StrikeFrame[]) => frames.reduce((sum, frame) => sum + frame.speed, 0);
  const weighted = (frames: StrikeFrame[], value: (frame: StrikeFrame) => number) =>
    frames.reduce((sum, frame) => sum + value(frame) * frame.speed, 0) / weight(frames);
  return {
    lead: led.length ? weighted(led, (frame) => frame.lead!) : null,
    worst: led.length ? Math.max(...led.map((frame) => frame.lead!)) : null,
    flat: led.filter((frame) => frame.lead! >= FLAT_FROM && frame.lead! <= 180 - FLAT_FROM).length,
    along: weighted(strike, (frame) => frame.along),
    plane: planeOf(strike.map((frame) => frame.axis)),
  };
}

/** How far `axes` are out of the plane they're swung in (degrees, the root mean square): the plane through its
 *  first and last (the widest arc of a strike), or 0 when they're as one. */
function planeOf(axes: THREE.Vector3[]): number {
  const normal = new THREE.Vector3().crossVectors(axes[0], axes[axes.length - 1]);
  if (normal.lengthSq() < 1e-6) return 0;
  normal.normalize();
  const square = axes.reduce((sum, axis) => sum + axis.dot(normal) ** 2, 0) / axes.length;
  return THREE.MathUtils.radToDeg(Math.asin(Math.min(1, Math.sqrt(square))));
}

const degrees = (angle: number) => `${angle.toFixed(0)}°`;

/** A strike as a line of the report. */
export function describeStrike(strike: Strike, share: (i: number) => string): string {
  const lead = strike.lead === null
    ? 'struck all round (no side leads)'
    : `its ${sideName(strike.side)} off the way it moves by ${degrees(strike.lead)} (speed-weighted; the worst `
      + `${degrees(strike.worst!)}, the flat leading on ${strike.flat} of its frames)`;
  const assumed = weaponSides ? '' : ` (this game names no striking side: read as ${ASSUMED_SIDE})`;
  return `the strike${assumed} (the ${strike.weapon} moving at least ${STRIKE_SHARE * 100}% of its fastest, `
    + `${strike.speed.toFixed(1)} m/s at ${share(strike.fastest)}; ${strike.to - strike.from + 1} frames): ${lead}; `
    + `${(strike.along * 100).toFixed(0)}% of its motion along it; swung within ${degrees(strike.plane)} of a plane; `
    + `${whipWords(strike.whip)} (${strike.rigid.toFixed(1)} ${pivotWords(strike.pivot)}); `
    + stopWords(strike)
    + (strike.outrun ? `; ${outrunWords(strike.outrun, share)}` : '');
}

const whipWords = (whip: number) => `its blow's point ${Number.isFinite(whip) ? whip.toFixed(1) : 'endlessly'} `
  + 'times as fast as its hilt';
const pivotWords = (pivot: Pivot) => (pivot === 'shoulder'
  ? 'swung round the shoulder as one'
  : 'carried round the body as one');
const stopWords = ({ stop, grounded }: Strike) => (stop === null || grounded === null
  ? `not slowed to ${STOP_SHARE * 100}% of it before the frames end`
  : `slowed to ${STOP_SHARE * 100}% of it ${stop.toFixed(0)} ms after, its lowest point ${centimetres(grounded)} `
    + `${grounded < 0 ? 'under' : 'over'} the floor by then`);
const centimetres = (metres: number) => `${Math.abs(metres * 100).toFixed(0)} cm`;

/** How a strike stopped: carried on (`STOP_LEAST` or later, or not before the frames end), by the floor it was driven
 *  into, sunk into the floor, or dead in the air. */
function stoppedBy({ stop, grounded }: Strike): 'carried' | 'floor' | 'sunk' | 'air' {
  if (stop === null || grounded === null || stop >= STOP_LEAST) return 'carried';
  if (grounded < -FLOOR_NEAR) return 'sunk';
  return grounded <= FLOOR_NEAR ? 'floor' : 'air';
}

/** Whether a strike stopped dead where the floor stopped it (`stoppedBy`), for the floor's canary. */
export const stoppedByFloor = (strike: Strike) => stoppedBy(strike) === 'floor';

const outrunWords = (outrun: NonNullable<Strike['outrun']>, share: (i: number) => string) =>
  `faster outside it: ${outrun.speed.toFixed(1)} m/s at ${share(outrun.at)}`;

const sideName = (side: StrikingSide) => ({ edges: 'edge', bit: 'bit', faces: 'face', round: 'head' })[side];

/** A strike's problems: led by its flat rather than its striking side, outrun by another motion of the cast, slid
 *  across rather than swung round, and stopped dead after it in the air or sunk into the floor (`share` says a
 *  frame's index as words). */
export function strikeProblems(strike: Strike, share: (i: number) => string): string[] {
  const problems: string[] = [];
  if (strike.lead !== null && strike.lead > LEAD_MOST) {
    problems.push(`the ${strike.weapon}'s strike is led by its flat: its ${sideName(strike.side)} is `
      + `${degrees(strike.lead)} off the way it moves (at most ${LEAD_MOST}°)`);
  }
  if (strike.outrun) {
    problems.push(`the ${strike.weapon} moves faster than its blow, ${outrunWords(strike.outrun, share)}`);
  }
  const whipLeast = WHIP_LEAST * strike.rigid;
  if (strike.whip < whipLeast) {
    problems.push(`the ${strike.weapon} slides across rather than swinging round: ${whipWords(strike.whip)} `
      + `(at least ${whipLeast.toFixed(1)}, as ${pivotWords(strike.pivot)})`);
  }
  const stopped = stoppedBy(strike);
  if (stopped === 'air') {
    problems.push(`the ${strike.weapon} stops dead after its blow: ${stopWords(strike)} (no sooner than `
      + `${STOP_LEAST} ms, unless the floor stops it: within ${centimetres(FLOOR_NEAR)} of it)`);
  }
  if (stopped === 'sunk') {
    problems.push(`the ${strike.weapon} sinks into the floor as its blow stops: ${stopWords(strike)} (at most `
      + `${centimetres(FLOOR_NEAR)} under it: the floor stops a blow at it)`);
  }
  return problems;
}

/** The whip the canary's slid weapon must read under (it slides with the hand: about 1). */
export const SLID_WHIP = 1.3;
