// The heroes' hands: a sculpted palm with a thumb pad and knuckles, three-jointed fingers and thumb, a
// glove over the palm and first knuckles (the fingertips bare). A hand holding something wraps its
// fingers round the handle's actual radius, and the whole hand turns so the handle runs across the palm
// (`hold`), whatever angle the weapon is held at: the weapon itself stays where the animation puts it.
import * as THREE from 'three';
import { limb } from './shapes';
import { part, joint } from './rig';

export interface Digit { j: THREE.Group[]; len: number[] }
export interface Hand {
  /** the posed hand, a child of the rig's hand joint (turned into a grip by `hold`) */
  vis: THREE.Group;
  f: Digit[]; thumb: Digit;
  /** +1 the left hand, -1 the right */
  s: number;
}

/** a finger segment: a slightly tapered, rounded tube hanging down its joint */
const seg = (len: number, r0: number, r1: number) => limb(len - r1 * 0.8, r0, r1, 0.06, 0.45, 8);

/** the palm: a rounded box (a sphere pushed out towards its corners), thicker at the heel of the hand */
function palmGeo(): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 16, 12), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const q = (v: number) => Math.sign(v) * Math.abs(v) ** 0.55;
    const k = y < 0 ? 1 : 1 + 0.25 * y;   // the heel of the hand is thicker
    p.setXYZ(i, q(x) * 0.041, q(y) * 0.047, q(z) * 0.0155 * k);
  }
  g.computeVertexNormals();
  return g.translate(0, -0.055, 0);
}

/**
 * Build a hand on the rig's hand joint (forearm along -Y; the palm faces -Z, so a finger curls with +X
 * rotation; `s` +1 left, -1 right, the thumb on the inner side). `glove` covers the palm and first
 * knuckles, `skin` the rest; `k` scales it.
 */
export function buildHand(hand: THREE.Object3D, s: number, glove: THREE.Material, skin: THREE.Material, k = 1): Hand {
  const vis = joint(hand);
  vis.scale.setScalar(k);
  part(palmGeo(), glove, vis).castShadow = true;
  // the thumb's pad at the heel of the palm, and knuckles across its top
  part(new THREE.SphereGeometry(0.02, 10, 8).scale(1, 1.5, 0.9), glove, vis, -s * 0.024, -0.042, -0.009).castShadow = false;
  part(new THREE.CylinderGeometry(0.009, 0.009, 0.068, 8).rotateZ(Math.PI / 2), glove, vis, 0, -0.1, 0.002).castShadow = false;
  // index (next to the thumb) to little finger: x across the hand, how far down its knuckle sits, lengths
  const specs: [number, number, number[]][] = [[-0.028, -0.1, [0.043, 0.026, 0.021]], [-0.0095, -0.103, [0.047, 0.029, 0.022]], [0.0095, -0.1, [0.044, 0.027, 0.021]], [0.027, -0.093, [0.035, 0.021, 0.019]]];
  const f = specs.map(([x, y, len], i) => {
    const r = 0.0098 - i * 0.0006, js: THREE.Group[] = [];
    let at = joint(vis, s * x, y, 0.001);
    js.push(at);
    len.forEach((l, n) => {
      const m = part(seg(l, r * (1 - n * 0.1), r * (0.92 - n * 0.1)), n === 0 ? glove : skin, at);
      m.castShadow = false;
      if (n < 2) { at = joint(at, 0, -l, 0); js.push(at); }
    });
    return { j: js, len };
  });
  // the thumb: rooted low on the inner side of the palm, turned out across it
  const tj: THREE.Group[] = [], tl = [0.032, 0.028, 0.023];
  let at = joint(vis, -s * 0.034, -0.03, -0.006);
  tj.push(at);
  tl.forEach((l, n) => {
    part(seg(l, 0.0118 - n * 0.0012, 0.0105 - n * 0.0012), n === 0 ? glove : skin, at).castShadow = false;
    if (n < 2) { at = joint(at, 0, -l, 0); tj.push(at); }
  });
  return { vis, f, thumb: { j: tj, len: tl }, s };
}

/**
 * Pose an open or gesturing hand: `curl` bends every finger into the palm (0 flat, ~1.4 a fist),
 * `spread` fans them, `point` straightens the index and middle fingers (the other two stay curled),
 * `twitch` a tremor. Also lets go of anything held.
 */
export function poseHand(h: Hand, curl: number, spread: number, point = 0, t = 0, twitch = 0): void {
  h.vis.position.set(0, 0, 0); h.vis.quaternion.identity();
  const s = h.s;
  h.f.forEach((f, i) => {
    const c = (i < 2 ? curl * (1 - point) : curl + point * 1.1) * (0.9 + i * 0.07) + Math.sin(t * 23 + i * 1.7) * twitch;
    f.j[0].rotation.set(c * 0.8, 0, s * (i - 1.5) * spread * 0.3);
    f.j[1].rotation.set(c * 1.1, 0, 0);
    f.j[2].rotation.set(c * 0.75, 0, 0);
  });
  const tc = curl * 0.6 + point * 0.5;
  // the thumb swings across the palm as the hand closes
  h.thumb.j[0].rotation.set(0.25 + tc * 0.45, s * (0.3 + tc * 0.5), -s * (0.75 - spread * 0.45));
  h.thumb.j[1].rotation.set(tc * 0.5, 0, 0);
  h.thumb.j[2].rotation.set(tc * 0.6, 0, 0);
}

const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _c = new THREE.Vector3();

/**
 * Hold a handle of radius `r` running along `dir` through `origin` (world space): the hand turns so the
 * handle lies across its palm with the thumb towards +dir (the blade, the staff's head), and the fingers
 * and thumb wrap round it. Call after the arm is posed and the model's world matrices are up to date.
 */
export function hold(h: Hand, origin: THREE.Vector3, dir: THREE.Vector3, r: number): void {
  const hand = h.vis.parent!;
  hand.updateWorldMatrix(true, false);
  _o.copy(origin); hand.worldToLocal(_o);
  _q.setFromRotationMatrix(_m.extractRotation(hand.matrixWorld)).invert();
  _d.copy(dir).applyQuaternion(_q).normalize();
  const k = h.vis.scale.x;
  // across the palm: the handle, thumb end towards +dir (the thumb is on -s x)
  _x.copy(_d).multiplyScalar(-h.s);
  // up the hand (+y): back towards the wrist, square to the handle
  _y.copy(_o).negate().addScaledVector(_x, _o.dot(_x));
  if (_y.lengthSq() < 1e-8) _y.set(0, 1, 0);
  _y.normalize();
  _z.crossVectors(_x, _y);
  _m.makeBasis(_x, _y, _z);
  h.vis.quaternion.setFromRotationMatrix(_m);
  // the handle's centre in the unturned hand: across the finger roots, in front of the palm
  const R = r + 0.0165;
  _c.set(0, -0.098, -R).multiplyScalar(k).applyQuaternion(h.vis.quaternion);
  h.vis.position.copy(_o).sub(_c);
  // each finger wraps an arc of radius R + its own half-thickness round the handle
  const wrap = R + 0.009;
  h.f.forEach((f) => {
    f.j[0].rotation.set(f.len[0] / (2 * wrap) + 0.25, 0, 0);
    f.j[1].rotation.set((f.len[0] + f.len[1]) / (2 * wrap), 0, 0);
    f.j[2].rotation.set(Math.min(1.3, (f.len[1] + f.len[2]) / (2 * wrap)), 0, 0);
  });
  // the thumb closes over the fingers from the other side
  h.thumb.j[0].rotation.set(0.9, h.s * 1.0, -h.s * 0.35);
  h.thumb.j[1].rotation.set(0.55, 0, 0);
  h.thumb.j[2].rotation.set(0.5, 0, 0);
}
