// A healing draught's flask, and the move that drinks it: taken from the belt by the free hand, held by its neck,
// the round body under the fist and the mouth over the thumb, lifted to the lips by arm IK (the flask's mouth to a point at the mouth on
// the head), the head tipping back to drink, then put away. Shared by the heroes; each model hangs the flask on its
// free hand's joint, closes the fist round it (`holdFlask`) and puts a mouth point on its head.
import * as THREE from 'three';
import { reachArm, type Joints } from './rig';
import { curve, type Keys } from './motion';
import { hold, fistReach, seatHeld, type Hand } from './hands';
import type { MaterialKit } from '../../types';

const _t = new THREE.Vector3(), _f = new THREE.Vector3(), _m = new THREE.Vector3(), _w = new THREE.Vector3(), _d = new THREE.Vector3();
const _p = new THREE.Vector3(), _up = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
const _q = new THREE.Quaternion(), _r = new THREE.Quaternion();
const Y = new THREE.Vector3(0, 1, 0);

/** where a model drinks from (as a man drinks from a flask held by its neck, the owner's reference photographs: the bulb
 *  some 35 degrees below the lips at the first sip, some 40 up and forward of them as it's drunk): where the flask's base is from the mouth (the head's frame: x left, y up, z forward; m:
 *  its neck points from there at the lips), as it comes up and as it drinks, and where the elbow points (the chest's frame) */
export interface DrinkHold { wrist: THREE.Vector3; /** the base as it drinks: above and before the mouth, so the neck points down into the lips and the bottom is tipped up */ tipped: THREE.Vector3; pole: THREE.Vector3; /** where the elbow points as it drinks: up and forward, the upper arm about level (low, as at the sip, the forearm stood up before the face) */ tippedPole: THREE.Vector3 }

/** the neck's radius where the fist closes round it, and how far the flask's mouth is from there, up its length */
const NECK_R = 0.019, MOUTH_UP = 0.047;
/** how many times `drink` reaches for the flask's place, each from the forearm the last left */
const REACHES = 6;

/** where the flask's body's middle is from where the fist holds the neck, the glass's radius and the draught's (inside
 *  it), and how high the draught stands over the body's middle (m: three-quarters full) */
const BODY_Y = -0.085, GLASS_R = 0.05, DRAUGHT_R = 0.046, FILL = 0.024;
/** the bubbles in the draught, from its middle (m), and how big each is */
const BUBBLES: readonly (readonly [number, number, number, number])[] = [
  // (few and small: five, up to 8 mm across, read as polka dots)
  [0.014, -0.012, 0.008, 0.0024], [-0.012, 0.004, -0.012, 0.0018], [0.004, -0.026, 0.014, 0.002],
];

/** a round-bottomed glass flask, two-thirds full of a glowing red draught (its surface kept level by `holdFlask`, a
 *  hot core glowing through it, a few bubbles), its brass-wrapped neck lipped and collared in brass, a cork tied down
 *  with twine; its origin on the neck (where the fist holds it, as a flask is held), its mouth up its +y. Hung on the hand's joint: `holdFlask` seats it in the fist. (Held
 *  by its base, the body out past the fingers, no fist could close round it, and the hand turned to aim the neck at
 *  the lips drank with its palm out; held round its body, the fingers stood up beside the ball. A solid glowing ball,
 *  it read as a red light, not a potion.) */
export function buildFlask(kit: MaterialKit): THREE.Group {
  // (its own bright brass and a pale cork: in the heroes' own metal and leather, the neck read dark brown)
  const cap = kit.std({ color: 0xc8963c, metalness: 1, roughness: 0.32 });
  const stopper = kit.std({ color: 0xa47c52, roughness: 0.85 });
  const twine = kit.std({ color: 0xd2c29a, roughness: 0.9 });
  const g = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, y: number, to: THREE.Object3D = g) => {
    const o = new THREE.Mesh(geo, m);
    o.position.y = y;
    to.add(o);
    return o;
  };
  // the draught: the lower part of a ball to its level, a flat surface over it, in a group of its own about the body's
  // middle that `holdFlask` turns to keep that surface level as the flask tips
  const draught = new THREE.Group();
  draught.name = 'draught';
  draught.position.y = BODY_Y;
  g.add(draught);
  const top = Math.asin(FILL / DRAUGHT_R), steps = 12;
  const outline = Array.from({ length: steps + 1 }, (_, i) => {
    const a = -Math.PI / 2 + (top + Math.PI / 2) * i / steps;
    return new THREE.Vector2(DRAUGHT_R * Math.cos(a), DRAUGHT_R * Math.sin(a));
  });
  outline.push(new THREE.Vector2(0, FILL));
  // (solid: seen through, it went a pale salmon over the forest behind)
  const deep = kit.std({ color: 0x420006, emissive: 0x7a0008, emissiveIntensity: 0.45, roughness: 0.06 });
  add(new THREE.LatheGeometry(outline, 20), deep, 0, draught);
  // (its surface lit, as light pools under a liquid's skin; a hot core lit through it read as a ball in a ball)
  const skin = kit.glow(0xb0141a, 0.8, false);
  add(new THREE.CircleGeometry(Math.sqrt(DRAUGHT_R * DRAUGHT_R - FILL * FILL) * 0.98, 20).rotateX(-Math.PI / 2), skin, FILL + 0.0005, draught);
  const fizz = kit.glow(0xff6050, 1.2, false);
  for (const [x, y, z, r] of BUBBLES) add(new THREE.SphereGeometry(r, 6, 4), fizz, y, draught).position.set(x, y, z);
  // the glass round it: a dark tint carrying its highlights, the draught seen through it (pale, it laid a milky
  // white over the draught, which read pink)
  const glass = kit.phys({ color: 0x000000, roughness: 0.04, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, transparent: true, opacity: 0.3, depthWrite: false });
  add(new THREE.SphereGeometry(GLASS_R, 24, 16), glass, BODY_Y).renderOrder = 1;
  // the neck, wrapped in brass where the fist holds it, a little longer than the fist so it shows between the thumb
  // and the lips (as long as the fist, the fist covered the mouth), collared where it leaves the body and lipped at
  // its mouth
  add(new THREE.CylinderGeometry(0.016, 0.021, 0.085, 14), cap, 0.0025);
  add(new THREE.TorusGeometry(0.022, 0.0035, 6, 18).rotateX(Math.PI / 2), cap, -0.036);
  add(new THREE.TorusGeometry(0.0172, 0.003, 6, 18).rotateX(Math.PI / 2), cap, 0.044);
  // the cork, and the twine tying it down over its top: off while it's drunk (`holdFlask`)
  const cork = new THREE.Group();
  cork.name = 'cork';
  g.add(cork);
  add(new THREE.CylinderGeometry(0.0145, 0.0125, 0.024, 10), stopper, 0.055, cork);
  add(new THREE.TorusGeometry(0.0128, 0.0016, 4, 14).rotateX(Math.PI / 2), twine, 0.049, cork);
  for (const a of [0, Math.PI / 2]) add(new THREE.TorusGeometry(0.0145, 0.0012, 4, 12, Math.PI).rotateY(a), twine, 0.055, cork);
  g.userData.aim = new THREE.Vector3();
  g.userData.lift = 0;
  g.userData.wrist = new THREE.Vector3();
  g.userData.grip = new THREE.Vector3();
  g.userData.up = new THREE.Vector3();
  g.userData.draught = draught;
  // (the flask's mouth, which `drink` puts at the lips: the lab measures how far off them it lands)
  const lip = new THREE.Object3D();
  lip.name = 'flaskLip';
  lip.position.y = MOUTH_UP;
  g.add(lip);
  g.userData.cork = cork;
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
/** the flask tipped up, drinking (a sip at the lips before it: tipped as it reached them, it came up level) */
const TIP: Keys = [[0, 0], [0.36, 0], [0.45, 1], [0.54, 1], [0.66, 0]];
/** the flask out of the pouch */
const OUT: Keys = [[0, 0], [0.13, 0], [0.18, 1], [0.81, 1], [0.86, 0]];

/**
 * The drinking move on the left arm (`k` 0..1 of the cast) over the pose so far: the hand to the left hip (to
 * hang a weapon there and take the flask from the pouch), up to the lips, the head tipping back as it drinks,
 * down to the hip again (the flask stowed, a weapon drawn). `mouth` is a point just before the lips on the head,
 * `h` the hand that holds `flask`. Returns how far the flask is out (0..1) for the model to show it.
 */
export function drink(j: Joints, k: number, mouth: THREE.Object3D, how: DrinkHold, h: Hand, flask: THREE.Object3D): number {
  const hip = curve(HIP, k), e = curve(LIFT, k), tip = curve(TIP, k);
  // to the belt on the left hip
  j.shoulderL.rotation.x += 0.35 * hip; j.shoulderL.rotation.z += 0.12 * hip; j.elbowL.rotation.x += -0.6 * hip;
  // the head and shoulders tip back as it drinks
  j.neck.rotation.x += -0.3 * tip; j.head.rotation.x += -0.2 * tip; j.spine.rotation.x += -0.08 * tip;
  flask.userData.lift = e;
  if (e > 0) {
    const sc = j.root.scale.x;
    j.root.updateMatrixWorld(true);
    // the flask's base where the model holds it from (`how`), below the lips as it comes up and over them as it
    // drinks, its neck pointing from there at the lips and its mouth on them
    mouth.getWorldPosition(_m);
    j.head.getWorldQuaternion(_q);
    _w.lerpVectors(how.wrist, how.tipped, tip);
    _f.copy(_w).negate().applyQuaternion(_q).normalize();
    (flask.userData.aim as THREE.Vector3).copy(_f);
    _t.copy(_m).addScaledVector(_f, -MOUTH_UP * sc);
    // the wrist where the fist round the flask's neck has it there: the hand's length along the forearm, first
    // taken as the line to the shoulder, then as the arm that reaches lies, again till it settles (the neck running
    // near the forearm's line at the sip, the fist's turn round it swings far for a small change in the forearm: from
    // the arm two reaches back, the fist closed 13 cm off the lips)
    j.shoulderL.getWorldPosition(_a);
    _up.copy(_a).sub(_t).normalize();
    _r.copy(j.shoulderL.quaternion);
    const e0 = j.elbowL.rotation.x;
    for (let pass = 0; pass < REACHES; pass++) {
      fistReach(h, _f, _up, NECK_R, _d);
      _w.copy(_t).sub(_d);
      // (where it wants the wrist and the grip, world: the lab reads how far from them they land)
      (flask.userData.wrist as THREE.Vector3).copy(_w);
      (flask.userData.grip as THREE.Vector3).copy(_t);
      (flask.userData.up as THREE.Vector3).copy(_up);
      j.chest.worldToLocal(_w);
      reachArm(j.shoulderL, j.elbowL, j.P.upperL, j.P.foreL, _w, _p.lerpVectors(how.pole, how.tippedPole, tip));
      j.root.updateMatrixWorld(true);
      j.elbowL.getWorldPosition(_a);
      j.handL.getWorldPosition(_b);
      _up.copy(_a).sub(_b).normalize();
    }
    // (blended from the pose's own turn: the IK's is copied first, slerp would read the one it writes)
    _q.copy(j.shoulderL.quaternion);
    j.shoulderL.quaternion.copy(_r).slerp(_q, e);
    j.elbowL.rotation.x = e0 + (j.elbowL.rotation.x - e0) * e;
  }
  return curve(OUT, k);
}

/**
 * The fist closed round the flask's neck (`out` how far it's out, its scale): its neck out over the thumb, aimed at the
 * lips as far as the drink has lifted it there, else across the fist as the hand closes naturally. Call while the
 * flask is out, after the arm is posed, in place of the hand's own pose.
 */
export function holdFlask(h: Hand, flask: THREE.Object3D, out: number): void {
  const joint = h.vis.parent!;
  joint.updateWorldMatrix(true, false);
  joint.getWorldQuaternion(_q);
  // (the fist's own way, a handle across the palm with the thumb towards it, turned halfway to the neck up: carried
  // across the fist alone, it lay flat, its neck pointing aside)
  _d.set(-h.s, 0, 0).applyQuaternion(_q).add(Y).normalize();
  const lift = flask.userData.lift as number;
  if (lift > 0) _d.lerp(flask.userData.aim as THREE.Vector3, lift).normalize();
  const r = NECK_R * out;
  // (the hand's length along the forearm as `drink` placed the wrist for it, the line it planned with while it lifts
  // the flask: with the neck near the forearm's line at the sip, the few millimetres the body's fitting moves the arm
  // after it swung the fist round the neck 13 cm off the lips; along the hand's joint, which the pose may have bent
  // at the wrist, the fist closed a hand's width off)
  if (lift > 0) _a.copy(flask.userData.up as THREE.Vector3);
  else _a.subVectors(joint.parent!.getWorldPosition(_a), joint.getWorldPosition(_b));
  hold(h, _d, r, _a);
  seatHeld(h, flask, r);
  flask.quaternion.setFromUnitVectors(Y, _d.applyQuaternion(_q.invert()));
  // (the draught's surface level, however the flask is tipped: the draught turned back from the flask's own turn)
  flask.updateWorldMatrix(true, false);
  (flask.userData.draught as THREE.Object3D).quaternion.copy(flask.getWorldQuaternion(_q).invert());
  // (the cork out as it reaches the lips: drunk through, it read as a stoppered bottle pressed to the mouth)
  (flask.userData.cork as THREE.Object3D).visible = lift < 0.6;
  // (a drink not posed this frame leaves the flask the fist's own way)
  flask.userData.lift = 0;
}

/** how far the flask is up at the lips (0..1) at `k`: a model eases what it moves out of the way by it */
export const drinkUp = (k: number): number => curve(LIFT, k);
