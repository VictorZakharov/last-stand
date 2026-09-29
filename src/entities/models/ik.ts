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
const IK = typeof location === 'undefined' || !/[?&]ik=0/.test(location.search);
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
const LEAN = 0.03;
const smooth = (t: number): number => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };

/** How far a half stride (one foot's step) is at `speed` (m/s) for legs `leg` long (world m): walks take short
 *  steps, runs long ones; the walk cycle's phase then advances π per step (`gaitRate`). */
export const stepLength = (speed: number, leg: number): number => Math.min(1.05, Math.max(0.35, 0.22 + 0.24 * speed)) * (leg / 0.9);
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
  private lastPhase = 0;
  private dphase = 0;
  private moving = false;
  private fresh = true;
  private drop = 0;
  /** the body's lean into its motion (forward, sideways), damped */
  private lastYaw = 0;
  private leanX = 0; private leanZ = 0;
  private shape: { sole: number; toe: number; heel: number }[] | null = null;
  /** the smoothed blend over the walk cycle's legs */
  private w = 0;

  constructor(private readonly j: Joints) { j.root.userData.legs = this; }   // (read by probes)

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
      this.leanX = damp(this.leanX, Math.max(-0.12, Math.min(0.22, lf * k)), 6, dt);
      this.leanZ = damp(this.leanZ, Math.max(-0.12, Math.min(0.12, -ls * k)), 6, dt);
      j.body.rotation.x += this.leanX; j.body.rotation.z += this.leanZ;
      j.neck.rotation.x -= this.leanX * 0.5; j.head.rotation.x -= this.leanX * 0.3;
    }
    this.lastYaw = yaw;
    j.body.updateWorldMatrix(false, false); j.hips.updateWorldMatrix(false, false);
    _c.setFromMatrixPosition(j.hips.matrixWorld);
    const legs: [THREE.Object3D, THREE.Object3D, THREE.Object3D][] = [[j.thighL, j.kneeL, j.ankleL], [j.thighR, j.kneeR, j.ankleR]];

    if (this.fresh || (rx - this.last.x) ** 2 + (rz - this.last.z) ** 2 > 4) this.start(legs, yaw, phase, rx, rz);
    // the body's own velocity, smoothed; the phase rate too
    _h.set(rx - this.last.x, 0, rz - this.last.z).divideScalar(dt);
    this.v.lerp(_h, 1 - Math.exp(-dt * 14));
    this.last.set(rx, 0, rz);
    this.dphase += ((phase - this.lastPhase) / dt - this.dphase) * (1 - Math.exp(-dt * 14));
    this.lastPhase = phase;
    const speed = this.v.length();
    this.moving = speed > (this.moving ? 0.25 : 0.55);
    const vd = speed > 0.05 ? _t.copy(this.v).divideScalar(speed) : _t.set(0, 0, 0);
    // the share of the cycle on the ground: less as the speed rises (a run has both feet in the air a while), so the stance's travel stays within the legs' reach
    const duty = Math.min(0.62, Math.max(0.28, 0.75 - 0.13 * speed));
    const w2 = (1 - duty) / 2;
    const cycleT = TAU / Math.max(Math.abs(this.dphase), 0.5);
    const half = Math.min(speed * duty * cycleT * 0.5, (0.3 - 0.1 * Math.min(1, speed / 6)) * Lw);
    const anyTimed = this.feet.some((f) => f.state === 'timed');

    for (let i = 0; i < 2; i++) {
      const f = this.feet[i], [thigh, knee, ankle] = legs[i];
      f.fk.thigh.copy(thigh.quaternion); f.fk.knee.copy(knee.quaternion); f.fk.ankle.copy(ankle.quaternion);
      _h.copy(thigh.position).applyMatrix4(j.hips.matrixWorld);   // the hip joint
      const other = this.feet[1 - i], fs = this.shape![i], sole = fs.sole;
      const u = ((phase / TAU + i * 0.5) % 1 + 1) % 1, inWin = Math.abs(u - 0.5) < w2;

      if (this.moving && !anyTimed) {
        if (inWin && f.state === 'plant') { f.state = 'swing'; f.A.copy(f.P); f.yawA = f.yaw; f.carry = 0; }
        else if (!inWin && f.state === 'swing') this.land(f, yaw);
        if (f.state === 'swing') { const ts = (u - (0.5 - w2)) / (2 * w2); f.t = Math.min(1, Math.max(0, this.dphase < 0 ? 1 - ts : ts)); }
      } else if (f.state === 'swing') {
        // it stopped mid-step: finish the step in time from where the foot is now, landing under the hip
        f.yawA += this.angle(f.yaw, f.yawA, yaw) * smooth(f.t);
        f.carry = Math.max(0, f.pos.y - groundHeight(f.pos.x, f.pos.z) - sole * sc); f.pitch0 = f.shown;
        f.A.copy(f.pos); f.A.y = groundHeight(f.A.x, f.A.z);
        f.state = 'timed'; f.dur = 0.3; f.t = 0;
      }
      if (f.state === 'timed') { f.t += dt / f.dur; if (f.t >= 1) this.land(f, yaw); }

      // a planted foot that has fallen too far from under its hip (a turn, a sudden start) steps back under it
      if (f.state === 'plant') {
        f.stance += dt;
        const dev = Math.hypot(f.P.x - _h.x, f.P.z - _h.z);
        if (dev > (this.moving ? 0.85 : 0.1) * Lw && other.state === 'plant' && f.stance > (this.moving ? 0.12 : 0.05)) {
          f.state = 'timed'; f.t = 0; f.dur = Math.min(0.5, 0.25 + dev * 0.3); f.A.copy(f.P); f.yawA = f.yaw; f.carry = 0; f.pitch0 = f.shown;
          f.B.set(_h.x + vd.x * half, 0, _h.z + vd.z * half);
          f.stance = 0;
        }
      }
      if (f.state === 'swing' || f.state === 'timed') {
        // where it will land: under where its hip will be by then, a half stance ahead
        const remain = f.state === 'swing' ? (1 - f.t) * (1 - duty) * cycleT : (1 - f.t) * f.dur;
        f.B.set(_h.x + this.v.x * remain + vd.x * (f.state === 'swing' ? half : 0), 0, _h.z + this.v.z * remain + vd.z * (f.state === 'swing' ? half : 0));
        const e = f.state === 'swing' ? 0.6 * f.t * (2 - f.t) + 0.4 * smooth(f.t) : smooth(f.t), lift = Math.min(0.2, Math.max(0.05, 0.04 + 0.03 * speed)) * sc * Math.sin(Math.PI * Math.min(1, f.t));
        f.pos.set(f.A.x + (f.B.x - f.A.x) * e, 0, f.A.z + (f.B.z - f.A.z) * e);
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
      const dx = f.pos.x - _p.x, dz = f.pos.z - _p.z, h = Math.hypot(dx, dz), hmax = 0.7 * (L1 + L2) * sc;
      if (h > hmax) {
        const k = hmax / h;
        f.pos.x = _p.x + dx * k; f.pos.z = _p.z + dz * k;
        if (f.state === 'plant') { f.P.x = f.pos.x; f.P.z = f.pos.z; }
      }
    }
    // the pelvis drops until both feet are in reach
    let need = 0;
    _m.copy(j.hips.matrixWorld).invert();
    for (let i = 0; i < 2; i++) {
      const thigh = legs[i][0];
      _p.copy(this.feet[i].pos).applyMatrix4(_m);
      const dx = _p.x - thigh.position.x, dy = _p.y - thigh.position.y, dz = _p.z - thigh.position.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz), lmax = 0.97 * (L1 + L2);
      if (d > lmax) need = Math.max(need, (d - lmax) / Math.max(0.35, -dy / d));
    }
    // (never more than a crouch: a lunge or a leap takes the body away from its feet, and the feet then follow it, below)
    this.drop = damp(this.drop, Math.min(need, 0.2 * Lw), need > this.drop ? 30 : 9, dt);
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
      const yawNow = f.state === 'plant' ? f.yaw : f.yawA + this.angle(f.yaw, f.yawA, yaw) * smooth(f.t);
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
    if (sp > 0.75 && sp < 1) return 0.35 * (sp - 0.75) / 0.25;
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
    this.v.set(0, 0, 0); this.dphase = 0; this.lastPhase = phase; this.moving = false; this.drop = 0;
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
