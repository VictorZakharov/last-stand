// A healing draught's flask, and the move that drinks it: taken from the belt by the free hand, lifted to the
// lips by arm IK (to a point at the mouth on the head), the head tipping back to drink, then put away. Shared
// by the heroes; each model hangs the flask in its free fist and a mouth point on its head.
import * as THREE from 'three';
import { reachArm, type Joints } from './rig';
import { curve, type Keys } from './motion';
import type { MaterialKit } from '../../types';

const _t = new THREE.Vector3(), _f = new THREE.Vector3(), _m = new THREE.Vector3(), _w = new THREE.Vector3(), _d = new THREE.Vector3();
const _q = new THREE.Quaternion(), _hw = new THREE.Quaternion(), _r = new THREE.Quaternion();

/** where a model drinks from: the wrist's place from the mouth (the head's frame: x left, y up, z forward; m) and where the elbow points (the chest's frame) */
export interface DrinkHold { wrist: THREE.Vector3; /** the wrist as it drinks: above and before the mouth, so the neck points down into the lips and the bottom is tipped up */ tipped: THREE.Vector3; pole: THREE.Vector3 }

/** a round-bottomed flask of glowing red draught with a brass neck and a leather stopper, its mouth up its +y, its base at the origin (held in a fist by its base, the body and neck out past the fingers so it is seen); `cap` and `stopper` are materials the model already has */
export function buildFlask(kit: MaterialKit, cap: THREE.Material, stopper: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, y: number) => { const o = new THREE.Mesh(geo, m); o.position.y = y; g.add(o); };
  add(new THREE.SphereGeometry(0.05, 16, 12), kit.glow(0xff3030, 2.2, false), 0.045);
  add(new THREE.CylinderGeometry(0.016, 0.022, 0.06, 12), cap, 0.115);
  add(new THREE.CylinderGeometry(0.014, 0.012, 0.022, 8), stopper, 0.155);
  g.visible = false;
  return g;
}

/** the drink's beats over the cast (k): the off-hand weapon goes onto the hip, the flask comes out, up to the lips, drunk (the heal lands at 0.5), lowered and stowed, the weapon drawn again */
export const DRINK_SHEATHED: readonly [number, number] = [0.12, 0.88];
// (smooth keyed curves: every beat eases in and out, so the arm never starts or stops at speed)
/** the hand at the left hip (the weapon hung there and the flask taken, then stowed and the weapon drawn) */
const HIP: Keys = [[0, 0], [0.12, 1], [0.15, 1], [0.25, 0], [0.72, 0], [0.85, 1], [0.89, 1], [1, 0]];
/** up at the lips */
const LIFT: Keys = [[0, 0], [0.13, 0], [0.33, 1], [0.6, 1], [0.86, 0]];
/** the flask tipped up, drinking */
const TIP: Keys = [[0, 0], [0.3, 0], [0.43, 1], [0.54, 1], [0.66, 0]];
/** the flask out of the pouch */
const OUT: Keys = [[0, 0], [0.13, 0], [0.18, 1], [0.81, 1], [0.86, 0]];

/**
 * The drinking move on the left arm (`k` 0..1 of the cast) over the pose so far: the hand to the left hip (to
 * hang a weapon there and take the flask from the pouch), up to the lips, the head tipping back as it drinks,
 * down to the hip again (the flask stowed, a weapon drawn). `mouth` is a point just before the lips on the head.
 * Returns how far the flask is out (0..1) for the model to show it.
 */
export function drink(j: Joints, k: number, mouth: THREE.Object3D, hold: DrinkHold): number {
  const hip = curve(HIP, k), e = curve(LIFT, k), tip = curve(TIP, k);
  // to the belt on the left hip
  j.shoulderL.rotation.x += 0.35 * hip; j.shoulderL.rotation.z += 0.12 * hip; j.elbowL.rotation.x += -0.6 * hip;
  // the head and shoulders tip back as it drinks
  j.neck.rotation.x += -0.3 * tip; j.head.rotation.x += -0.22 * tip; j.spine.rotation.x += -0.08 * tip;
  if (e > 0) {
    const sc = j.root.scale.x;
    j.root.updateMatrixWorld(true);
    // the wrist where the model holds it from (`hold`), below the lips as it comes up and over them as it drinks
    mouth.getWorldPosition(_m);
    j.head.getWorldQuaternion(_q);
    _w.lerpVectors(hold.wrist, hold.tipped, tip);
    _t.copy(_w).applyQuaternion(_q).multiplyScalar(sc).add(_m);
    // (the flask's neck points from there at the lips: from the planned wrist, not wherever the arm has got to, so it turns only as the drink tips it)
    _f.copy(_w).negate().applyQuaternion(_q).normalize();
    j.chest.worldToLocal(_t);
    _q.copy(j.shoulderL.quaternion);
    const e0 = j.elbowL.rotation.x;
    reachArm(j.shoulderL, j.elbowL, j.P.upperL, j.P.foreL, _t, hold.pole);
    // (blended from the pose's own turn: the IK's is copied first, slerpQuaternions would read the one it writes)
    _r.copy(j.shoulderL.quaternion); j.shoulderL.quaternion.copy(_q).slerp(_r, e);
    j.elbowL.rotation.x = e0 + (j.elbowL.rotation.x - e0) * e;
    j.root.updateMatrixWorld(true);
    j.handL.getWorldQuaternion(_hw);
    _d.set(0, -1, 0).applyQuaternion(_hw);
    _r.setFromUnitVectors(_d, _f).multiply(_hw);
    j.elbowL.getWorldQuaternion(_hw).invert().multiply(_r);
    j.handL.quaternion.slerp(_hw, e);
  }
  return curve(OUT, k);
}

/** how far the flask is up at the lips (0..1) at `k`: a model eases what it moves out of the way by it */
export const drinkUp = (k: number): number => curve(LIFT, k);
