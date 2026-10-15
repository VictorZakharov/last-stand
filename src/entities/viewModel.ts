// First person: the hero's own arms and weapon in view. The body animates as in every other view, so each
// attack moves the same; through the eyes everything but the arms goes on a layer the camera doesn't
// draw, and the model is placed so the camera sits just above its neck, turned and tilted with the view
// and tipped back a little so the hands and weapon sit in the frame. The placement holds until the next
// frame's pose, so skills cast in between leave from the weapon in view (`Player.castPoint`).
import * as THREE from 'three';
import type { Model } from '../types';
import { curve, type Keys } from './models/motion';
import { ROM } from './models/anatomy';
import { ARMS_LAYER, drawArms } from '../core/renderer';

/** Where the camera sits against the neck, in the hero's space (x left, y up, z forward): just above
 *  it, so the shoulders stay below the view and the hands and weapon come into its lower part. */
const NECK_CAM = new THREE.Vector3(0, 0.25, 0.1);
/** tipped back about the camera, so what the hands hold low and ahead rises into the frame */
const TILT = -0.4;
const HIDDEN = 1;

const body = new WeakMap<Model, THREE.Object3D[]>(), arms = new WeakMap<Model, THREE.Object3D[]>();
const shown = new WeakSet<Model>();
/** The pose's own placement of the root, and ours over it: a frame with no new pose (paused) starts again
 *  from the pose's, or the neck would be measured where we put the hero last time */
const placed = new WeakMap<Model, { pos: THREE.Vector3; quat: THREE.Quaternion; ourPos: THREE.Vector3; ourQuat: THREE.Quaternion }>();
const _eye = new THREE.Vector3(), _m = new THREE.Matrix4(), _t = new THREE.Matrix4(), _t2 = new THREE.Matrix4(), _s = new THREE.Vector3(), _flip = new THREE.Matrix4().makeRotationY(Math.PI).multiply(new THREE.Matrix4().makeRotationX(TILT));

/** The meshes that aren't the arms (with the hands and what they hold). Of what hangs on a shoulder, only
 *  its own meshes (the upper arm) and the elbow's show: a pauldron, on a joint of its own, would fill the
 *  view's edge. */
function bodyOf(m: Model): THREE.Object3D[] {
  let list = body.get(m);
  if (list) return list;
  const j = m.joints, shoulders: THREE.Object3D[] = j ? [j.shoulderL, j.shoulderR] : [], elbows: THREE.Object3D[] = j ? [j.elbowL, j.elbowR] : [];
  list = [];
  const walk = (o: THREE.Object3D, onArm: boolean): void => {
    if (elbows.includes(o)) return;
    if ((o as THREE.Mesh).isMesh) { if (!onArm) list!.push(o); }
    else if (onArm) { hideAll(o); return; }
    for (const c of o.children) walk(c, shoulders.includes(o));
  };
  const hideAll = (o: THREE.Object3D): void => o.traverse((c) => { if ((c as THREE.Mesh).isMesh) list!.push(c); });
  walk(m.root, false);
  body.set(m, list);
  return list;
}

/** The meshes that are the arms (with the hands and what they hold): every one of the model's not its body's. */
function armsOf(m: Model): THREE.Object3D[] {
  let list = arms.get(m);
  if (list) return list;
  const hidden = new Set(bodyOf(m));
  list = [];
  m.root.traverse((o) => { if ((o as THREE.Mesh).isMesh && !hidden.has(o)) list!.push(o); });
  arms.set(m, list);
  return list;
}

const _r = new THREE.Quaternion().setFromRotationMatrix(_flip).invert();

/**
 * Where a point of the eyes' view (camera space: x right, y up, looking down -z, in metres) will be once
 * `viewArms` has placed the model (`root`), in its world as posed so far: for a pose that puts the hands
 * where they are seen. Needs the model's world matrices up to date (where the neck is).
 */
export function fromEyes(root: THREE.Object3D, neck: THREE.Object3D, p: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  root.worldToLocal(neck.getWorldPosition(_eye)).add(NECK_CAM);
  out.copy(p).applyQuaternion(_r).divideScalar(root.scale.x).add(_eye);
  return root.localToWorld(out);
}
/** A direction of the eyes' view in the model's world, as `fromEyes` */
export function dirFromEyes(root: THREE.Object3D, d: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  return out.copy(d).applyQuaternion(_r).transformDirection(root.matrixWorld);
}
/** A key of a move through the eyes: its share of the move, the grip's place in the view and the weapon's way there
 *  (camera space, as `fromEyes`). */
export type ViewKey = readonly [k: number, at: readonly number[], dir: readonly number[]];
/** a move through the eyes: each axis of the grip's place and of the weapon's way as keys over the move */
export interface ViewMove { at: Keys[]; dir: Keys[] }

/** A move through the eyes from its keys, each axis a curve of its own (`curve`: it eases into each key, and one where
 *  the move turns back is held a moment, as a wind-up's top is). */
export function viewMove(keys: readonly ViewKey[]): ViewMove {
  const axis = (part: 1 | 2, i: number): Keys => keys.map((key) => [key[0], key[part][i]] as const);
  return { at: [0, 1, 2].map((i) => axis(1, i)), dir: [0, 1, 2].map((i) => axis(2, i)) };
}

/** `move` at `k`: the grip's place into `at`, the weapon's way into `dir` (mirrored across the view, `mirror`: the
 *  other hand's). */
export function viewAt(move: ViewMove, k: number, at: THREE.Vector3, dir: THREE.Vector3, mirror = false): void {
  at.set(curve(move.at[0], k), curve(move.at[1], k), curve(move.at[2], k));
  dir.set(curve(move.dir[0], k), curve(move.dir[1], k), curve(move.dir[2], k)).normalize();
  if (mirror) {
    at.x = -at.x;
    dir.x = -dir.x;
  }
}

/**
 * A blow through the eyes swung as a body swings one: the whole arm and the weapon in one plane through the shoulder,
 * so the flat is that plane's and the edge over the knuckles leads the way it moves, whatever the keys. A fist bends
 * its weapon only in its palm's plane, the forearm's line in it (out of it, the wrist bends the flat into the way the
 * weapon moves), so the forearm is kept in the plane too: the elbow is where the arm's two bones meet in it.
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
export interface ViewSwing { plane: readonly number[]; keys: readonly number[]; slant: number; hit: number }
/** an arm's bones in the view (m): the upper arm, the forearm, the fist from its wrist to the handle's axis, and the
 *  weapon from its grip to where its blow lands (its striking part) */
export interface ArmBones { upper: number; fore: number; hand: number; strike: number }

/** a swing's plane: its shoulder, and its ways at 0 and 90 degrees, square to each other; the aim; the way the blow
 *  crosses the view */
const _sp = new THREE.Vector3(), _s0 = new THREE.Vector3(), _s90 = new THREE.Vector3();
const _aim = new THREE.Vector3(), _across = new THREE.Vector3(), _normal = new THREE.Vector3();

/** the numbers a swing's key has (`ViewSwing`) */
export const SWING_KEY = 6;

/** One of a swing's keys' columns (1: the striking part's way, 2: the grip's reach, 3: the wrist's bend, 4: the
 *  elbow's drop, 5: the forearm's roll) as a curve. */
function swingColumn(keys: readonly number[], column: number): Keys {
  const out: [number, number][] = [];
  for (let i = 0; i + SWING_KEY - 1 < keys.length; i += SWING_KEY) out.push([keys[i], keys[i + column]]);
  return out;
}

const DEG = Math.PI / 180;
const clamp = THREE.MathUtils.clamp;

/** The way at `degrees` in a swing's plane (`_s0`, `_s90`), into `out`. */
const inPlane = (degrees: number, out: THREE.Vector3) =>
  out.copy(_s0).multiplyScalar(Math.cos(degrees * DEG)).addScaledVector(_s90, Math.sin(degrees * DEG));

/** Where `swing` puts its arm's shoulder in the view (its plane's centre), into `out`; mirrored for the other hand. */
export function swingShoulder(swing: ViewSwing, out: THREE.Vector3, mirror = false): THREE.Vector3 {
  out.set(swing.plane[0], swing.plane[1], swing.plane[2]);
  if (mirror) out.x = -out.x;
  return out;
}

/** The arm of a swing laid out in its plane with the grip's way at 0 (degrees, the wind-up positive): the grip's reach
 *  as it can be, the elbow's way, the forearm's (from the elbow), the weapon's, and its striking part's way and
 *  distance from the shoulder. */
interface ArmInPlane { reach: number; elbow: number; forearm: number; weapon: number; striking: number; strikeAt: number }

/** `swing`'s arm at `k` for `bones`, laid out in its plane (`ArmInPlane`). */
function armInPlane(swing: ViewSwing, k: number, bones: ArmBones): ArmInPlane {
  const { upper, fore, hand, strike } = bones;
  const [ulnar, radial] = ROM['wrist.radial'];
  const bend = clamp(curve(swingColumn(swing.keys, 3), k), ulnar, radial) * DEG;
  // (the forearm and the fist on to the grip as one bone from the elbow, the wrist bent between them: `lean` its way
  // off the forearm's)
  const toGrip = Math.sqrt(fore * fore + hand * hand + 2 * fore * hand * Math.cos(bend));
  const lean = Math.atan2(hand * Math.sin(bend), fore + hand * Math.cos(bend));
  const reach = clamp(curve(swingColumn(swing.keys, 2), k), 0.02, upper + toGrip - 1e-4);
  // (the elbow behind the reach's line, the forearm bending back from it towards the wind-up, as an elbow bends)
  const off = Math.acos(clamp((upper * upper + reach * reach - toGrip * toGrip) / (2 * upper * reach), -1, 1));
  const ex = upper * Math.cos(off), ey = -upper * Math.sin(off);
  const forearm = Math.atan2(-ey, reach - ex) - lean;
  // (the handle square across the fist, the blade towards the wind-up from the hand's line, but for its slant)
  const weapon = forearm + bend + (90 - swing.slant) * DEG;
  const sx = reach + strike * Math.cos(weapon), sy = strike * Math.sin(weapon);
  const striking = Math.atan2(sy, sx) / DEG;
  const strikeAt = Math.hypot(sx, sy);
  return { reach, elbow: -off / DEG, forearm: forearm / DEG, weapon: weapon / DEG, striking, strikeAt };
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
  aimFor(armInPlane(swing, swing.hit, bones).strikeAt, _aim);
  _s0.copy(_aim).sub(_sp).normalize();
  _across.set(Math.cos(p[3] * DEG), Math.sin(p[3] * DEG), 0);
  _normal.crossVectors(_s0, _across).normalize();
  _s90.crossVectors(_normal, _s0);
  if (_s90.dot(_across) > 0) _s90.negate();
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
  planeOf(swing, bones);
  const arm = armInPlane(swing, k, bones);
  // (the grip's way: the striking part's, less its way off the grip's)
  const grip = curve(swingColumn(swing.keys, 1), k) - arm.striking;
  inPlane(grip, at).multiplyScalar(arm.reach).add(_sp);
  inPlane(grip + arm.elbow, elbow).multiplyScalar(bones.upper);
  inPlane(grip + arm.forearm, _wrist).multiplyScalar(bones.fore).add(elbow);
  dropElbow(elbow, _wrist, inPlane(grip, _toGrip), curve(swingColumn(swing.keys, 4), k));
  inPlane(grip + arm.weapon, dir);
  // (the weapon's length, the edge leading round to smaller angles, and across them the flat: length × edge)
  flat.crossVectors(_s90, _s0);
  rollForearm(elbow, _wrist, curve(swingColumn(swing.keys, 5), k), dir, flat);
  if (mirror) {
    at.x = -at.x;
    dir.x = -dir.x;
    elbow.x = -elbow.x;
    // (a mirrored grip's flat is the mirror image's, turned over: models/warrior.ts `gripL`)
    flat.set(flat.x, -flat.y, -flat.z);
  }
}

const _tx = new THREE.Vector3(), _tf = new THREE.Vector3();
const Y_UP = new THREE.Vector3(0, 1, 0), X_AXIS = new THREE.Vector3(1, 0, 0);

/** `from` turned towards `to` by `w` of the angle between them, into `out` (unit ways; the short way round, as a fist
 *  turns its handle: lerped, two flats facing apart passed through nothing halfway) */
export function turnTowards(from: THREE.Vector3, to: THREE.Vector3, w: number, out: THREE.Vector3): THREE.Vector3 {
  const angle = from.angleTo(to);
  _tx.crossVectors(from, to);
  if (_tx.lengthSq() < 1e-8) _tx.crossVectors(from, Math.abs(from.y) < 0.9 ? Y_UP : X_AXIS);
  return out.copy(_tf.copy(from).applyAxisAngle(_tx.normalize(), angle * w).normalize());
}

const _fm = new THREE.Matrix4(), _fq = [new THREE.Quaternion(), new THREE.Quaternion()];
const _fx = new THREE.Vector3(), _fy = new THREE.Vector3(), _fz = new THREE.Vector3();

/** The turn whose x is `dir` and whose y is `flat` square to it, into `out`. */
function frameOf(dir: THREE.Vector3, flat: THREE.Vector3, out: THREE.Quaternion): THREE.Quaternion {
  _fx.copy(dir).normalize();
  _fy.copy(flat).addScaledVector(_fx, -flat.dot(_fx)).normalize();
  _fz.crossVectors(_fx, _fy);
  return out.setFromRotationMatrix(_fm.makeBasis(_fx, _fy, _fz));
}

/** A weapon's way (`dir`) and its flat (`flat`) turned `w` of the way to `toDir`, `toFlat`, as one turn (slerped), in
 *  place. */
function slerpFrame(dir: THREE.Vector3, flat: THREE.Vector3, toDir: THREE.Vector3, toFlat: THREE.Vector3, w: number): void {
  const q = frameOf(dir, flat, _fq[0]).slerp(frameOf(toDir, toFlat, _fq[1]), w);
  dir.set(1, 0, 0).applyQuaternion(q);
  flat.set(0, 1, 0).applyQuaternion(q);
}

/** A fade through the eyes from where a weapon was last placed in the view, as `PoseFade` is for the joints: a
 *  placement made after the pose's fade (a two-hander held in the view, a cut keyed there) would leap from the end
 *  of a move to the next in a frame. */
export class ViewFade {
  private readonly at = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly flat = new THREE.Vector3();
  private readonly fromAt = new THREE.Vector3();
  private readonly fromDir = new THREE.Vector3();
  private readonly fromFlat = new THREE.Vector3();
  private hold = 0;
  private fromHold = 0;
  private w = 0;
  private dur = 0.2;
  private primed = false;

  /** start a fade from the place shown last frame, over `dur` seconds */
  cut(dur: number): void {
    if (!this.primed) return;
    this.fromAt.copy(this.at);
    this.fromDir.copy(this.dir);
    this.fromFlat.copy(this.flat);
    this.fromHold = this.hold;
    this.w = 1;
    this.dur = dur;
  }

  /** this frame's place (`at`, the way `dir`, the way its flat faces `flat`), faded from the last cut's, and how far a
   *  swing holds its fist (models/warrior.ts `fitInView`'s `hold`), faded so too: the one to use (a swing's fist let
   *  go of at once as it ended, the weapon turned 60 degrees in a frame) */
  apply(at: THREE.Vector3, dir: THREE.Vector3, dt: number, flat?: THREE.Vector3, hold = 0): number {
    if (this.w > 0) {
      this.w = Math.max(0, this.w - dt / this.dur);
      const e = this.w * this.w * (3 - 2 * this.w);
      at.lerp(this.fromAt, e);
      // (the weapon's way and its flat turned as one, the fist's whole turn slerped: each turned its own short way,
      // the fist between them was turned past what a forearm can, and the blade flipped in a frame, 113 m/s; lerped,
      // a blade turned over between two cuts spun four times as fast halfway)
      if (flat) slerpFrame(dir, flat, this.fromDir, this.fromFlat, e);
      else turnTowards(dir.normalize(), this.fromDir, e, dir);
      hold += (this.fromHold - hold) * e;
    }
    this.at.copy(at);
    this.dir.copy(dir).normalize();
    if (flat) this.flat.copy(flat);
    this.hold = hold;
    this.primed = true;
    return hold;
  }

  /** nothing placed this frame: the next cut does nothing */
  reset(): void { this.primed = false; this.w = 0; }

  /** how much of the last cut's place this frame's still holds (0 once the fade is over) */
  get fading(): number { return this.w * this.w * (3 - 2 * this.w); }
}

/** the camera's turn the last time a model was placed in view, undone */
const _camInv = new THREE.Quaternion();
/** and half its frame's height and width a metre ahead (the game's 66 degrees on a wide screen till then) */
let halfUp = Math.tan((66 * Math.PI) / 360), halfAcross = (halfUp * 16) / 9;

/** A place on the screen in the eyes' view (camera space, as `fromEyes`), from the camera as it was last placed: `on`
 *  is how far across and up from the middle to the frame's edges (-1..1) and how far ahead (m). A pose held so sits
 *  at the same place in the frame on any screen, wide or narrow. */
export function fromScreen(on: readonly number[], out: THREE.Vector3): THREE.Vector3 {
  const [across, up, ahead] = on;
  return out.set(across * ahead * halfAcross, up * ahead * halfUp, -ahead);
}
/** A direction of the world as the eyes see it (their frame, as `fromEyes`), from the camera as it was last placed: for
 *  a pose that lines something up with the world through the eyes (the arrow on the string along the shot's line). The
 *  crosshair's aim is taken from that camera too. */
export function toEyes(d: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  return out.copy(d).applyQuaternion(_camInv);
}

/** Show `m` through the camera's eyes (`on`), or as a whole body. Call after the camera has moved. */
export function viewArms(m: Model, on: boolean, cam: THREE.Camera): void {
  // (a model that has its arms drawn by their own camera has them on its layer, `armsFov`)
  const ownCamera = on && !!m.armsFov;
  if (on !== shown.has(m)) {
    for (const o of bodyOf(m)) { if (on) o.layers.set(HIDDEN); else o.layers.set(0); }
    for (const o of armsOf(m)) o.layers.set(ownCamera ? ARMS_LAYER : 0);
    if (on) shown.add(m); else shown.delete(m);
    m.firstPerson?.(on);
  }
  drawArms(ownCamera ? m.armsFov!() : null);
  const root = m.root, parent = root.parent;
  let p = placed.get(m);
  if (p && p.ourPos.equals(root.position) && p.ourQuat.equals(root.quaternion)) { root.position.copy(p.pos); root.quaternion.copy(p.quat); }
  if (!on || !parent) return;
  if (!p) placed.set(m, p = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), ourPos: new THREE.Vector3(), ourQuat: new THREE.Quaternion() });
  p.pos.copy(root.position); p.quat.copy(root.quaternion);
  root.updateWorldMatrix(true, false);
  cam.updateMatrixWorld();
  cam.getWorldQuaternion(_camInv).invert();
  if ((cam as THREE.PerspectiveCamera).isPerspectiveCamera) {
    const lens = cam as THREE.PerspectiveCamera;
    // (the view the arms are drawn with: their own camera's, or the world's)
    const fov = ownCamera ? m.armsFov!() : lens.fov;
    halfUp = Math.tan((fov * Math.PI) / 360) / lens.zoom;
    halfAcross = halfUp * lens.aspect;
  }
  // the camera sits just above the neck, wherever the pose has taken it: the head rides the spine, so a
  // lean or a crouch doesn't bring the shoulders up under the camera
  const neck = m.joints?.neck;
  if (neck) root.worldToLocal(neck.getWorldPosition(_eye)).add(NECK_CAM);
  else root.worldToLocal(_eye.setFromMatrixPosition(cam.matrixWorld));
  _m.copy(cam.matrixWorld).multiply(_flip);
  // (the model's own scale kept: the heroes are built a little over life size, and reach reads it)
  _m.multiply(_t.makeScale(root.scale.x, root.scale.y, root.scale.z)).multiply(_t2.makeTranslation(-_eye.x, -_eye.y, -_eye.z));
  _m.premultiply(_t.copy(parent.matrixWorld).invert());
  _m.decompose(root.position, root.quaternion, _s);
  p.ourPos.copy(root.position); p.ourQuat.copy(root.quaternion);
}
