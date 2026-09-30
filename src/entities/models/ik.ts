// Leg IK for the humanoid rig: feet that stay where they are put. The procedural walk cycle (rig.ts
// `walkCycle`) swings the legs as rotations, which slides every foot along the floor; this runs after the
// pose and takes the legs over: a planted foot is held at a spot in the world while the body moves over
// it, a swinging foot arcs from where it left to where it will land (ahead of the body, predicted from
// its speed), a standing character re-steps when its feet have fallen far from under it or it turns, the
// pelvis drops when a foot would be out of reach, and a foot lies level on the ground (`groundHeight`, so
// the dais steps work). Each leg is then solved as two-bone IK (`reachArm`, hinged the other way) and
// blended over the pose it replaces. The stride's timing still comes from the walk cycle's own phase (the
// arms swing by it too), which the gait rate keeps in step with the speed (`gaitRate`).
// `LookAt` turns the neck and head onto a point of interest, within limits.
import * as THREE from 'three';
import type { Joints } from './rig';
import { reachArm } from './rig';
import { groundHeight } from '../../world/ground';
import { damp } from '../../util';

/** `?ik=0` keeps the walk cycle's own legs and its old gait, for A/B comparison */
export const IK = typeof location === 'undefined' || !/[?&]ik=0/.test(location.search);
/** the ankle joint's height above the sole, the same as `groundFeet`'s */
const FOOT_H = 0.07;
/** how a foot's sole hangs below its ankle, and how far it reaches ahead of it and behind it (rig units), from its meshes' bounds */
function footShape(ankle: THREE.Object3D, root: THREE.Object3D): { sole: number; toe: number; heel: number } {
  let sole = 0, toe = 0, heel = 0, any = false;
  const m = new THREE.Matrix4(), v = new THREE.Vector3();
  ankle.updateMatrix();
  const walk = (o: THREE.Object3D, acc: THREE.Matrix4): void => {
    for (const c of o.children) {
      c.updateMatrix(); const cm = acc.clone().multiply(c.matrix);
      const g = (c as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
      if (g && (c as THREE.Mesh).isMesh && c.visible) {
        const pa = g.attributes.position;
        for (let i = 0; i < pa.count; i++) { v.fromBufferAttribute(pa, i).applyMatrix4(cm); sole = Math.max(sole, -v.y); toe = Math.max(toe, v.z); heel = Math.max(heel, -v.z); any = true; }
      }
      walk(c, cm);
    }
  };
  walk(ankle, m.identity());
  // skinned pieces (a shin ending below the ankle): the vertices this bone owns, in the bone's own space at the bind pose
  root.traverse((o) => {
    const sm = o as THREE.SkinnedMesh;
    if (!sm.isSkinnedMesh || !sm.visible) return;
    const bi = sm.skeleton.bones.indexOf(ankle as THREE.Bone);
    if (bi < 0) return;
    const pos = sm.geometry.attributes.position, si = sm.geometry.attributes.skinIndex, sw = sm.geometry.attributes.skinWeight;
    if (!si || !sw) return;
    m.copy(sm.skeleton.boneInverses[bi]).multiply(sm.bindMatrix);
    for (let i = 0; i < pos.count; i += 3) {
      let w = 0;
      for (let k = 0; k < 4; k++) if (si.getComponent(i, k) === bi) w += sw.getComponent(i, k);
      if (w < 0.999) continue;
      v.fromBufferAttribute(pos, i).applyMatrix4(m); sole = Math.max(sole, -v.y); toe = Math.max(toe, v.z); heel = Math.max(heel, -v.z); any = true;
    }
  });
  return any ? { sole: Math.min(0.25, Math.max(0.03, sole)), toe: Math.min(0.4, Math.max(0.05, toe)), heel: Math.min(0.2, Math.max(0.02, heel)) } : { sole: FOOT_H, toe: 0.14, heel: 0.05 };
}
const TAU = Math.PI * 2;
/** radians of forward lean per m/s of speed */
const LEAN = 0.045;
/** how far a planted foot may be turned from the body's facing (rad) */
const YAW_MAX = 0.5;
/** how far the pelvis may turn from the chest (rad) to face the way the body travels while its chest faces the aim */
const TWIST = 1.15;
/** how far the pelvis is lifted over the pose (rig units) before the reach limit brings it back: the rest pose stands with bent knees */
const RISE = 0.03;
/** the share of the body's speed a planted foot moves at during a run */
const SLIP = +(typeof location === 'undefined' ? '0.2' : (new URLSearchParams(location.search).get('slip') ?? '0.2'));
/** how far ahead of its hip a foot may land, in leg lengths */
const AHEAD = 0.4;
/** a swing lands with this share of the stance's backward stroke (relative to the hip), so a foot never skids as it takes the ground and paws back a little as it lands, as a runner's does; it leaves with less, or it trails far behind the hip before it comes forward */
const STROKE_IN = 0.8, STROKE_OUT = 0.5;
const smooth = (t: number): number => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };

/** How far a half stride (one foot's step) is at `speed` (m/s) for legs `leg` long (world m): walks take short
 *  steps, runs long ones; the walk cycle's phase then advances π per step (`gaitRate`). */
export const stepLength = (speed: number, leg: number): number => Math.min(1.65 * leg, Math.max(0.3 * leg, speed / (1.7 + 0.32 * speed) * (leg / 0.9)));
/** the walk cycle's phase change per metre travelled at `speed`: a half cycle (π) per step */
export const gaitRate = (speed: number, leg: number): number => IK ? Math.PI / stepLength(speed, leg) : 2.1;

/** a model's leg length in world metres (its thigh and shin at the root's scale), 0.9 for one with no skeleton */
export const legLength = (m: { joints?: Joints; root: THREE.Object3D }): number => m.joints ? (m.joints.P.thighL + m.joints.P.shinL) * m.root.scale.x : 0.9;

type State = 'plant' | 'swing' | 'timed';
class Foot {
  state: State = 'plant';
  /** where it is planted (the ankle's spot on the floor: x, z and the ground's height), and where the current step began / will land */
  P = new THREE.Vector3(); A = new THREE.Vector3(); B = new THREE.Vector3();
  yaw = 0; yawA = 0;
  /** progress of a swing 0..1; a timed swing (the standing re-step) runs `dur` seconds */
  t = 0; dur = 0.25;
  stance = 0;
  /** a timed step taken at a run: quick, and eased out like a swing, so a foot left behind catches up with the body */
  fast = false;
  /** how far ahead of its hip (along the way it travels) the foot was when its swing began */
  rel0 = 0;
  /** the ankle's target this frame, in the world */
  pos = new THREE.Vector3();
  pitch = 0;
  /** what the ankle's pitch was last frame; a timed step eases from it, and from the height and turn the foot had, so stopping mid-stride never snaps */
  shown = 0; pitch0 = 0; carry = 0;
  fk = { thigh: new THREE.Quaternion(), knee: new THREE.Quaternion(), ankle: new THREE.Quaternion() };
}

const _s = new THREE.Vector3(), _c = new THREE.Vector3(), _f = new THREE.Vector3(), _h = new THREE.Vector3(), _t = new THREE.Vector3(), _p = new THREE.Vector3();
const _m = new THREE.Matrix4(), _pp = new THREE.Vector3(), _ps = new THREE.Vector3(), _hq = new THREE.Quaternion();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _pole = new THREE.Vector3(), _e = new THREE.Euler();

export interface LegOpts {
  /** 0 = the walk cycle's own legs, 1 = fully IK; a fixed share, or (state) a per-frame one */
  weight?: number;
}

export class LegIK {
  readonly feet = [new Foot(), new Foot()];
  private readonly last = new THREE.Vector3();
  private readonly v = new THREE.Vector3();
  /** the ground speed, smoothed as a number: the vector's length collapses when the direction flips */
  private sp = 0;
  private readonly gv = new THREE.Vector3();
  private lastPhase = 0;
  private dphase = 0;
  private moving = false;
  private fresh = true;
  private drop = 0;
  /** the body's lean into its motion (forward, sideways), damped */
  private lastYaw = 0;
  private leanX = 0; private leanZ = 0;
  /** how far the pelvis is turned from the way the body faces, towards the way it travels (rad), damped */
  private twist = 0;
  private shape: { sole: number; toe: number; heel: number }[] | null = null;
  /** the hands' world turn as the pose left it (`captureArms`) */
  private readonly hq = [new THREE.Quaternion(), new THREE.Quaternion()];
  private armsCaptured = false;
  /** the smoothed blend over the walk cycle's legs */
  private w = 0;

  constructor(private readonly j: Joints) { j.root.userData.legs = this; }   // (read by probes)

  /** how far the body leans forward this frame (rad): a pose that holds something at an angle in the world eases its arms by it */
  get lean(): number { return IK ? this.leanX : 0; }

  /**
   * Call after the pose has put the hands where it wants them and before `update`: the hands' turn in the
   * world is kept through whatever `update` does to the body (the lean, the pelvis dropping), see `holdArms`.
   */
  captureArms(): void {
    if (!IK) return;
    const j = this.j;
    j.root.updateMatrixWorld(true);
    j.handL.getWorldQuaternion(this.hq[0]); j.handR.getWorldQuaternion(this.hq[1]);
    this.armsCaptured = true;
  }

  /**
   * Call after `update`: each wrist turns back so the hand is turned in the world as `captureArms` saw it, and
   * a weapon or shield in it keeps its angle while the body leans and dips. The arms themselves follow the
   * body (pinning the hands' positions too folds the elbows up into the chest as the trunk leans onto them).
   * `weight` 0..1 blends over the hand as posed.
   */
  holdArms(weight = 1): void {
    if (!IK || !this.armsCaptured) return;
    this.armsCaptured = false;
    if (weight <= 0) return;
    const j = this.j;
    j.root.updateMatrixWorld(true);
    for (let i = 0; i < 2; i++) {
      const shoulder = i === 0 ? j.shoulderL : j.shoulderR, elbow = i === 0 ? j.elbowL : j.elbowR, hand = i === 0 ? j.handL : j.handR;
      _q.copy(hand.quaternion);
      j.chest.getWorldQuaternion(_hq).multiply(shoulder.quaternion).multiply(elbow.quaternion).invert().multiply(this.hq[i]);
      hand.quaternion.copy(_q).slerp(_hq, weight);
    }
  }

  /** the next frame starts from the pose as it stands (a teleport, a respawn) */
  reset(): void { this.fresh = true; }

  /**
   * Take the legs over, after the pose and before anything reads their world matrices. `phase` is the walk
   * cycle's; `dead` the death progress (-1 alive: the fall stays as posed).
   */
  update(dt: number, phase: number, dead: number, weight = 1, lean = 1): void {
    const j = this.j, root = j.root;
    if (!IK) return;
    if (dead >= 0) { this.fresh = true; this.w = 0; return; }
    if (dt <= 0) return;
    // only the chain down to the hips is brought up to date here (the renderer updates the rest): a crowd pays for this every frame
    root.updateWorldMatrix(true, false);
    const rm = root.matrixWorld;
    // far off the ground (rising out of it at spawn): nothing to plant a foot on, the pose stands; (the body lags the dais steps by up to their height, which the pelvis and dragged feet absorb)
    _c.setFromMatrixPosition(rm);
    if (Math.abs(_c.y - groundHeight(_c.x, _c.z)) > 0.5) { this.fresh = true; this.w = 0; return; }
    _s.setFromMatrixScale(rm);
    this.shape ??= [footShape(j.ankleL, root), footShape(j.ankleR, root)];
    const sc = _s.x, L1 = j.P.thighL, L2 = j.P.shinL, Lw = (L1 + L2) * sc;
    _f.set(0, 0, 1).transformDirection(rm);
    const yaw = Math.atan2(_f.x, _f.z);
    const rx = _c.x, rz = _c.z;
    // leaning into the motion, like a body falling forward onto its feet: the whole body tips about the ground under it, the head stays level
    {
      const lv = this.v, lf = Math.sin(this.lastYaw) * lv.x + Math.cos(this.lastYaw) * lv.z, ls = Math.cos(this.lastYaw) * lv.x - Math.sin(this.lastYaw) * lv.z;
      const k = LEAN * lean * weight;
      this.leanX = damp(this.leanX, Math.max(-0.12, Math.min(0.3, lf * k)), 6, dt);
      this.leanZ = damp(this.leanZ, Math.max(-0.12, Math.min(0.12, -ls * k)), 6, dt);
      j.body.rotation.x += this.leanX; j.body.rotation.z += this.leanZ;
      j.neck.rotation.x -= this.leanX * 0.5; j.head.rotation.x -= this.leanX * 0.3;
    }
    this.lastYaw = yaw;
    // a body that travels sideways to where it faces (aiming, casting) turns its pelvis and legs towards the way it goes, the chest staying on the aim, instead of crossing its feet
    {
      let want = 0;
      if (this.sp > 0.6 && lean > 0) {
        const rel = this.angle(0, yaw, Math.atan2(this.v.x, this.v.z)), a = Math.abs(rel);
        // (from sideways on round to backing up, the pelvis eases back to the aim: the legs go backwards under it)
        want = Math.sign(rel) * (a <= TWIST ? a : a <= 2 ? TWIST : TWIST * smooth((Math.PI - a) / (Math.PI - 2))) * smooth((this.sp - 0.6) / 1.2);
      }
      this.twist = damp(this.twist, want, 9, dt);
      j.hips.rotation.y += this.twist; j.spine.rotation.y -= this.twist * 0.5; j.chest.rotation.y -= this.twist * 0.5;
    }
    const pyaw = yaw + this.twist;
    j.body.updateWorldMatrix(false, false); j.hips.updateWorldMatrix(false, false);
    _c.setFromMatrixPosition(j.hips.matrixWorld);
    const legs: [THREE.Object3D, THREE.Object3D, THREE.Object3D][] = [[j.thighL, j.kneeL, j.ankleL], [j.thighR, j.kneeR, j.ankleR]];

    if (this.fresh || (rx - this.last.x) ** 2 + (rz - this.last.z) ** 2 > 4) this.start(legs, pyaw, phase, rx, rz);
    // the body's own velocity, smoothed; the phase rate too
    _h.set(rx - this.last.x, 0, rz - this.last.z).divideScalar(dt);
    const k14 = 1 - Math.exp(-dt * 14);
    this.v.lerp(_h, k14);
    this.sp += (_h.length() - this.sp) * k14;
    this.last.set(rx, 0, rz);
    this.dphase += ((phase - this.lastPhase) / dt - this.dphase) * (1 - Math.exp(-dt * 14));
    this.lastPhase = phase;
    const speed = this.sp;
    this.moving = speed > (this.moving ? 0.25 : 0.55);
    // the way it travels: the smoothed velocity's, or (through a reversal, when that is nearly nothing) the latest
    const lv = this.v.length(), vd = speed > 0.05 ? _t.copy(lv > 0.35 * speed ? this.v : _h).normalize() : _t.set(0, 0, 0);
    this.gv.copy(vd).multiplyScalar(speed);
    // the share of the cycle on the ground: less as the speed rises (a run has both feet in the air a while), so the stance's travel stays within the legs' reach
    const duty = Math.min(0.62, Math.max(0.31, 0.62 - 0.19 * (speed - 1.5)));
    const w2 = (1 - duty) / 2;
    const cycleT = TAU / Math.max(Math.abs(this.dphase), 0.5);
    const half = Math.min(speed * duty * cycleT * 0.5 * (1 - SLIP * smooth((speed - 2) / 3.5)), AHEAD * Lw);
    // at a run a planted foot creeps on with the body a little (SLIP of its speed), so the stance keeps to a range the legs can take without the splits
    const slip = SLIP * smooth((speed - 2) / 3.5);

    for (let i = 0; i < 2; i++) {
      const f = this.feet[i], [thigh, knee, ankle] = legs[i];
      f.fk.thigh.copy(thigh.quaternion); f.fk.knee.copy(knee.quaternion); f.fk.ankle.copy(ankle.quaternion);
      _h.copy(thigh.position).applyMatrix4(j.hips.matrixWorld);   // the hip joint
      const other = this.feet[1 - i], fs = this.shape![i], sole = fs.sole;
      const u = ((phase / TAU + i * 0.5) % 1 + 1) % 1, inWin = Math.abs(u - 0.5) < w2;

      if (this.moving) {
        // (a foot re-stepping does not take the other one's swing with it, or both leave the ground at once and the body drops between them; at a walk the other waits)
        if (f.state !== 'timed') {
          if (inWin && f.state === 'plant' && !(other.state === 'timed' && duty > 0.45)) { f.state = 'swing'; f.A.copy(f.P); f.yawA = f.yaw; f.carry = 0; f.rel0 = (f.P.x - _h.x) * vd.x + (f.P.z - _h.z) * vd.z; }
          else if (!inWin && f.state === 'swing') this.land(f, pyaw);
          if (f.state === 'swing') { const ts = (u - (0.5 - w2)) / (2 * w2); f.t = Math.min(1, Math.max(0, this.dphase < 0 ? 1 - ts : ts)); }
        }
      } else if (f.state === 'swing') {
        // it stopped mid-step: finish the step in time from where the foot is now, landing under the hip
        f.yawA += this.angle(f.yaw, f.yawA, pyaw) * smooth(f.t);
        f.carry = Math.max(0, f.pos.y - groundHeight(f.pos.x, f.pos.z) - sole * sc); f.pitch0 = f.shown;
        f.A.copy(f.pos); f.A.y = groundHeight(f.A.x, f.A.z);
        f.state = 'timed'; f.dur = 0.22; f.t = 0; f.fast = false;
      }
      if (f.state === 'timed') { f.t += dt / f.dur; if (f.t >= 1) this.land(f, pyaw); }

      // a planted foot that has fallen too far from under its hip (a turn, a sudden start) steps back under it
      if (f.state === 'plant') {
        f.stance += dt;
        if (this.moving && slip > 0) { f.P.x += this.gv.x * slip * dt; f.P.z += this.gv.z * slip * dt; }
        // a foot pivots with the body when it turns, rather than staying across the leg
        const dy = this.angle(0, f.yaw, pyaw);
        if (Math.abs(dy) > YAW_MAX) f.yaw = pyaw - Math.sign(dy) * YAW_MAX;
        const dev = Math.hypot(f.P.x - _h.x, f.P.z - _h.z);
        if (dev > (this.moving ? 0.55 : 0.1) * Lw && (this.moving ? other.state !== 'timed' : other.state === 'plant' || (other.state === 'timed' && other.t > 0.2)) && f.stance > (this.moving ? 0.12 : 0.05)) {
          f.state = 'timed'; f.t = 0; f.fast = this.moving; f.dur = this.moving ? Math.min(0.3, Math.max(0.12, (1 - duty) * cycleT)) : Math.min(0.4, 0.16 + dev * 0.3); f.A.copy(f.P); f.yawA = f.yaw; f.carry = 0; f.pitch0 = f.shown;
          f.B.set(_h.x + vd.x * half, 0, _h.z + vd.z * half);
          f.stance = 0;
        }
      }
      if (f.state === 'swing' || f.state === 'timed') {
        // where it will land: under where its hip will be by then, a half stance ahead
        const remain = f.state === 'swing' ? (1 - f.t) * (1 - duty) * cycleT : (1 - f.t) * f.dur;
        f.B.set(_h.x + this.gv.x * remain + vd.x * (f.state === 'swing' ? half : 0), 0, _h.z + this.gv.z * remain + vd.z * (f.state === 'swing' ? half : 0));
        const e = f.fast ? 0.6 * f.t * (2 - f.t) + 0.4 * smooth(f.t) : smooth(f.t), run = smooth((speed - 2) / 3.5);
        // (a run lifts the foot higher, and later in the swing: the heel comes up under the seat)
        const lift = (1 + 0.5 * run) * Math.min(0.2, Math.max(0.05, 0.04 + 0.03 * speed)) * sc * Math.sin(Math.PI * Math.pow(Math.min(1, f.t), 1 - 0.2 * run));
        f.pos.set(f.A.x + (f.B.x - f.A.x) * e, 0, f.A.z + (f.B.z - f.A.z) * e);
        if (f.state === 'swing' && speed > 0.5) {
          // the swing in the hip's frame, along the way it travels: it leaves with the stance's backward stroke, passes under the hip and reaches ahead, then paws back as it lands, so it never skids
          const T = (1 - duty) * cycleT, m = -(1 - slip) * speed * T, s1 = f.t, s2 = s1 * s1, s3 = s2 * s1;
          const x = (2 * s3 - 3 * s2 + 1) * f.rel0 + (s3 - 2 * s2 + s1) * STROKE_OUT * m + (-2 * s3 + 3 * s2) * half + (s3 - s2) * STROKE_IN * m;
          const along = (f.pos.x - _h.x) * vd.x + (f.pos.z - _h.z) * vd.z;
          f.pos.x += vd.x * (x - along); f.pos.z += vd.z * (x - along);
        }
        const gA = groundHeight(f.A.x, f.A.z), gB = groundHeight(f.B.x, f.B.z);
        const tilt = this.tilt(fs, f.pitch) * sc;
        f.pos.y = gA + (gB - gA) * e + sole * sc + lift + f.carry * (1 - e) + tilt;
        // toe down as it leaves, up as it lands
        f.pitch = 0.32 * (1 - smooth(f.t * 2.5)) - 0.26 * smooth((f.t - 0.7) / 0.3);
        if (f.state === 'timed') f.pitch = f.pitch0 + (f.pitch - f.pitch0) * smooth(f.t * 3);
        f.stance = 0;
      } else {
        f.pitch = this.stancePitch(f, i, phase, duty, w2);
        f.pos.set(f.P.x, groundHeight(f.P.x, f.P.z) + sole * sc + this.tilt(fs, f.pitch) * sc, f.P.z);
      }
    }

    // a body thrown away from its feet (an attack's lunge or lean, a hit) takes them along sideways, rather than sinking to reach them
    for (let i = 0; i < 2; i++) {
      const f = this.feet[i];
      _p.copy(legs[i][0].position).applyMatrix4(j.hips.matrixWorld);
      // as far out as the leg reaches with the pelvis dropped a little (a foot out wider or farther back would squat the body)
      const dy = Math.max(0, _p.y - f.pos.y - 0.1 * Lw), lm = 0.97 * Lw;
      const dx = f.pos.x - _p.x, dz = f.pos.z - _p.z, h = Math.hypot(dx, dz), hmax = Math.min(0.7 * Lw, Math.max(0.2 * Lw, Math.sqrt(Math.max(0, lm * lm - dy * dy))));
      if (h > hmax) {
        const k = hmax / h;
        f.pos.x = _p.x + dx * k; f.pos.z = _p.z + dz * k;
        if (f.state === 'plant') { f.P.x = f.pos.x; f.P.z = f.pos.z; }
      }
    }
    // the pelvis stands as tall as the legs allow (the rig's rest pose has the knees bent by a third of a radian), and drops until both feet are in reach
    j.body.position.y += RISE; j.body.updateWorldMatrix(false, false); j.hips.updateWorldMatrix(false, false);
    let need = 0;
    _m.copy(j.hips.matrixWorld).invert();
    for (let i = 0; i < 2; i++) {
      const thigh = legs[i][0];
      _p.copy(this.feet[i].pos).applyMatrix4(_m);
      const dx = _p.x - thigh.position.x, dy = _p.y - thigh.position.y, dz = _p.z - thigh.position.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz), lmax = 0.98 * (L1 + L2);
      if (d > lmax) need = Math.max(need, (d - lmax) / Math.max(0.35, -dy / d));
    }
    // (never more than a crouch: a lunge or a leap takes the body away from its feet, and the feet then follow it, below)
    this.drop = damp(this.drop, Math.min(need, 0.2 * Lw + RISE), need > this.drop ? 30 : 9, dt);
    if (this.drop > 1e-4) {
      j.body.position.y -= this.drop; j.body.updateWorldMatrix(false, false); j.hips.updateWorldMatrix(false, false);
      _m.copy(j.hips.matrixWorld).invert();
    }
    j.hips.matrixWorld.decompose(_pp, _hq, _ps);

    this.w = damp(this.w, weight, 10, dt);
    for (let i = 0; i < 2; i++) {
      const f = this.feet[i], [thigh, knee, ankle] = legs[i];
      _p.copy(f.pos).applyMatrix4(_m);
      // a foot the body has left behind (a lunge, a leap) is dragged after it, a planted one to its new spot
      _f.copy(_p).sub(thigh.position);
      const reach = _f.length(), rmax = 0.99 * (L1 + L2);
      if (reach > rmax) {
        _p.copy(thigh.position).addScaledVector(_f, rmax / reach).applyMatrix4(j.hips.matrixWorld);
        if (f.state === 'plant') { f.P.x = _p.x; f.P.z = _p.z; }
        f.pos.x = _p.x; f.pos.z = _p.z;
        _p.copy(f.pos).applyMatrix4(_m);
      }
      _pole.set(i === 0 ? 0.12 : -0.12, 0, 1);
      reachArm(thigh, knee, L1, L2, _p, _pole, -1);
      // the foot lies level, turned to the way it was planted (or, in a swing, towards where the body faces)
      const yawNow = f.state === 'plant' ? f.yaw : f.yawA + this.angle(f.yaw, f.yawA, pyaw) * smooth(f.t);
      f.shown = f.pitch;
      _e.set(f.shown, yawNow, 0, 'YXZ');
      _q2.setFromEuler(_e);
      _q.copy(_hq).multiply(thigh.quaternion).multiply(knee.quaternion).invert();
      ankle.quaternion.copy(_q.multiply(_q2));
      if (this.w < 0.999) {
        thigh.quaternion.copy(f.fk.thigh).slerp(thigh.quaternion, this.w);
        knee.quaternion.copy(f.fk.knee).slerp(knee.quaternion, this.w);
        ankle.quaternion.copy(f.fk.ankle).slerp(ankle.quaternion, this.w);
      }
    }
  }

  /** how much a foot pitched by `p` (toe down positive) must be raised so the toe or the heel does not go through the floor */
  private tilt(fs: { sole: number; toe: number; heel: number }, p: number): number {
    const a = Math.abs(p);
    return fs.sole * (Math.cos(a) - 1) + (p > 0 ? fs.toe : fs.heel) * Math.sin(a) + 0 * 0;
  }

  private angle(_to: number, from: number, now: number): number {
    let d = (now - from) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU;
    return d;
  }

  /** heel down at the landing, toe pushing off at the end of the stance (the walk cycle's own phase) */
  private stancePitch(f: Foot, i: number, phase: number, duty: number, w2: number): number {
    if (!this.moving) return 0;
    const u = ((phase / TAU + i * 0.5) % 1 + 1) % 1, sp = (((u - (0.5 + w2)) % 1) + 1) % 1 / Math.max(0.05, 1 - 2 * w2);
    void f;
    const run = smooth((this.sp - 2) / 3.5), at = 0.75 - 0.15 * run;
    if (sp > at && sp < 1) return (0.35 + 0.25 * run) * (sp - at) / (1 - at);
    if (sp < 0.15) return -0.2 * (1 - sp / 0.15);
    void duty;
    return 0;
  }

  private land(f: Foot, yaw: number): void {
    f.state = 'plant'; f.P.copy(f.B); f.P.y = groundHeight(f.P.x, f.P.z); f.yaw = yaw; f.t = 0; f.stance = 0; f.carry = 0;
  }

  private start(legs: [THREE.Object3D, THREE.Object3D, THREE.Object3D][], yaw: number, phase: number, rx: number, rz: number): void {
    for (let i = 0; i < 2; i++) {
      const f = this.feet[i];
      legs[i][0].getWorldPosition(_h);
      f.state = 'plant'; f.P.set(_h.x, groundHeight(_h.x, _h.z), _h.z); f.yaw = f.yawA = yaw; f.t = 0; f.stance = 0;
    }
    this.last.set(rx, 0, rz); this.leanX = this.leanZ = 0;
    this.v.set(0, 0, 0); this.gv.set(0, 0, 0); this.sp = 0; this.twist = 0; this.dphase = 0; this.lastPhase = phase; this.moving = false; this.drop = 0;
    this.fresh = false;
  }
}

/**
 * The head looks at something: the neck and the head turn (and nod) onto a world point, shared 40 / 60,
 * within what a neck allows, eased so it glances rather than snaps, and back ahead when the point is behind
 * the body or out of range. Applied on top of the pose (after `animate`), so it moves only the head and what
 * rides on it; the spine and arms stay as the pose put them. Works from the body's position and facing alone,
 * so it reads no matrices.
 */
export class LookAt {
  private yaw = 0;
  private pitch = 0;
  /** the eyes' height above the root, at the pose's rest */
  private readonly eyeH: number;

  constructor(private readonly j: Joints) {
    this.eyeH = j.body.position.y + j.hips.position.y + j.spine.position.y + j.chest.position.y + j.neck.position.y + j.head.position.y;
  }

  reset(): void { this.yaw = 0; this.pitch = 0; }

  /** `from` the body's spot (x, ground y, z) and `facing`; `target` a world point, or null to look ahead; `weight` 0..1 */
  update(dt: number, from: THREE.Vector3, facing: number, target: THREE.Vector3 | null, weight = 1): void {
    if (!IK || dt <= 0) return;
    const j = this.j, sc = j.root.scale.x;
    let ty = 0, tp = 0;
    if (target && weight > 0) {
      const dx = target.x - from.x, dz = target.z - from.z, d = Math.hypot(dx, dz);
      if (d > 0.5 && d < MAX_LOOK) {
        let a = Math.atan2(dx, dz) - facing; a = Math.atan2(Math.sin(a), Math.cos(a));
        // behind the shoulders it looks ahead again rather than wringing the neck
        if (Math.abs(a) < 1.9) { ty = Math.max(-1.15, Math.min(1.15, a)) * (1 - smooth((Math.abs(a) - 1.2) / 0.7)); tp = Math.max(-0.45, Math.min(0.45, Math.atan2(from.y + this.eyeH * sc - target.y, d))); }
      }
    }
    this.yaw = damp(this.yaw, ty * weight, 7, dt);
    this.pitch = damp(this.pitch, tp * weight, 7, dt);
    j.neck.rotation.y += this.yaw * 0.4; j.head.rotation.y += this.yaw * 0.6;
    j.neck.rotation.x += this.pitch * 0.4; j.head.rotation.x += this.pitch * 0.6;
  }
}
const MAX_LOOK = 20;
