// The heroes' hands: a sculpted palm with a thumb pad and knuckles, three-jointed fingers and thumb, a
// glove over the palm and first knuckles (the fingertips bare), or bare (`bare`: no hands item worn). A hand holding something stays on its
// wrist and turns so the handle runs across the palm, the weapon seated in it (`seat`), whatever angle
// it is held at, and wraps its fingers round the handle's actual radius (`hold`).
import * as THREE from 'three';
import { limb } from './shapes';
import { part, joint } from './rig';
import { clamp } from '../../util';

export interface Digit { j: THREE.Group[]; len: number[]; /** its radius */ r: number }
export interface Hand {
  /** the posed hand, a child of the rig's hand joint (turned into a grip by `hold`) */
  vis: THREE.Group;
  f: Digit[]; thumb: Digit;
  /** +1 the left hand, -1 the right */
  s: number;
  /** its pieces, each with the material it was built in (`bare` swaps them) */
  parts: THREE.Mesh[];
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
  const vis = joint(hand), parts: THREE.Mesh[] = [];
  vis.scale.setScalar(k);
  const P = (g: THREE.BufferGeometry, m: THREE.Material, at: THREE.Object3D, x = 0, y = 0, z = 0) => { const p = part(g, m, at, x, y, z); p.userData.own = m; parts.push(p); return p; };
  P(palmGeo(), glove, vis).castShadow = true;
  // the thumb's pad at the heel of the palm, and knuckles across its top
  P(new THREE.SphereGeometry(0.02, 10, 8).scale(1, 1.5, 0.9), glove, vis, -s * 0.024, -0.042, -0.009).castShadow = false;
  P(new THREE.CylinderGeometry(0.009, 0.009, 0.068, 8).rotateZ(Math.PI / 2), glove, vis, 0, -0.1, 0.002).castShadow = false;
  // index (next to the thumb) to little finger: x across the hand, how far down its knuckle sits, lengths
  const specs: [number, number, number[]][] = [[-0.028, -0.1, [0.043, 0.026, 0.021]], [-0.0095, -0.103, [0.047, 0.029, 0.022]], [0.0095, -0.1, [0.044, 0.027, 0.021]], [0.027, -0.093, [0.035, 0.021, 0.019]]];
  const f = specs.map(([x, y, len], i) => {
    const r = 0.0098 - i * 0.0006, js: THREE.Group[] = [];
    let at = joint(vis, s * x, y, 0.001);
    js.push(at);
    len.forEach((l, n) => {
      const m = P(seg(l, r * (1 - n * 0.1), r * (0.92 - n * 0.1)), n === 0 ? glove : skin, at);
      m.castShadow = false;
      if (n < 2) { at = joint(at, 0, -l, 0); js.push(at); }
    });
    return { j: js, len, r };
  });
  // the thumb: rooted low on the inner side of the palm, turned out across it
  const tj: THREE.Group[] = [], tl = [0.032, 0.028, 0.023];
  let at = joint(vis, -s * 0.034, -0.03, -0.006);
  tj.push(at);
  tl.forEach((l, n) => {
    P(seg(l, 0.0118 - n * 0.0012, 0.0105 - n * 0.0012), n === 0 ? glove : skin, at).castShadow = false;
    if (n < 2) { at = joint(at, 0, -l, 0); tj.push(at); }
  });
  return { vis, f, thumb: { j: tj, len: tl, r: 0.0118 }, s, parts };
}

/** the hand bare, every piece in `skin` (no glove: no hands item worn), or back in its glove with `null` */
export function bare(h: Hand, skin: THREE.Material | null): void {
  for (const p of h.parts) p.material = skin ?? (p.userData.own as THREE.Material);
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

const _d = new THREE.Vector3(), _u = new THREE.Vector3(), _s = new THREE.Vector3(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
/** where a held handle's axis runs across the hand (its own space): against the lower palm and the knuckles */
const GRIP_Y = -0.092, GRIP_GAP = 0.011;
/** how far a finger joint bends at most */
const BEND = 1.65;
/** the thumb wraps a little clear of the handle, over the fingers' ends */
const THUMB_OVER = 0.006;

/**
 * Curl a digit round a handle running across the hand (along x) through (cy, cz) in the hand's space,
 * its centre-line on a circle of radius `rho`: each segment bends just enough for its end to land on
 * the circle, so it hugs the handle however thick that is. The fingers curl one way round from the
 * knuckles (`sense` 1); the thumb (-1) comes the other way, over the top from its root, which turns freely.
 */
function wrap(f: Digit, cy: number, cz: number, rho: number, sense = 1): void {
  let py = f.j[0].position.y, pz = f.j[0].position.z, phi = 0;   // phi: the curl so far (0 hangs down -y)
  for (let n = 0; n < 3; n++) {
    const l = f.len[n], wy = py - cy, wz = pz - cz, M = Math.max(1e-6, Math.hypot(wy, wz));
    // the segment's direction (-cos φ, -sin φ) points at the handle's axis at φ0; its end lands on the
    // circle at φ0 ∓ acos(K / M), and the one short of φ0 keeps it outside the handle. A segment too
    // short to reach the circle runs along the tangent to it, so the next can go on round.
    let a0 = Math.atan2(wz, wy) - phi;
    a0 -= Math.round(a0 / (2 * Math.PI)) * 2 * Math.PI;
    const K = (M * M + l * l - rho * rho) / (2 * l);
    const off = l * l < M * M - rho * rho ? Math.asin(clamp(rho / M, -1, 1)) : Math.acos(clamp(K / M, -1, 1));
    const to = a0 - sense * off;
    // (turned round its length, the thumb's joints bend it the other way)
    if (sense < 0 && n === 0) { phi = to; f.j[0].rotation.set(phi, Math.PI, 0); }
    else { const bend = clamp(sense * to, 0, BEND); f.j[n].rotation.set(bend, 0, 0); phi += sense * bend; }
    py -= l * Math.cos(phi); pz -= l * Math.sin(phi);
  }
}

/**
 * The fist's turn for a handle along `d` (normalized): the handle runs across the palm with the thumb
 * towards +d (the blade, the staff's head), and the hand's length keeps to `up` (towards the wrist) as
 * far as that allows, the wrist bending only as the handle needs. `d` and `up` in one space, the turn in it.
 */
function fist(h: Hand, d: THREE.Vector3, up: THREE.Vector3, out: THREE.Quaternion): THREE.Quaternion {
  // across the palm: the handle (the thumb is on -s x); up the hand (+y): `up`, square to the handle
  _x.copy(d).multiplyScalar(-h.s);
  _y.copy(up).addScaledVector(_x, -_x.dot(up));
  if (_y.lengthSq() < 1e-6) _y.set(0, 0, 1).addScaledVector(_x, -_x.z);
  _y.normalize();
  _z.crossVectors(_x, _y);
  return out.setFromRotationMatrix(_m.makeBasis(_x, _y, _z));
}

/** where the handle's axis runs through that fist, from its wrist (unscaled: the hand joint's own units) */
function fistAxis(h: Hand, q: THREE.Quaternion, r: number, out: THREE.Vector3): THREE.Vector3 {
  const k = h.vis.scale.x;
  return out.set(0, GRIP_Y, -(r / k + GRIP_GAP)).multiplyScalar(k).applyQuaternion(q);
}

/**
 * Seat a held thing in the fist: `grip` (a child of the hand's joint, turned so its +Y runs along the
 * handle, its origin where the hand holds it) moves so the handle runs through the palm of the hand on
 * the wrist, its length along the forearm. Call whenever the grip's turn changes.
 */
export function seat(h: Hand, grip: THREE.Object3D, r: number): void {
  fistAxis(h, fist(h, _d.set(0, 1, 0).applyQuaternion(grip.quaternion), _u.set(0, 1, 0), _q), r, grip.position);
}

/**
 * For a hand reaching a grip it doesn't carry (a two-hander's lower grip): from its wrist to where a
 * handle of radius `r` along `dir` runs through the fist, the hand's length along `up` (world, towards
 * the wrist; the line from the grip to the shoulder, say). Put the wrist there and `hold` with the same `up`.
 */
export function fistReach(h: Hand, dir: THREE.Vector3, up: THREE.Vector3, r: number, out: THREE.Vector3): THREE.Vector3 {
  const hand = h.vis.parent!;
  hand.updateWorldMatrix(true, false);
  return fistAxis(h, fist(h, _d.copy(dir).normalize(), _u.copy(up).normalize(), _q), r, out).multiplyScalar(_s.setFromMatrixScale(hand.matrixWorld).x);
}

/**
 * Close the hand round a handle of radius `r` running along `dir` (world): the hand stays on its wrist and
 * turns so the handle lies across its palm (where `seat` or `fistReach` put it), its length along the
 * forearm (or `up`, world), and the fingers and thumb wrap round it. Call after the arm is posed and the
 * model's world matrices are up to date.
 */
export function hold(h: Hand, dir: THREE.Vector3, r: number, up?: THREE.Vector3): void {
  const hand = h.vis.parent!;
  hand.updateWorldMatrix(true, false);
  _q2.setFromRotationMatrix(_m.extractRotation(hand.matrixWorld));
  if (up) _u.copy(up).normalize(); else _u.set(0, 1, 0).applyQuaternion(_q2);
  fist(h, _d.copy(dir).normalize(), _u, _q);
  h.vis.position.set(0, 0, 0);
  h.vis.quaternion.copy(_q2.invert()).multiply(_q);
  // (the handle's radius in the hand's own units, which its scale `k` scales)
  const rh = r / h.vis.scale.x, cz = -(rh + GRIP_GAP);
  // the fingers close snugly round it
  for (const f of h.f) wrap(f, GRIP_Y, cz, rh + f.r);
  // the thumb closes over them from the other side
  wrap(h.thumb, GRIP_Y, cz, rh + h.thumb.r + THUMB_OVER, -1);
}
