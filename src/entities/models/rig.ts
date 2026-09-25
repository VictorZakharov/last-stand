// Procedural humanoid rig: a hierarchy of joint Groups with primitive meshes,
// plus reusable procedural animation helpers. Forward is +Z, left is +X.
import * as THREE from 'three';

export function part(geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

export function joint(parent: THREE.Object3D, x = 0, y = 0, z = 0): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

const capsule = (r: number, len: number) => new THREE.CapsuleGeometry(r, Math.max(0.001, len - r * 2), 4, 10);

export const DEFAULT_PROPORTIONS = {
  hipY: 0.95, hipW: 0.2,
  thighL: 0.46, shinL: 0.44, thighR: 0.085, shinR: 0.065,
  torsoL: 0.5, chestW: 0.2, chestD: 0.13, waistW: 0.15,
  shoulderW: 0.23, upperL: 0.3, foreL: 0.27, upperR: 0.055, foreR: 0.045, handR: 0.05,
  neckL: 0.1, headR: 0.12,
};
export type Proportions = typeof DEFAULT_PROPORTIONS;

export type BodyPart = 'skin' | 'torso' | 'legs' | 'feet' | 'arms' | 'hands';

/** Named joints of a humanoid. L = +X (character's left), R = -X. */
export interface Joints {
  P: Proportions;
  root: THREE.Group; body: THREE.Group; hips: THREE.Group; spine: THREE.Group; chest: THREE.Group; chestMesh: THREE.Mesh;
  neck: THREE.Group; head: THREE.Group;
  thighL: THREE.Group; kneeL: THREE.Group; ankleL: THREE.Group;
  thighR: THREE.Group; kneeR: THREE.Group; ankleR: THREE.Group;
  shoulderL: THREE.Group; elbowL: THREE.Group; handL: THREE.Group;
  shoulderR: THREE.Group; elbowR: THREE.Group; handR: THREE.Group;
}

/**
 * Build a humanoid. `M` maps body parts to materials (missing entries fall back
 * to `skin`). `overrides` tweak the default proportions.
 */
export function buildHumanoid(M: Partial<Record<BodyPart, THREE.Material>> & { skin: THREE.Material }, overrides: Partial<Proportions> = {}): Joints {
  const P: Proportions = { ...DEFAULT_PROPORTIONS, ...overrides };
  const mat = (k: BodyPart) => M[k] ?? M.skin;
  const root = new THREE.Group();
  const body = joint(root);
  const hips = joint(body, 0, P.hipY, 0);
  part(new THREE.SphereGeometry(1, 16, 12).scale(P.hipW * 0.95, 0.12, P.chestD * 0.95), mat('legs'), hips, 0, 0.02, 0);

  const leg = (s: number) => {
    const thigh = joint(hips, s * P.hipW * 0.55, -0.02, 0);
    part(capsule(P.thighR, P.thighL), mat('legs'), thigh, 0, -P.thighL / 2, 0);
    const knee = joint(thigh, 0, -P.thighL, 0);
    part(capsule(P.shinR, P.shinL), mat('legs'), knee, 0, -P.shinL / 2, 0);
    const ankle = joint(knee, 0, -P.shinL, 0);
    part(new THREE.BoxGeometry(P.shinR * 1.9, P.shinR * 1.2, P.shinR * 4.2), mat('feet'), ankle, 0, -P.shinR * 0.5, P.shinR * 1.1);
    return { thigh, knee, ankle };
  };
  const legL = leg(1), legR = leg(-1);

  const spine = joint(hips, 0, 0.06, 0);
  part(new THREE.SphereGeometry(1, 16, 12).scale(P.waistW, P.torsoL * 0.35, P.chestD * 0.9), mat('torso'), spine, 0, P.torsoL * 0.2, 0);
  const chest = joint(spine, 0, P.torsoL * 0.45, 0);
  const chestMesh = part(new THREE.SphereGeometry(1, 20, 14).scale(P.chestW, P.torsoL * 0.42, P.chestD), mat('torso'), chest, 0, P.torsoL * 0.12, 0);
  const neck = joint(chest, 0, P.torsoL * 0.5, 0);
  part(capsule(P.headR * 0.42, P.neckL + 0.06), mat('skin'), neck, 0, P.neckL * 0.4, 0);
  const head = joint(neck, 0, P.neckL, 0);

  const arm = (s: number) => {
    const shoulder = joint(chest, s * P.shoulderW, P.torsoL * 0.36, 0);
    part(new THREE.SphereGeometry(P.upperR * 1.35, 12, 10), mat('arms'), shoulder);
    part(capsule(P.upperR, P.upperL), mat('arms'), shoulder, 0, -P.upperL / 2, 0);
    const elbow = joint(shoulder, 0, -P.upperL, 0);
    part(capsule(P.foreR, P.foreL), mat('arms'), elbow, 0, -P.foreL / 2, 0);
    const hand = joint(elbow, 0, -P.foreL, 0);
    part(new THREE.SphereGeometry(P.handR, 10, 8).scale(0.9, 1.25, 0.65), mat('hands'), hand, 0, -P.handR * 0.9, 0);
    return { shoulder, elbow, hand };
  };
  const armL = arm(1), armR = arm(-1);

  return {
    P, root, body, hips, spine, chest, chestMesh, neck, head,
    thighL: legL.thigh, kneeL: legL.knee, ankleL: legL.ankle,
    thighR: legR.thigh, kneeR: legR.knee, ankleR: legR.ankle,
    shoulderL: armL.shoulder, elbowL: armL.elbow, handL: armL.hand,
    shoulderR: armR.shoulder, elbowR: armR.elbow, handR: armR.hand,
  };
}
// --- animation helpers -------------------------------------------------------

/** Reset all joint rotations so each frame builds its pose from scratch. */
export function resetPose(j: Joints): void {
  for (const k of ['body', 'hips', 'spine', 'chest', 'neck', 'head', 'thighL', 'thighR', 'kneeL', 'kneeR', 'ankleL', 'ankleR',
    'shoulderL', 'shoulderR', 'elbowL', 'elbowR', 'handL', 'handR'] as const) {
    if (j[k]) j[k].rotation.set(0, 0, 0);
  }
  j.body.position.set(0, 0, 0);
}

/**
 * Procedural walk/run cycle. `amt` 0..1 blends from standing to full stride.
 * `dir` is +1 forward / -1 backpedal.
 */
export interface WalkOpts { stride?: number; knee?: number; arm?: number; bob?: number; dir?: number }
export function walkCycle(j: Joints, phase: number, amt: number, o: WalkOpts = {}): void {
  const stride = o.stride ?? 0.55, knee = o.knee ?? 1.0, arm = o.arm ?? 0.45, bob = o.bob ?? 0.06, dir = o.dir ?? 1;
  const s = Math.sin(phase) * dir, c = Math.cos(phase);
  j.thighL.rotation.x += -s * stride * amt;
  j.thighR.rotation.x += s * stride * amt;
  j.kneeL.rotation.x += (Math.max(0, c * dir) * knee + 0.08) * amt;
  j.kneeR.rotation.x += (Math.max(0, -c * dir) * knee + 0.08) * amt;
  j.ankleL.rotation.x += -j.thighL.rotation.x * 0.3 - j.kneeL.rotation.x * 0.4;
  j.ankleR.rotation.x += -j.thighR.rotation.x * 0.3 - j.kneeR.rotation.x * 0.4;
  j.shoulderL.rotation.x += s * arm * amt;
  j.shoulderR.rotation.x += -s * arm * amt;
  j.elbowL.rotation.x += -(0.25 + Math.max(0, -s) * 0.4) * amt;
  j.elbowR.rotation.x += -(0.25 + Math.max(0, s) * 0.4) * amt;
  j.body.position.y += (Math.abs(c) - 0.6) * bob * amt;
  j.hips.rotation.y += s * 0.12 * amt;
  j.chest.rotation.y += -s * 0.16 * amt;
  j.hips.rotation.z += c * 0.04 * amt;
}

/** Breathing + subtle sway while standing. */
export function idle(j: Joints, t: number, amt = 1): void {
  const b = Math.sin(t * 1.8);
  j.chest.rotation.x += b * 0.025 * amt;
  j.neck.rotation.x += -b * 0.02 * amt;
  j.shoulderL.rotation.z += (0.08 + b * 0.02) * amt;
  j.shoulderR.rotation.z += -(0.08 + b * 0.02) * amt;
  j.elbowL.rotation.x += -0.15 * amt;
  j.elbowR.rotation.x += -0.15 * amt;
  j.body.position.y += b * 0.006 * amt;
}

/** Death fall; k: 0..1 */
export function deathFall(j: Joints, k: number, dirSign = -1): void {
  const e = 1 - (1 - Math.min(1, k * 1.6)) ** 3;
  j.body.rotation.x = dirSign * e * 1.45;
  j.body.position.y -= e * 0.1;
  j.kneeL.rotation.x += e * 0.6; j.kneeR.rotation.x += e * 0.3;
  j.shoulderL.rotation.z += e * 0.9; j.shoulderR.rotation.z -= e * 0.9;
}

/** Bell curve 0 → 1 → 0 over t in [a, b]. */
export const pulse = (t: number, a: number, b: number): number => (t <= a || t >= b ? 0 : Math.sin(((t - a) / (b - a)) * Math.PI));
/** Ramp 0 → 1 between a and b. */
export const ramp = (t: number, a: number, b: number): number => Math.min(1, Math.max(0, (t - a) / (b - a)));

const _t = new THREE.Vector3(), _h = new THREE.Vector3(), _e = new THREE.Vector3(), _p = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const X_AXIS = new THREE.Vector3(1, 0, 0), DOWN = new THREE.Vector3(0, -1, 0);

/**
 * Two-bone IK: pose an arm so its hand reaches `target` (in the shoulder's parent space, e.g. the
 * chest), with the elbow bending forward (the rig's elbows hinge on X) and turned towards `pole`.
 * Overwrites the shoulder and elbow rotations. Out of reach, the arm points straight at the target.
 */
export function reachArm(shoulder: THREE.Object3D, elbow: THREE.Object3D, upper: number, fore: number, target: THREE.Vector3, pole: THREE.Vector3): void {
  _t.copy(target).sub(shoulder.position);
  const d = Math.min(Math.max(_t.length(), 0.02), upper + fore - 1e-4);
  const cosE = (upper * upper + fore * fore - d * d) / (2 * upper * fore);
  const bend = Math.PI - Math.acos(Math.min(1, Math.max(-1, cosE)));
  elbow.rotation.set(-bend, 0, 0);
  // where the hand is with the shoulder unrotated, then turn that onto the target
  _h.set(0, -fore, 0).applyAxisAngle(X_AXIS, -bend).add(_e.set(0, -upper, 0)).normalize();
  _t.normalize();
  _q.setFromUnitVectors(_h, _t);
  // twist about the reach so the elbow points at the pole
  _e.copy(DOWN).multiplyScalar(upper).applyQuaternion(_q).projectOnPlane(_t);
  _p.copy(pole).projectOnPlane(_t);
  if (_e.lengthSq() > 1e-8 && _p.lengthSq() > 1e-8) {
    const ang = _e.angleTo(_p) * Math.sign(_t.dot(_h.crossVectors(_e, _p)));
    _q.premultiply(_q2.setFromAxisAngle(_t, ang));
  }
  shoulder.quaternion.copy(_q);
}

const _a = new THREE.Vector3(), _hip = new THREE.Vector3(), _k = new THREE.Quaternion(), _r = new THREE.Quaternion(), _eu = new THREE.Euler();

/**
 * Leg IK against the ground (the model root's y = 0): an ankle posed below `footH` (the foot would sink
 * into the floor, as when the body crouches for a slam or a block) is lifted back to it by bending the
 * hip and knee, the foot staying where it was over the ground; and a foot at or near the floor turns
 * flat on it. Runs after the pose, before anything reads the joints' world matrices. Not while dying.
 */
export function groundFeet(j: Joints, footH: number): void {
  const root = j.root;
  root.updateMatrixWorld(true);
  for (const [thigh, knee, ankle] of [[j.thighL, j.kneeL, j.ankleL], [j.thighR, j.kneeR, j.ankleR]] as const) {
    ankle.getWorldPosition(_a); root.worldToLocal(_a);
    const sink = footH - _a.y;
    if (sink > 0) {
      // the target in the hip's parent (hips) space: the same spot, raised to the floor
      _a.y = footH;
      root.localToWorld(_a); thigh.parent!.worldToLocal(_a);
      _hip.copy(thigh.position);
      const L1 = j.P.thighL, L2 = j.P.shinL;
      const dy = _a.y - _hip.y, dz = _a.z - _hip.z, d = Math.min(Math.hypot(dy, dz), L1 + L2 - 1e-4);
      // knee bend from the triangle, then the thigh pitched so the ankle lands on the target (the knee
      // forward); the thigh's own roll and yaw stay as posed
      const bend = Math.PI - Math.acos(Math.min(1, Math.max(-1, (L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2))));
      const toT = Math.atan2(dz, -dy), inner = Math.asin(Math.min(1, L2 * Math.sin(bend) / Math.max(d, 1e-4)));
      thigh.rotation.x = -(toT + inner);
      knee.rotation.x = bend;
      root.updateMatrixWorld(true);
    }
    // a foot within a few cm of the floor lies flat on it: cancel the leg's pitch at the ankle
    ankle.getWorldPosition(_a); root.worldToLocal(_a);
    const planted = 1 - Math.min(1, Math.max(0, (_a.y - footH) / 0.05));
    if (planted > 0) {
      knee.getWorldQuaternion(_k); root.getWorldQuaternion(_r);
      _eu.setFromQuaternion(_r.invert().multiply(_k), 'YXZ');
      ankle.rotation.x += (-_eu.x - ankle.rotation.x) * planted;
    }
  }
}
