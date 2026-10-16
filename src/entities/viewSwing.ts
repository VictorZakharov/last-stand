// Blows through the eyes swung as a body swings them (`ViewSwing`): each key of a swing laid out as an arm in its plane
// through the shoulder, the grip, the weapon's way, its flat and the elbow placed in the view from it (`swingAt`); and
// the other way round, the key that holds a grip and a weapon's way chosen in the view (`swingKeyFor`: a pose decided
// as a person holds it, then keyed; the lab's `swing`).
import * as THREE from 'three';
import { curve, type Keys } from './models/motion';
import { ROM } from './models/anatomy';

/**
 * A blow through the eyes swung as a body swings one: the whole arm and the weapon in one plane through the shoulder,
 * so the flat is that plane's and the edge over the knuckles leads the way it moves, whatever the keys. A fist bends
 * its weapon only in its palm's plane, the forearm's line in it (out of it, the wrist bends the flat into the way the
 * weapon moves), so the arm is laid out in the plane: the elbow is where the arm's two bones meet in it, and may drop
 * out of it about the line from the shoulder to the grip, the grip and the weapon staying put; and the forearm may
 * roll the weapon out of it, from one cut's end to the next's start.
 * The plane is set by what the eyes see of the blow: it runs through the shoulder the swing puts (a cut turns the
 * trunk into it and brings that shoulder forward and up: from the shoulders' rest under the camera, a cut swung there
 * passed below and beside the frame) and through the aim, the crosshair's line where the weapon's striking part
 * reaches it at the blow, and crosses the view there the way the blow goes. So the striking part, a blade's tip's
 * third, lands on the crosshair as the skill fires. `plane` is four numbers, camera space as `viewMove`'s keys: the
 * shoulder, and the way the blow crosses the view (degrees: 0 rightwards, 90 up; a forehand down to the left about
 * 210). In it the aim is at 0 degrees and the wind-up at 90. `keys` are six numbers a key: its share of the move,
 * the striking part's way from the shoulder (degrees in the plane), how far out the grip is (m), the wrist's bend
 * in the plane, to the thumb's side (radial, towards the wind-up) or the little finger's (ulnar, negative), within the
 * wrist's range, how far the elbow drops below the plane (degrees about the line from the shoulder to the grip:
 * `dropElbow`), and how far the forearm rolls the blade out of the plane (degrees about it: `rollForearm`; 0 through
 * a blow). `hit` is the share the striking part reaches the aim at (its way 0 there): the aim's distance is set
 * by how far it reaches then. The fist holds the handle square across it but for `slant` (degrees: diagonally, as a
 * hand holds a sword), so the weapon's way off the forearm is 90 degrees, less the slant, plus that bend: it can't
 * run along the forearm. All are read each frame, so a tunable value (core/tuning.ts) is tuned as it runs. (Keyed by
 * the grip's place and the weapon's way alone, as `viewMove`'s, the blade whipped over flat first; each axis a curve
 * of its own, it left its plane between keys and led with its flat. Keyed by the weapon's way off the forearm, the
 * fist drawn round the handle bent 96 degrees off it at the blow. Keyed by the grip's way in a plane set by hand,
 * the blade stood upright at the blow and crossed the crosshair 29% of the way from its hilt: the owner, "it strikes
 * with whole blade, but it should strike with tip".)
 */
export interface ViewSwing {
  plane: readonly number[];
  keys: readonly number[];
  slant: number;
  hit: number;
  /** the swing whose plane this one starts in, turned into its own from `turning[0]` to `turning[1]` of the move
   *  (eased in and out): a cut in a row taken on from where the last left the arm, its first key that one's last, the
   *  arm laid out in a plane the whole way (`planeAt`) */
  from?: ViewSwing;
  turning?: readonly number[];
}
/** an arm's bones in the view (m): the upper arm, the forearm, the fist from its wrist to the handle's axis, and the
 *  weapon from its grip to where its blow lands (its striking part) */
export interface ArmBones { upper: number; fore: number; hand: number; strike: number }
/** A swing's key's numbers after its share (`ViewSwing.keys`): the striking part's way, the grip's reach, the wrist's
 *  bend, the elbow's drop and the forearm's roll. */
export interface SwingKey { way: number; reach: number; bend: number; drop: number; roll: number }

/** a swing's plane: its shoulder, and its ways at 0 and 90 degrees, square to each other; the aim; the way the blow
 *  crosses the view */
const _sp = new THREE.Vector3(), _s0 = new THREE.Vector3(), _s90 = new THREE.Vector3();
const _aim = new THREE.Vector3(), _across = new THREE.Vector3(), _normal = new THREE.Vector3();
/** a plane's ways as a turn of the view's (`frameOf`), the swing's own, and its own shoulder */
const _frame = new THREE.Quaternion(), _frameOwn = new THREE.Quaternion(), _spOwn = new THREE.Vector3();
const _basis = new THREE.Matrix4(), _square = new THREE.Vector3();

/** the numbers a swing's key has (`ViewSwing`) */
export const SWING_KEY = 6;

/** One of a swing's keys' columns (1: the striking part's way, 2: the grip's reach, 3: the wrist's bend, 4: the
 *  elbow's drop, 5: the forearm's roll) as a curve. */
function swingColumn(keys: readonly number[], column: number): Keys {
  const out: [number, number][] = [];
  for (let i = 0; i + SWING_KEY - 1 < keys.length; i += SWING_KEY) out.push([keys[i], keys[i + column]]);
  return out;
}

/** `swing`'s keys at `k`, into `out`. */
function keyAt(swing: ViewSwing, k: number, out: SwingKey): SwingKey {
  out.way = curve(swingColumn(swing.keys, 1), k);
  out.reach = curve(swingColumn(swing.keys, 2), k);
  out.bend = curve(swingColumn(swing.keys, 3), k);
  out.drop = curve(swingColumn(swing.keys, 4), k);
  out.roll = curve(swingColumn(swing.keys, 5), k);
  return out;
}
const _key: SwingKey = { way: 0, reach: 0, bend: 0, drop: 0, roll: 0 };

const DEG = Math.PI / 180;
const clamp = THREE.MathUtils.clamp;
/** A wrist's bend in a swing's plane held within its range (degrees, `SwingKey.bend`). */
const wristBend = (degrees: number) => clamp(degrees, ROM['wrist.radial'][0], ROM['wrist.radial'][1]);
/** An angle as -180..180 degrees. */
const wrapped = (degrees: number) => THREE.MathUtils.euclideanModulo(degrees + 180, 360) - 180;

/** The way at `degrees` in a swing's plane (`_s0`, `_s90`), into `out`. */
const inPlane = (degrees: number, out: THREE.Vector3) =>
  out.copy(_s0).multiplyScalar(Math.cos(degrees * DEG)).addScaledVector(_s90, Math.sin(degrees * DEG));

/** Where `swing` puts its arm's shoulder in the view (its plane's centre), into `out`; mirrored for the other hand. */
export function swingShoulder(swing: ViewSwing, out: THREE.Vector3, mirror = false): THREE.Vector3 {
  out.set(swing.plane[0], swing.plane[1], swing.plane[2]);
  if (mirror) out.x = -out.x;
  return out;
}

/** An arm laid out in a swing's plane with the grip's way at 0 (degrees, the wind-up positive): the grip's reach as it
 *  can be and the furthest it can be (m), the elbow's way, the forearm's (from the elbow), the weapon's, and its
 *  striking part's way and distance from the shoulder. */
interface ArmInPlane {
  reach: number;
  most: number;
  elbow: number;
  forearm: number;
  weapon: number;
  striking: number;
  strikeAt: number;
}

/** An arm of `bones` laid out in a plane (`ArmInPlane`), reaching `reach` with its wrist bent `bend` (degrees, as
 *  `SwingKey.bend`), its fist holding the handle slanted `slant` (degrees). */
function armOf(bones: ArmBones, reach: number, bend: number, slant: number): ArmInPlane {
  const { upper, fore, hand, strike } = bones;
  const b = bend * DEG;
  // (the forearm and the fist on to the grip as one bone from the elbow, the wrist bent between them: `lean` its way
  // off the forearm's)
  const toGrip = Math.sqrt(fore * fore + hand * hand + 2 * fore * hand * Math.cos(b));
  const lean = Math.atan2(hand * Math.sin(b), fore + hand * Math.cos(b));
  const most = upper + toGrip;
  const r = clamp(reach, 0.02, most - 1e-4);
  // (the elbow behind the reach's line, the forearm bending back from it towards the wind-up, as an elbow bends)
  const off = Math.acos(clamp((upper * upper + r * r - toGrip * toGrip) / (2 * upper * r), -1, 1));
  const ex = upper * Math.cos(off), ey = -upper * Math.sin(off);
  const forearm = Math.atan2(-ey, r - ex) - lean;
  // (the handle square across the fist, the blade towards the wind-up from the hand's line, but for its slant)
  const weapon = forearm + b + (90 - slant) * DEG;
  const sx = r + strike * Math.cos(weapon), sy = strike * Math.sin(weapon);
  const striking = Math.atan2(sy, sx) / DEG;
  const strikeAt = Math.hypot(sx, sy);
  return { reach: r, most, elbow: -off / DEG, forearm: forearm / DEG, weapon: weapon / DEG, striking, strikeAt };
}

/** The aim a swing's striking part reaches `strikeAt` m from its shoulder at (the crosshair's line, ahead), into
 *  `out` (its near crossing, if the shoulder is so far ahead the line passes within that). */
function aimFor(strikeAt: number, out: THREE.Vector3): THREE.Vector3 {
  const square = _sp.z * _sp.z - _sp.lengthSq() + strikeAt * strikeAt;
  return out.set(0, 0, _sp.z - Math.sqrt(Math.max(0, square)));
}

const _toGrip = new THREE.Vector3(), _wrist = new THREE.Vector3(), _down = new THREE.Vector3();
const _side = new THREE.Vector3(), _q = new THREE.Quaternion();

/** The elbow's and the wrist's ways from the shoulder (`elbow`, `wrist`, in the swing's plane) turned `degrees` about
 *  the line to the grip (`toGrip`), down out of the plane: where the reach and the bend leave it, an elbow can drop as
 *  an arm's does. The grip, the weapon and its flat stay as the plane has them; the forearm leaves the plane, and the
 *  wrist takes that up. (In the plane, the elbow could only go the way the blow goes: across the chest on the wind-up,
 *  30 degrees past a shoulder's reach, and behind the body at the cut's end, 48 past.) */
function dropElbow(elbow: THREE.Vector3, wrist: THREE.Vector3, toGrip: THREE.Vector3, degrees: number): void {
  if (degrees === 0) return;
  // (the plane's side below it, in the view)
  _down.copy(_normal);
  if (_down.y > 0) _down.negate();
  // (turned about the line to the grip the way that takes the elbow to that side)
  const towards = _side.crossVectors(toGrip, elbow).dot(_down) > 0 ? 1 : -1;
  _q.setFromAxisAngle(toGrip.normalize(), towards * degrees * DEG);
  elbow.applyQuaternion(_q);
  wrist.applyQuaternion(_q);
}

/** The weapon's way (`dir`) and its flat's turned `degrees` about the forearm (from the elbow to the wrist, their ways
 *  from the shoulder): the blade turned over by the forearm's roll, out of the plane and back into it on the other
 *  side, as a row's next cut takes it from where the last left it. (Every cut's blade trails towards its own wind-up,
 *  so the last one's end and the next one's start point it opposite ways: faded from one to the other, it spun 95
 *  degrees in a frame, 95 m/s, the forearm at the end of its turn. Turned about the line from the elbow to the grip,
 *  the wrist swung off the forearm by the fist's lean, and the arm drawn was 5 cm off its keys.) */
function rollForearm(
  elbow: THREE.Vector3, wrist: THREE.Vector3, degrees: number, dir: THREE.Vector3, flat: THREE.Vector3,
): void {
  if (degrees === 0) return;
  _q.setFromAxisAngle(_side.copy(wrist).sub(elbow).normalize(), degrees * DEG);
  dir.applyQuaternion(_q);
  flat.applyQuaternion(_q);
}

/** Sets `swing`'s plane (`_sp`, `_s0`, `_s90`): through its shoulder and its aim, crossing the view there its way, the
 *  wind-up at 90 degrees against the way the blow goes. */
function planeOf(swing: ViewSwing, bones: ArmBones): void {
  const p = swing.plane;
  _sp.set(p[0], p[1], p[2]);
  const hit = keyAt(swing, swing.hit, _key);
  aimFor(armOf(bones, hit.reach, wristBend(hit.bend), swing.slant).strikeAt, _aim);
  _s0.copy(_aim).sub(_sp).normalize();
  _across.set(Math.cos(p[3] * DEG), Math.sin(p[3] * DEG), 0);
  _normal.crossVectors(_s0, _across).normalize();
  _s90.crossVectors(_normal, _s0);
  if (_s90.dot(_across) > 0) _s90.negate();
}

/** The plane set last (`planeOf`) as the turn that takes the view's x and y to its 0 and 90 degrees, into `out`. */
function frameOf(out: THREE.Quaternion): THREE.Quaternion {
  _basis.makeBasis(_s0, _s90, _square.crossVectors(_s0, _s90));
  return out.setFromRotationMatrix(_basis);
}

/** Sets the plane `swing` has at `k` (`planeOf`): its own, or turned into it from its `from` swing's over its
 *  `turning`, the shoulder moved with it. (Faded from the last cut's end into this one's wind-up instead, the grip
 *  went straight between them, the fist turned on its own, and the right wrist bent 26 degrees past its range. Turned
 *  over the last cut's end into this one's plane, it turned while the follow-through was still fast, 32 degrees in a
 *  frame, and cut it short: a heavy weapon's dies away over a fifth of a second, most of what's left of its cut.) */
function planeAt(swing: ViewSwing, k: number, bones: ArmBones): void {
  planeOf(swing, bones);
  const { from, turning } = swing;
  if (!from || !turning) return;
  const t = smooth(clamp((k - turning[0]) / (turning[1] - turning[0]), 0, 1));
  if (t >= 1) return;
  _spOwn.copy(_sp);
  frameOf(_frameOwn);
  planeOf(from, bones);
  frameOf(_frame).slerp(_frameOwn, t);
  _sp.lerp(_spOwn, t);
  _s0.set(1, 0, 0).applyQuaternion(_frame);
  _s90.set(0, 1, 0).applyQuaternion(_frame);
  _normal.set(0, 0, 1).applyQuaternion(_frame);
}
/** Eased in and out (0..1). */
const smooth = (t: number) => t * t * (3 - 2 * t);

/** The arm `key` lays out in the plane set last (`planeOf`), placed in the view as `swingAt` says. */
function placeArm(
  key: SwingKey, slant: number, bones: ArmBones,
  at: THREE.Vector3, dir: THREE.Vector3, flat: THREE.Vector3, elbow: THREE.Vector3, mirror: boolean,
): void {
  const arm = armOf(bones, key.reach, wristBend(key.bend), slant);
  // (the grip's way: the striking part's, less its way off the grip's)
  const grip = key.way - arm.striking;
  inPlane(grip, at).multiplyScalar(arm.reach).add(_sp);
  inPlane(grip + arm.elbow, elbow).multiplyScalar(bones.upper);
  inPlane(grip + arm.forearm, _wrist).multiplyScalar(bones.fore).add(elbow);
  dropElbow(elbow, _wrist, inPlane(grip, _toGrip), key.drop);
  inPlane(grip + arm.weapon, dir);
  // (the weapon's length, the edge leading round to smaller angles, and across them the flat: length × edge)
  flat.crossVectors(_s90, _s0);
  rollForearm(elbow, _wrist, key.roll, dir, flat);
  if (mirror) {
    at.x = -at.x;
    dir.x = -dir.x;
    elbow.x = -elbow.x;
    // (a mirrored grip's flat is the mirror image's, turned over: models/warrior.ts `gripL`)
    flat.set(flat.x, -flat.y, -flat.z);
  }
}

/**
 * `swing` at `k` for an arm of `bones`, as `viewAt`: the grip's place into `at`, the weapon's way into `dir`, into
 * `flat` the way the fist's flat side faces (models/warrior.ts `rollFlat`: the edge over the knuckles into the blow,
 * swung from the wind-up's side, the angles falling), and into `elbow` the way from the shoulder to the elbow (its
 * reach's pole), each in the view; mirrored across it (`mirror`) for the other hand.
 */
export function swingAt(
  swing: ViewSwing, k: number, bones: ArmBones,
  at: THREE.Vector3, dir: THREE.Vector3, flat: THREE.Vector3, elbow: THREE.Vector3, mirror = false,
): void {
  planeAt(swing, k, bones);
  placeArm(keyAt(swing, k, _key), swing.slant, bones, at, dir, flat, elbow, mirror);
}

/**
 * A swing's arm turned with the trunk, as a turning chest carries the arms before it: `turn` (rad, to its left)
 * about the view's up through `spine` (where the chest turns under the eyes), the grip's place `at` about it, and the
 * weapon's way `dir`, its flat `flat` and the way to the elbow `elbow` turned with it. (A two-hander's cut is driven
 * by the trunk: swung round the right shoulder alone across the view, the shoulder turned 150 to 180 degrees past its
 * range whatever its elbow did.)
 */
export function turnWithTrunk(
  turn: number, spine: THREE.Vector3,
  at: THREE.Vector3, dir: THREE.Vector3, flat: THREE.Vector3, elbow: THREE.Vector3,
): void {
  at.sub(spine).applyAxisAngle(UP, turn).add(spine);
  dir.applyAxisAngle(UP, turn);
  flat.applyAxisAngle(UP, turn);
  elbow.applyAxisAngle(UP, turn);
}
const UP = new THREE.Vector3(0, 1, 0);

/** `key` in `swing`'s plane, placed as `swingAt` places one of its own (and the wrist's way from the shoulder, into
 *  `wrist`), mirrored for the other hand. */
export function swingKeyAt(
  swing: ViewSwing, key: SwingKey, bones: ArmBones,
  at: THREE.Vector3, dir: THREE.Vector3, flat: THREE.Vector3, elbow: THREE.Vector3, wrist: THREE.Vector3,
  mirror = false,
): void {
  planeOf(swing, bones);
  placeArm(key, swing.slant, bones, at, dir, flat, elbow, mirror);
  wrist.copy(_wrist);
  if (mirror) wrist.x = -wrist.x;
}

/** The key that holds a grip and a weapon's way in a swing's plane (`swingKeyFor`), and what of them it can't: how
 *  far the grip is off the plane (m) and the weapon's way (degrees), the bend that way needs of the wrist (degrees,
 *  `SwingKey.bend`), how far the weapon is off it with the wrist held within its range (degrees), and the furthest
 *  the arm reaches so bent (m). The key's drop and roll are 0. */
export interface SwingKeyFit {
  key: SwingKey;
  gripOff: number;
  weaponOff: number;
  bend: number;
  weaponMiss: number;
  most: number;
}

const _rel = new THREE.Vector3(), _way = new THREE.Vector3();
/** the wrist's bends tried for a weapon's way (degrees: past its range each way, to say how far past one needs) */
const BENDS_TRIED = 120, BEND_STEP = 0.25;

/** The key of `swing` that puts its grip at `at` and its weapon along `dir` (each in the view, as `swingAt`'s), as
 *  nearly as an arm of `bones` swung in its plane can (`SwingKeyFit`); the other hand's, mirrored (`mirror`). */
export function swingKeyFor(
  swing: ViewSwing, bones: ArmBones, at: THREE.Vector3, dir: THREE.Vector3, mirror = false,
): SwingKeyFit {
  planeOf(swing, bones);
  const rel = _rel.copy(at);
  const way = _way.copy(dir).normalize();
  if (mirror) {
    rel.x = -rel.x;
    way.x = -way.x;
  }
  rel.sub(_sp);
  const gripOff = rel.dot(_normal);
  rel.addScaledVector(_normal, -gripOff);
  const gripWay = Math.atan2(rel.dot(_s90), rel.dot(_s0)) / DEG;
  const weaponOff = Math.asin(clamp(way.dot(_normal), -1, 1)) / DEG;
  way.addScaledVector(_normal, -way.dot(_normal));
  // (the weapon's way off the grip's line wanted, and the bend that lays the arm out so)
  const wanted = wrapped(Math.atan2(way.dot(_s90), way.dot(_s0)) / DEG - gripWay);
  const missWith = (bend: number) => Math.abs(wrapped(armOf(bones, rel.length(), bend, swing.slant).weapon - wanted));
  let bend = 0, least = missWith(0);
  for (let b = -BENDS_TRIED; b <= BENDS_TRIED; b += BEND_STEP) {
    const miss = missWith(b);
    if (miss < least) { bend = b; least = miss; }
  }
  const held = wristBend(bend);
  const arm = armOf(bones, rel.length(), held, swing.slant);
  const key = { way: gripWay + arm.striking, reach: arm.reach, bend: held, drop: 0, roll: 0 };
  return { key, gripOff, weaponOff, bend, weaponMiss: missWith(held), most: arm.most };
}
