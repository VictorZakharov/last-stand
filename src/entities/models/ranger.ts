// A woodland archer in a fitted green trailcoat, leather bracers and boots, with a recurved bow (models/bow.ts). His shot
// is an archer's, every joint within a body's ranges (armIK.ts): the string taken with the bow brought in before the
// chest, then the bow up and the string back, side-on to the target with his head turned to it, the bow arm straight
// along the arrow's line and the string drawn to an anchor at the side of his jaw, the draw elbow round behind his head,
// so his draw length is what his own arms reach. Loosed, the draw hand follows through out from the neck and the bow
// tips forward in the loose fist; then the hand takes the next arrow from the quiver over his right shoulder and nocks
// it. Between shots he carries the bow in his fist at his side, an arrow nocked, his draw hand free; a fan of arrows is
// shot with the bow laid over flat, the arrows lying across its top.
import * as THREE from 'three';
import { createKit } from '../../core/materials';
import { leather, oiled, wool as woolMaps, felt as feltMaps, wood, pbrMaterialMaps } from '../../core/textures';
import { buildHumanoid, joint, part, resetPose, walkCycle, idle, deathFall, groundFeet } from './rig';
import { Sculpt, stripRig, limb, lathe } from './shapes';
import { belt, buckle, strap, plate, edgeTube, taperTube, stitches, Skirt } from './armor';
import { onTunic, tunicFront, tunicBack, TUNIC_Y, WAIST } from './tunic';
import { buildHead, buildNeck, toGroup, handSkin, HEAD_MM, type Head } from './head';
import { EYE } from './face';
import { buildHand, hold, fistReach, fistTurn, SLANT, type Hand } from './hands';
import { LegIK } from './ik';
import { fitArm, solveArm } from './armIK';
import { bodyShape } from './anatomy';
import { buildFlask, drink } from './flask';
import { buildBoot } from './boot';
import { Bow, pullAt, arrowGeometry, ARROW, REST_Y } from './bow';
import { fromEyes, dirFromEyes } from '../viewModel';
import { angleDamp, clamp, damp, lerp, smooth, TAU } from '../../util';
import type { AnimState, Model } from '../../types';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
/** the felt hat (the face's mm, from his reference sheet): the band's foot and top over the eyes, the crown's top over
 *  them, how far the crown stands off the skull at the band (the hair under it), the brim's width and how far its edge is
 *  turned down, each at the front, the sides and the back, and the leather's thickness */
const HAT = { band: [30, 57], top: 155, gap: 20, brim: [60, 46, 40], droop: [14, 6, 6], thick: 5 };
/** the coat's belt on the spine (m): belted high, at the lower ribs */
const BELT_Y = 0.12;
/** how much higher the collar stands at the back than in front (m) */
const COLLAR_RISE = 0.02;
const UP = V(0, 1, 0), FWD = V(0, 0, 1);
const DRINK = { wrist: V(0.03, -0.08, 0.22), tipped: V(0.03, 0.1, 0.2), pole: V(-0.8, 0.2, -0.2) };
/** where the nock comes to at full draw (the head's mm): at the side of the jaw, below and in front of the ear, the string
 *  a finger's width off the face, so the arrow and its fletching lie beside the cheek and the beard (on the jaw's skin, the
 *  arrow's last 9 cm went through them), and the string's lower half passes in front of the coat over the bow shoulder
 *  (1.2 cm nearer the face, it ran 6 to 8 cm through it at every full draw). (Under the corner of the mouth no arm could
 *  reach it as an archer's does: the only one within a body's ranges folded forward across the chest, and reaching it
 *  with the elbow behind put the hand through the head) */
const ANCHOR = toGroup(-92, 10, 10);
/** how far round the body turns side-on to the target (rad), the share of it the hips take standing, and moving */
const SIDE = 1.35, HIP_SIDE = 0.68, HIP_SIDE_MOVING = 0.2;
/** when the draw hand sets off for the string and when it has it, of the body's way onto the shot (as the bow comes in
 *  before the chest: sooner, it reached across for the bow still at the hip) */
const TAKE = [0.25, 0.72];
/** of the body's way onto the shot, when the bow has come in from the side */
const BOW_IN = 0.7;
/** how far the chest is open from side-on as the draw starts (rad), closing as the string comes back */
const OPEN = 0.5;
/** the bow's cant at full draw (rad: its top tipped over to the right): a little to the left, its string's lower half
 *  swung out off the chest and its upper half kept off the face (tipped right, the lower half came back into the coat at
 *  the bow shoulder; further left, the upper half met the cheek); a fan is shot with it laid flat, its top to the left
 *  (the forearm turned palm down: tipped to the right it turned palm up, past its range) */
const CANT = -0.06, FLAT = -Math.PI / 2;
/** how far out from the face the fan's anchor is (m): its string lies across the face, its near half in front of the jaw
 *  and the beard (1.5 cm out, it went 5 cm into them) */
const FAN_OUT = 0.04;
/** carried at the side, the elbow bent `CARRY_BEND`: the bow's top tipped forward of the line up the forearm, as a hanging
 *  fist holds a grip (across the palm it lies square to the forearm; upright, the wrist bent 64 degrees towards the
 *  thumb, three times its range), and out (rad), clear of the arm and the leg */
const CARRY_TILT = 1.1, CARRY_OUT = 0.17, CARRY_BEND = 0.5;
/** how far out to the side the bow swings between the carry and the shot (m) */
const CARRY_SWING = 0.16;
/** the share of the draw, from when the hand has the string, over which the bow comes up onto the line (so a tap's is on it) */
const RAISE = 0.35;
/** after the release (0..1 of what follows it): the follow-through ends (a quick recoil), the next arrow is nocked; the
 *  hand's way between (to the quiver, the arrow drawn out of it and over the shoulder) is timed by its length, so it
 *  goes at an even pace; and when it takes the arrow and lays it on the string, by that */
const FOLLOW = 0.12, NOCKED = 0.92;
/** the riser's grip in the bow's frame, and its radius */
const GRIP = V(0, -0.012, 0.003), GRIP_R = 0.022;
/** the bow arm's reach at full draw, of its length: nearly straight (a locked elbow is no archer's) */
const REACH = 0.99;
/** where the draw elbow would rather be: in line behind the hand along the arrow, this far above it (m), so in front of
 *  the shoulder as the draw starts and round behind the head, at about the eyes' height, at full draw (the solver keeps
 *  it within a body's ranges and out of the head, armIK.ts). (Sent one way, out and up, the elbow stood straight up over
 *  the shoulder while the string was still out in front, and the forearm hung down from it through the head) */
const ELBOW_UP = 0;
/** how much the draw arm's elbow keeps to where it's sent (armIK.ts `keep`: degrees of the ranges; under the 1 a cm it
 *  costs to move it, it stayed where it was until that went out of range, then jumped round) */
const DRAW_KEEP = 150;
/** how far the hand hooked on the string is rolled about the arrow at full draw, and how much more or less it may (rad):
 *  in line behind the arrow at its height, the elbow needs 57 degrees (rolled up to 34, every elbow in line left the
 *  forearm's turn 6 to 10 degrees past its end) */
const HOOK_TILT = -1, HOOK_ROLL = 0;
/** how fast the draw elbow may move as the string is drawn (the rig's units a second): round into the anchor it swings,
 *  not jumps (only then: the reload is quicker) */
const ELBOW_V = 3;
/** where the draw elbow goes with the string taken before the chest (the chest's frame): out to the right, a little up
 *  and forward */
const SET_POLE = V(-1, 0.15, 0.2).normalize();
/** how far in front of the chest the draw hand's way to the string bows out, at its middle (m) */
const BOW_OUT = 0.22;
/** where the next arrow is nocked (the chest's frame): before the chest, a little left of its middle, out far enough that
 *  the string behind the bow stays in front of the coat */
const NOCK_AT = V(0.06, 0.28, 0.42);
/** the bow there: its arrow tipped down (rad) and its top canted over to the right (rad), so its limbs keep off the body
 *  (tipped further down, the top limb leant back into the chest; canted 0.85, side-on to the shot as the body is, the
 *  lower limb and the string swung back through the coat's left side at every shot, half the frames of a run of taps) */
const SET_TIP = [0.25, 0.1];
/** where the hand brings the next arrow over the right shoulder (the chest's frame, from the shoulder at rest): above it
 *  and in front, on its way down to the string */
const OVER = V(0.02, 0.14, 0.26);
/** where the hand passes over the right shoulder on its way back to the quiver (the chest's frame, from the shoulder at rest):
 *  out past the hat's brim (by the shoulder, it went through the brim's back) */
const LIFT = V(-0.07, 0.22, -0.04);
/** how long the body takes to come round onto a shot and back off it (s) */
const AIM_IN = 0.3, AIM_OUT = 0.5;
/** how far the arrow's line may lie off the way the body faces (rad: the shot from the bow beside the body closing on a near
 *  target); a new target turns the body, and the line with it */
const YAW_OFF = 0.15;
/** first person (the eyes' frame: x right, y up, -z ahead, m): the bow's grip ahead at full draw, left of and below the
 *  view's middle; the nock at full draw, under the view's lower right; between shots the bow low on the left, its arrow
 *  pointing ahead and down; and the hand's way for the next arrow, down out of the view and back (the quiver is behind
 *  the eyes: reaching for it, the arm swept across the view) */
const FP_GRIP = V(-0.3, -0.2, -0.62), FP_ANCHOR = V(0.1, -0.2, -0.06), FP_REST = V(-0.3, -0.42, -0.5), FP_REST_DIR = V(0.15, -0.45, -1);
const FP_LOW = V(0.24, -0.6, -0.05), FP_UP = V(0.16, -0.45, -0.3);
/** how far the string has come back (0..1) after `k` of the draw from when the hand has it: setting off gently and
 *  slowing into the anchor (the bow's own `pullAt`, quick at first, brought half the string back in a few frames) */
const drawnAt = (k: number): number => (pullAt(k) + smooth(clamp(k, 0, 1))) / 2;

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3();
const _u = new THREE.Vector3(), _left = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _x = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _s = new THREE.Vector3();
const _ra = new THREE.Vector3(), _gq = new THREE.Quaternion(), _rx = new THREE.Vector3(), _qt = new THREE.Quaternion();
/** the right hand's turn on its forearm as it hangs (the forearm turned neither over nor back: the thumb up) */
const HANG_R = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2);

/** a pose of the bow in the world: its grip's pivot and its frame */
interface BowPose { p: THREE.Vector3; q: THREE.Quaternion }
const pose = (): BowPose => ({ p: new THREE.Vector3(), q: new THREE.Quaternion() });
/** the bow's frame with its back along `z` and its limbs up, canted `cant` over to the right */
function frame(z: THREE.Vector3, cant: number, out: THREE.Quaternion): THREE.Quaternion {
  _left.crossVectors(UP, z).normalize();
  _y.crossVectors(z, _left).normalize().multiplyScalar(Math.cos(cant)).addScaledVector(_left, -Math.sin(cant)).normalize();
  _x.crossVectors(_y, z).normalize();
  return out.setFromRotationMatrix(_m.makeBasis(_x, _y, _z.copy(z)));
}

/** the draw hand's fingers: index, middle and ring hooked round the string at their last joints, the little finger and the
 *  thumb tucked under (`k` 1), or relaxed open (0); `pinch` closes the thumb on the index, holding an arrow by its nock */
function hook(h: Hand, k: number, pinch: number): void {
  h.vis.position.set(0, 0, 0); h.vis.quaternion.identity();
  const s = h.s;
  h.f.forEach((f, i) => {
    const tuck = i === 3 ? 1 : 0, p = i === 0 ? pinch : 0;
    f.j[0].rotation.set(lerp(0.25, lerp(0.22, 1.2, tuck), k) + p * 0.35, 0, s * (i - 1.5) * 0.04);
    f.j[1].rotation.set(lerp(0.35, lerp(1.3, 1.4, tuck), k) + p * 0.3, 0, 0);
    f.j[2].rotation.set(lerp(0.25, lerp(0.6, 0.9, tuck), k), 0, 0);
  });
  h.thumb.j[0].rotation.set(lerp(0.35, 0.7, k) + pinch * 0.2, s * lerp(0.35, 0.75, Math.max(k, pinch)), -s * lerp(0.6, 0.25, k));
  h.thumb.j[1].rotation.set(lerp(0.2, 0.45, k), 0, 0);
  h.thumb.j[2].rotation.set(lerp(0.2, 0.4, k), 0, 0);
}

/** a point on a Catmull-Rom curve through `pts` reached at the times `ts` (0..1, rising), at `t` */
function through(pts: THREE.Vector3[], ts: number[], t: number, out: THREE.Vector3): THREE.Vector3 {
  let i = 0;
  while (i < ts.length - 2 && t > ts[i + 1]) i++;
  const f = clamp((t - ts[i]) / (ts[i + 1] - ts[i]), 0, 1), p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
  const f2 = f * f, f3 = f2 * f;
  return out.set(0, 0, 0).addScaledVector(p0, -0.5 * f3 + f2 - 0.5 * f).addScaledVector(p1, 1.5 * f3 - 2.5 * f2 + 1)
    .addScaledVector(p2, -1.5 * f3 + 2 * f2 + 0.5 * f).addScaledVector(p3, 0.5 * f3 - 0.5 * f2);
}

/** The felt hat on `cap` (the head group's frame): a crown rising from a leather band round the head, its sides near
 *  upright and its top a dome, and a wide leather brim turned down to a stitched edge. The hair stays on under it and shows
 *  below the band, as short hair does. */
function buildHat(head: Head, cap: THREE.Object3D, felt: THREE.Material, leather: THREE.Material, edge: THREE.Material): void {
  const N = 48, yB = toGroup(0, EYE.y + HAT.band[0], 0).y, mm = HEAD_MM;
  // the skull's section at the band's foot (each way round, the ray's elevation that meets it found by bisection)
  let x0 = 1, x1 = -1, z0 = 1, z1 = -1;
  for (let i = 0; i < N; i++) {
    let lo = -0.5, hi = 1.4;
    for (let k = 0; k < 20; k++) { const m = (lo + hi) / 2; if (head.surface(i / N * TAU, m).y < yB) lo = m; else hi = m; }
    const q = head.surface(i / N * TAU, lo);
    x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); z0 = Math.min(z0, q.z); z1 = Math.max(z1, q.z);
  }
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, A = (x1 - x0) / 2 + HAT.gap * mm, B = (z1 - z0) / 2 + HAT.gap * mm, H = (HAT.top - HAT.band[0]) * mm;
  /** round the crown's foot towards `a` (0 the front, +x the left), `k` its share of the way out (a superellipse, squarer
   *  than an ellipse, as a felt crown is) */
  const foot = (a: number, k: number, out: THREE.Vector3) => { const s = Math.sin(a), c = Math.cos(a); return out.set(cx + Math.sign(s) * Math.abs(s) ** 0.85 * A * k, yB, cz + Math.sign(c) * Math.abs(c) ** 0.85 * B * k); };
  // (a superellipse's quarter up the crown: its sides rise near upright from the band, its top a full dome)
  const crown = (u: number, v: number, out: THREE.Vector3) => { const f = v * Math.PI / 2; foot(u * TAU + Math.PI, Math.cos(f) ** (2 / 2.6), out); out.y = yB + H * Math.sin(f) ** (2 / 2.6); return out; };
  const inside = new THREE.Vector3(cx, yB + H * 0.4, cz);
  part(plate(crown, N, 14, 0, undefined, inside), felt, cap);
  const band = (u: number, v: number, out: THREE.Vector3) => { foot(u * TAU + Math.PI, 1.03, out); out.y = yB + v * (HAT.band[1] - HAT.band[0]) * mm; return out; };
  part(plate(band, N, 2, 0.003, undefined, inside), leather, cap);
  // the brim: out from the band's foot, widest in front, turned down most at the back (the ends blended through the sides)
  const by3 = (v3: number[], a: number) => { const c = Math.cos(a); return c >= 0 ? lerp(v3[1], v3[0], c) : lerp(v3[1], v3[2], -c); };
  const _f = new THREE.Vector3();
  const brim = (u: number, v: number, out: THREE.Vector3) => {
    // (u from the back: its seam behind)
    const a = u * TAU + Math.PI; foot(a, 1.02, out); _f.set(out.x - cx, 0, out.z - cz).normalize();
    out.addScaledVector(_f, by3(HAT.brim, a) * mm * v); out.y = yB - by3(HAT.droop, a) * mm * v ** 1.6; return out;
  };
  part(plate(brim, N, 5, HAT.thick * mm, undefined, new THREE.Vector3(cx, yB + 0.2, cz)), leather, cap);
  part(edgeTube(brim, 'v1', 2.6 * mm, N), edge, cap);
}

export function buildRanger(): Model {
  const kit = createKit(0xc9d993);
  // (the colours his reference sheet's, measured in a studio render against it)
  const coat = kit.rim({ color: 0x5a654c, roughness: 1, ...pbrMaterialMaps(woolMaps(), 1) }, 0x71835a, 0.25);
  // (the coat's hem turned up inside it, a shade darker)
  const coatHem = kit.rim({ color: 0x4c5641, roughness: 1, ...pbrMaterialMaps(woolMaps(), 1) }, 0x71835a, 0.25);
  const felt = kit.rim({ color: 0x4a5a40, roughness: 1, ...pbrMaterialMaps(feltMaps(), 1) }, 0x71835a, 0.2);
  const wool = kit.std({ color: 0x656151, roughness: 1, ...pbrMaterialMaps(woolMaps(), 1) });
  const dark = kit.std({ color: 0x292d24, roughness: 1, ...pbrMaterialMaps(woolMaps(), 1) });
  // (the coat's seams sewn in a lighter thread, as the sheet's are)
  const thread = kit.std({ color: 0x9a8a5c, roughness: 0.9 });
  const hide = kit.std({ color: 0x936848, roughness: 1, ...pbrMaterialMaps(leather(), 1) });
  const boot = kit.std({ color: 0x93684a, roughness: 1, ...pbrMaterialMaps(oiled(), 1) });
  const strapLeather = kit.std({ color: 0x6e4a33, roughness: 1, ...pbrMaterialMaps(oiled(), 2) });
  const soleLeather = kit.std({ color: 0x2e2219, roughness: 1, ...pbrMaterialMaps(oiled(), 2) });
  const bowWood = kit.std({ color: 0x956f3d, roughness: 0.85, ...pbrMaterialMaps(wood(), 1) });
  const limbWood = kit.std({ color: 0x5a3c22, roughness: 0.7, ...pbrMaterialMaps(wood(), 1) });
  const brass = kit.std({ color: 0xa58a50, metalness: 0.8, roughness: 0.65 });
  const skin = handSkin(kit, 'ranger');
  const cord = kit.std({ color: 0xc6bb9a, roughness: 1 });
  const fletched = kit.std({ vertexColors: true, roughness: 0.8, metalness: 0.1 });
  const j = buildHumanoid({ skin: coat }, { chestW: 0.17, chestD: 0.14, shoulderW: 0.2, shoulderY: 0.45, upperR: 0.06, foreR: 0.05, shinL: 0.41 });
  stripRig(j.root);
  const S = new Sculpt();
  // the coat cut as the mage's tunic is, over the shoulders as a man's are and meeting the neck at its base (a round barrel of a body ending in a shelf at the shoulders left a long neck standing out of it)
  S.add(plate((u, v, out) => onTunic((u - 0.5) * TAU, lerp(TUNIC_Y[0], TUNIC_Y[1], 1 - (1 - v) ** 1.5), 0, out), 40, 30, 0, undefined, V(0, 0.1, 0)), coat, j.chest);
  // (a standing collar round the neckline, as the sheet's coat has, open down the front in a short slit closed by two buttons;
  // higher behind, up the back of the neck to under the hair: level, it left a long bare neck from behind)
  const collarUp = (x: number, y: number, z: number) => y + COLLAR_RISE * smooth(clamp((-0.1 - z / (Math.hypot(x, z) || 1)) / 0.65, 0, 1)) * clamp((y - 0.289) / 0.039, 0, 1);
  {
    const g = lathe([[0.0795, 0.289], [0.0795, 0.31], [0.0785, 0.326], [0.0757, 0.328], [0.0757, 0.3]], 28).scale(1, 1, 0.935).translate(0, 0, -0.0125), q = g.attributes.position;
    for (let i = 0; i < q.count; i++) q.setY(i, collarUp(q.getX(i), q.getY(i), q.getZ(i) + 0.0125));
    g.computeVertexNormals();
    S.add(g, coat, j.chest);
  }
  for (const sx of [1, -1]) S.add(taperTube([0.326, 0.27, 0.235].map((y) => y > 0.3 ? V(sx * 0.005, y, 0.0635) : tunicFront(sx * 0.005, y, 0.001)), () => 0.0022, 8, 5), dark, j.chest);
  for (const y of [0.29, 0.258]) S.add(new THREE.SphereGeometry(0.0055, 8, 6), brass, j.chest, tunicFront(0, y, 0.003).toArray());
  // the seams, stitched in a lighter thread: round the collar's top and foot, down both sides of the slit and on down the
  // front, over each shoulder from the neck to the sleeve, and down each side
  const ring = (rx: number, rz: number, y: number) => Array.from({ length: 32 }, (_, i) => { const a = i / 32 * TAU; return V(Math.sin(a) * rx, collarUp(Math.sin(a), y, Math.cos(a)), Math.cos(a) * rz * 0.935 - 0.0125); });
  S.add(stitches(ring(0.0812, 0.0812, 0.32), 0.004, 0.0028, 0.0009, true), thread, j.chest);
  S.add(stitches(ring(0.0812, 0.0812, 0.295), 0.004, 0.0028, 0.0009, true), thread, j.chest);
  for (const sx of [1, -1]) S.add(stitches([0.318, 0.29, 0.26, 0.24].map((y) => y > 0.3 ? V(sx * 0.011, y, 0.065) : tunicFront(sx * 0.011, y, 0.0018))), thread, j.chest);
  S.add(stitches([0.234, 0.2, 0.15, 0.1, 0.05, 0, -0.05, -0.1].map((y) => tunicFront(0, y, 0.0015))), thread, j.chest);
  for (const sa of [1, -1]) {
    S.add(stitches([0.294, 0.285, 0.272, 0.258, 0.245, 0.232, 0.22].map((y) => onTunic(sa * Math.PI / 2, y, 0.0016))), thread, j.chest);
    S.add(stitches([0.17, 0.12, 0.06, 0, -0.06, -0.11].map((y) => onTunic(sa * Math.PI / 2, y, 0.0016))), thread, j.chest);
  }
  // (gathered under the belt a little fuller than the mage's tunic)
  {
    // (gathered under the belt in soft folds, and bloused a little over it)
    const g = lathe([[0.148, -0.05], [0.149, 0.0], [0.15, 0.06], [0.151, 0.1], [0.152, 0.14], [0.153, 0.2], [0.155, 0.26]], 48), q = g.attributes.position;
    for (let i = 0; i < q.count; i++) {
      const x = q.getX(i), y = q.getY(i), z = q.getZ(i), a = Math.atan2(x, z);
      const under = clamp((BELT_Y - 0.01 - y) / 0.09, 0, 1) * clamp((y + 0.05) / 0.04, 0, 1), over = Math.exp(-(((y - BELT_Y - 0.035) / 0.025) ** 2));
      const k = 1 + under * (0.035 * Math.sin(a * 14 + 0.6 * Math.sin(a * 3)) + 0.012 * Math.sin(a * 23)) + over * 0.02 * (1 + Math.sin(a * 9));
      q.setXYZ(i, x * k, y, z * k);
    }
    g.computeVertexNormals();
    S.add(g, coat, j.spine, [0, 0, 0], [0, 0, 0], [1.08, 1, 0.9]);
  }
  // (hanging straight from the belt to mid-thigh as the sheet's does: flared like a bell, it stood out half as deep again)
  // (slit at the sides, as the sheet's: the hem rising to the slit's top there; the back a little shorter)
  // (from under the belt, falling straight as the sheet's does: hung from the hips it narrowed to a waist under the belt and
  // flared out below it)
  const tunic = new Skirt({ r0: 0.16, r1: 0.25, len: 0.375, depth: 0.68, folds: 13, foldAmp: 0.028, push: 1.25, flare: 0.5, rows: 10, radial: 64, trim: 0.035,
    hem: (a) => -0.12 * Math.max(0, -Math.cos(a)) - 0.4 * Math.exp(-(((Math.abs(Math.sin(a)) - 1) / 0.006) ** 2)) });
  const hem = new THREE.Mesh(tunic.geo, [coat, coatHem]); hem.castShadow = hem.receiveShadow = true; j.hips.add(hem); hem.position.y = 0.06 + BELT_Y - 0.025;
  hem.name = 'tunic hem';
  // a broad belt of oiled leather, stitched along both edges, its brass buckle square and its tail through a keeper
  S.add(belt(0.172, 0.146, BELT_Y, 0.05, 0.009, 0, 40), strapLeather, j.spine);
  for (const dy of [-0.021, 0.021]) S.add(stitches(Array.from({ length: 40 }, (_, i) => { const a = i / 40 * TAU; return V(Math.sin(a) * 0.1775, BELT_Y + dy, Math.cos(a) * 0.1515); }), 0.004, 0.003, 0.0009, true), thread, j.spine);
  S.add(buckle(0.05, 0.05, 0.008), brass, j.spine, [0, BELT_Y, 0.16]);
  S.add(new THREE.BoxGeometry(0.012, 0.056, 0.012), strapLeather, j.spine, [0.06, BELT_Y, 0.152], [0, 0.38, 0]);
  // the baldric the quiver hangs from: over the right shoulder, across the chest and the back to the left hip, buckled on
  // the chest
  // (its ends under the belt, as the sheet's runs on past it to the hip)
  const run = [0, 0.2, 0.4, 0.6, 0.8, 1], across = (t: number) => lerp(-0.13, 0.155, t), down = (t: number) => lerp(0.24, -0.11, t);
  S.add(strap([...run.map((t) => tunicFront(across(t), down(t), 0.006)), onTunic(Math.PI / 2, -0.115, 0.006), ...[...run].reverse().map((t) => tunicBack(across(t), down(t), 0.006)), V(-0.135, 0.29, -0.012)], 0.048, 0.008, true), strapLeather, j.chest);
  S.add(buckle(0.042, 0.05, 0.007), brass, j.chest, tunicFront(-0.075, 0.18, 0.014).toArray(), [0, 0, -0.85]);
  for (const [sh, el] of [[j.shoulderL, j.elbowL], [j.shoulderR, j.elbowR]]) {
    // (its round top sunk into the deltoid, as the mage's tunic's)
    S.skin(limb(0.38, 0.06, 0.056, 0.04, 0.24, 14), coat, sh, el, 0.2, 0.33, [0, -0.025, 0]);
    S.add(stitches(Array.from({ length: 24 }, (_, i) => { const a = i / 24 * TAU; return V(Math.sin(a) * 0.0625, -0.035 + 0.012 * Math.cos(a), Math.cos(a) * 0.0625); }), 0.004, 0.0028, 0.0009, true), thread, sh);
    // (the sleeve on down the forearm into a bracer from the wrist, a brass band round the bracer's top)
    S.add(lathe([[0.052, -0.12], [0.055, -0.04], [0.056, 0]], 14), coat, el);
    S.add(lathe([[0.046, -0.27], [0.047, -0.22], [0.052, -0.15], [0.057, -0.1], [0.058, -0.095]], 14), hide, el);
    S.add(belt(0.059, 0.059, -0.1, 0.012, 0.004), brass, el);
  }
  for (const [th, kn, an] of [[j.thighL, j.kneeL, j.ankleL], [j.thighR, j.kneeR, j.ankleR]]) {
    // wool trousers, loose (round in section, as deep as wide), into the boots below the knee
    S.add(limb(0.46, 0.088, 0.084, 0.02, 0.28, 12), wool, th);
    S.add(lathe([[0.068, -0.1], [0.076, -0.03], [0.08, 0.02]], 12), wool, kn);
    // tall riding boots to just below the knee (boot.ts)
    buildBoot(S, { leather: boot, sole: soleLeather, strap: strapLeather, metal: brass }, kn, an, th === j.thighL ? 1 : -1);
  }
  // the shared anatomical head, with his own face (face.ts FACES.ranger)
  const head = buildHead(j.head, kit, 'ranger', { hair: 'swept', crop: true });
  buildNeck(j.neck, kit, 'ranger', j.P.neckL, j.head);
  const mouth = new THREE.Object3D(); mouth.name = 'mouth'; head.group.add(mouth); toGroup(0, 50, 112, mouth.position);
  const anchor = new THREE.Object3D(); anchor.name = 'anchor'; head.group.add(anchor); anchor.position.copy(ANCHOR);
  const cap = joint(head.group); cap.name = 'cap'; cap.visible = false;
  buildHat(head, cap, felt, boot, strapLeather);
  const handL = buildHand(j.handL, 1, hide, skin), handR = buildHand(j.handR, -1, hide, skin);
  const body = bodyShape(j, { L: handL.vis, R: handR.vis });
  // A leather quiver over the right shoulder blade, slung from the right shoulder to the left hip, its arrows' nocks and
  // fletching standing out of its mouth above the shoulder, where the hand reaches up over it. (Leaning in, its mouth was
  // behind the head, and the arm reaching for it went 113 degrees past its range)
  // (long and narrow as the sheet's, down to the belt, three bands round it and a cap on its foot)
  const quiver = joint(j.chest, -0.13, 0.04, -0.19); quiver.rotation.z = 0.35;
  S.add(lathe([[0.02, -0.44], [0.05, -0.42], [0.052, 0.14], [0.057, 0.16]], 18), boot, quiver);
  S.add(lathe([[0.045, -0.445], [0.055, -0.43], [0.056, -0.37]], 18), strapLeather, quiver);
  for (const y of [-0.3, -0.05, 0.12]) { S.add(belt(0.056, 0.056, y, 0.02, 0.005), strapLeather, quiver); for (const a of [0.6, 1.8, 3, 4.2]) S.add(new THREE.SphereGeometry(0.004, 6, 4), brass, quiver, [Math.sin(a) * 0.061, y, Math.cos(a) * 0.061]); }
  for (let i = 0; i < 6; i++) {
    const x = Math.sin(i * 2.4) * 0.042, z = Math.cos(i * 2.4) * 0.042;
    S.add(new THREE.CylinderGeometry(0.004, 0.004, 0.38, 5), bowWood, quiver, [x, 0.13, z]);
    S.add(new THREE.BoxGeometry(0.026, 0.055, 0.004), cord, quiver, [x, 0.285, z]);
  }
  S.build();
  // the bow, in the left hand; the arrow the right hand carries from the quiver to the string
  const bow = new Bow({ riser: bowWood, limb: limbWood, grip: hide, string: cord, arrow: fletched });
  j.handL.add(bow.group);
  const held = new THREE.Mesh(arrowGeometry(), fletched); held.castShadow = false; held.visible = false; j.handR.add(held);
  // (where the shot leaves: the nocked arrow's middle)
  const tip = joint(bow.group), palm = joint(j.handR, 0, -0.07, 0.03);
  const flask = buildFlask(kit, brass, hide); flask.name = 'flask'; j.handR.add(flask); flask.position.set(0, -0.07, 0.03); flask.rotation.x = Math.PI;
  const drinkRig = { ...j, shoulderL: j.shoulderR, elbowL: j.elbowR, handL: j.handR };
  const legs = new LegIK(j), root = j.root;
  root.scale.setScalar(1.08);
  // where the string sits in the hooked fingers (the hand's frame): between the index and the middle finger's last joints
  hook(handR, 1, 0); root.updateMatrixWorld(true);
  const stringAt = j.handR.worldToLocal(handR.f[0].j[2].getWorldPosition(new THREE.Vector3()).add(handR.f[1].j[2].getWorldPosition(new THREE.Vector3())).multiplyScalar(0.5));
  /** when the hand reaches the quiver and has the arrow out of it, this frame (see FOLLOW) */
  let QUIVER = 0.5, OUT = 0.7;
  let yawOff = 0;
  let fp = false, hasBow = true, aimT = 0, raise = 0, free = 0, flaskOut = 0, nocked = true, lastLoosed = -1;
  /** how far the draw had gone (0..1 of its time) when the draw hand took the string, this shot (-1: not yet) */
  let kHook = -1, raiseLoose = 1, lastTilt = 0;
  /** where the string was in the fingers last frame, and at the release (the head's frame, taken while it's posed: here at
   *  the top of `animate` the head is back at rest, and worldToLocal brings its matrix up to that): the follow-through starts there */
  const lastNock = new THREE.Vector3(), loosedAt = new THREE.Vector3();
  const ready = pose(), set = pose(), line = pose(), shown = pose(), nockW = new THREE.Vector3(), anchorW = new THREE.Vector3();
  const sc = () => root.scale.x;

  /** the bow placed at `bp` (world), in the left hand, its grip in the fist, the elbow towards `elbowTo` (world): the arm
   *  within a body's ranges (armIK.ts), the fist turning about the grip as far as it needs (the knuckles angled, as an
   *  archer holds a bow) and holding it diagonally if the wrist needs; `bp` becomes where the bow went */
  const placeBow = (bp: BowPose, elbowTo: THREE.Vector3) => {
    const s = sc();
    _y.set(0, 1, 0).applyQuaternion(bp.q);
    // the wrist where the fist round the grip has it, the hand's length running back towards the shoulder
    _c.copy(GRIP).multiplyScalar(s).applyQuaternion(bp.q).add(bp.p);
    j.shoulderL.getWorldPosition(_d);
    _e.copy(_d).sub(_c).normalize();
    fistReach(handL, _y, _e, GRIP_R, _a);
    fistTurn(handL, _y, _e, _gq);
    const fit = solveArm(j, true, { wrist: _b.copy(_c).sub(_a), hand: _gq, pole: elbowTo, keep: 20, body, roll: { axis: _y, range: 0.6, at: _c }, slant: SLANT });
    root.updateMatrixWorld(true);
    // the bow where the fist has it: turned as far as the wrist and the forearm turned the hand (the hand joint against
    // the turn asked of it, its turn about the grip aside), its grip where the fist closes (a slanted fist closes a
    // little further along it). (Placed first and the hand fitted to it, the bow turned in a fist that couldn't follow)
    j.handL.getWorldQuaternion(_q).multiply(_q2.copy(_gq).premultiply(_q3.setFromAxisAngle(_y, fit.roll)).invert());
    bp.q.premultiply(_q);
    _y.set(0, 1, 0).applyQuaternion(bp.q);
    _e.set(0, 1, 0).applyQuaternion(j.handL.getWorldQuaternion(_q2));
    fistReach(handL, _y, _e, GRIP_R, _a, fit.slant);
    bp.p.copy(j.handL.getWorldPosition(_c)).add(_a).sub(_b.copy(GRIP).multiplyScalar(s).applyQuaternion(bp.q));
    hold(handL, _y, GRIP_R, _e, fit.slant);
    // the bow in the hand's frame
    j.handL.updateWorldMatrix(true, false);
    _m.compose(bp.p, bp.q, _s.setScalar(s));
    _m2.copy(j.handL.matrixWorld).invert().multiply(_m).decompose(bow.group.position, bow.group.quaternion, bow.group.scale);
  };
  /** the draw hand's turn hooked on the string of a bow posed `q` (world, into `out`): its fingers forward along the arrow
   *  and the string across them, the palm to the face, the index finger on top, the hand coming down a little to it from
   *  the elbow above */
  const stringTurn = (q: THREE.Quaternion, out: THREE.Quaternion) => {
    // (the hand's -y down its fingers, -z out of its palm)
    _y.set(0, 0, -1).applyQuaternion(q).addScaledVector(UP, 0.3).normalize();
    _z.set(-1, 0, 0).applyQuaternion(q);
    _z.addScaledVector(_y, -_y.dot(_z)).normalize();
    _x.crossVectors(_y, _z);
    return out.setFromRotationMatrix(_m.makeBasis(_x, _y, _z));
  };
  /** the right hand on the string of a bow posed `q`, by `w`: on it (1) its string point at `at` (world) and its fingers
   *  hooked on it; off it (0) its wrist at `at` and the hand riding its forearm (turned neither over nor back); between,
   *  its turn eased from that onto the string's. Its elbow towards `pole`, the shoulder girdle drawn back if it needs: the
   *  arm within a body's ranges and out of the head (armIK.ts; reached for the hand by a pole alone, the elbow went behind
   *  the back and the hand into the head). (Eased on the forearm, whichever the elbow: eased towards the hanging arm's
   *  turn in the world, half a turn off a raised one's, the forearm flipped from one end of its turn to the other; towards
   *  last frame's forearm, the wrist moved with it and the arm shook) */
  const drawHand = (at: THREE.Vector3, q: THREE.Quaternion, w: number, pole: THREE.Vector3, dt = 0, tilt = 0, girdle = true) => {
    const s = sc();
    stringTurn(q, _q2);
    // (`girdle`: whether the shoulder may move; drawing an upright bow it stays where it is: the girdle drew it back, and the
    // elbow with it, round behind the neck)
    // (hooked on the string, the hand rolled `tilt` about the arrow, the back of the hand angled up and out, as an archer's
    // is, and rolling a little more or less as its arm needs: held square to it, palm to the face, the forearm's turn ran
    // out with the elbow in line behind the arrow, and the elbow went round behind the neck instead; left to find the roll
    // itself, the solver looked only near where the elbow was)
    if (tilt) _q2.premultiply(_qt.setFromAxisAngle(_rx.set(0, -1, 0).applyQuaternion(_q2), tilt));
    solveArm(j, false, { wrist: _ra.copy(stringAt).multiplyScalar(s * w).applyQuaternion(_q2).negate().add(at), hand: _q2, ease: w < 1 ? { rest: HANG_R, w } : undefined, pole, keep: DRAW_KEEP, girdle, body, maxMove: dt && ELBOW_V ? ELBOW_V * dt : undefined,
      roll: w > 0.5 && HOOK_ROLL ? { axis: _rx.set(0, -1, 0).applyQuaternion(_q2), range: HOOK_ROLL, at } : undefined });
    root.updateMatrixWorld(true);
  };

  function animate(st: AnimState): void {
    const dt = st.dt, a = st.action, s = sc();
    resetPose(j); idle(j, st.t, 1 - st.move * 0.5);
    walkCycle(j, st.phase, st.move, { run: true, arm: 0.25, stride: 0.5, dir: st.moveDir ?? 1 });
    const shooting = a?.name === 'bow' && a.draw !== undefined, loosed = shooting && a.loosed !== undefined;
    // what follows a release (0..1), the draw (0..1 of its time) and how far that pulls the string
    const after = loosed ? clamp((a.t - 0.55) / 0.45, 0, 1) : -1, k = shooting ? a.draw! : 0;
    if (loosed && lastLoosed < 0) { nocked = false; loosedAt.copy(lastNock); raiseLoose = raise; }
    lastLoosed = loosed ? a.loosed! : -1;
    if (!loosed && !nocked && !shooting) nocked = true;
    if (after >= NOCKED) nocked = true;
    // (eased both ways: the bow comes up and goes down from a standstill)
    aimT = clamp(aimT + (shooting ? dt / AIM_IN : -dt / AIM_OUT), 0, 1);
    const aim = smooth(aimT);
    // (the hand takes the string with the bow brought in before the chest, as the arrow is nocked; only then does the bow come up
    // and the string come back: drawn as the hand came for it, the string met the hand at the throat, the arm folded tight,
    // and the elbow went up over the head to come round)
    const onW = loosed ? 1 : smooth(clamp((aimT - TAKE[0]) / (TAKE[1] - TAKE[0]), 0, 1));
    if (!shooting) kHook = -1;
    else if (!loosed && kHook < 0 && onW > 0.999) kHook = Math.min(k, 0.6);
    const kv = loosed ? k : kHook < 0 ? 0 : clamp((k - kHook) / (1 - kHook), 0, 1);
    // (loosed, from as far up as it had come: from the line, a quick tap's bow jumped up onto it)
    raise = shooting ? (loosed ? raiseLoose * (1 - smooth(clamp((after - FOLLOW) / (QUIVER - FOLLOW), 0, 1))) : smooth(clamp(kv / RAISE, 0, 1))) : damp(raise, 0, 6, dt);
    // side-on to the target: the hips turn (less when moving: the legs walk along them), the trunk the rest, the head back to the target
    // (the chest open towards the target as the draw starts and closing as the string comes back, so the draw elbow goes round
    // behind with the shoulder: side-on from the start, the hand reaching the string out front took the arm across the
    // chest past its range, and the elbow went over the head to come round)
    const closed = !shooting ? 1 : loosed ? 1 - smooth(clamp((after - FOLLOW) / (NOCKED - FOLLOW), 0, 1)) : drawnAt(kv) * Math.min(1, aimT * 1.5);
    const side = aim * SIDE, hip = side * lerp(HIP_SIDE, HIP_SIDE_MOVING, st.move), open = aim * OPEN * (1 - closed);
    j.hips.rotation.y -= hip; j.spine.rotation.y -= (side - hip - open) * 0.45; j.chest.rotation.y -= (side - hip - open) * 0.55;
    j.neck.rotation.y += side * 0.4; j.head.rotation.y += side * 0.6;
    // (the shoulders' line tilts with the shot's angle: the trunk bends at the waist, not the arms at the shoulders)
    const pitch = shooting ? a.pitch ?? 0 : 0;
    j.chest.rotation.z += pitch * 0.6 * aim; j.spine.rotation.z += pitch * 0.25 * aim;
    j.spine.rotation.x += st.move * 0.1;
    // the other skills' gestures with the draw hand off the string, and the draught
    const gesture = a?.name === 'cast' || a?.name === 'buff' || a?.name === 'slam', drinking = a?.name === 'drink';
    if (gesture) {
      j.shoulderR.rotation.x = -0.6 - Math.sin(a.t * Math.PI) * 0.9; j.elbowR.rotation.x = -0.5;
      if (a.name === 'slam') j.body.position.y -= Math.sin(a.t * Math.PI) * 0.12;
    }
    free = damp(free, gesture || drinking ? 1 : 0, 14, dt);
    // carrying the bow: the arm a little out from the side and the elbow a little bent (the walk swings it)
    j.shoulderL.rotation.z += 0.2; j.elbowL.rotation.x -= CARRY_BEND;
    hook(handR, 0, 0);
    const drinkOut = drinking ? drink(drinkRig, a.t, mouth, DRINK) : 0;
    flaskOut = damp(flaskOut, drinkOut, 16, dt); flask.visible = flaskOut > 0.02; flask.scale.setScalar(Math.max(0.02, flaskOut));
    if (aim < 0.5) st.look?.();
    if (st.dead >= 0) { deathFall(j, st.dead); legs.reset(); }
    else {
      if (!fp) legs.captureArms();
      // (each foot on its own side of the pelvis's middle as the leg IK sees it: across it, it was moved back out and stepped again, over and over)
      if (aim > 0.4) { legs.stance(0, 0.07, 0.2, -1.1); legs.stance(1, -0.07, -0.22, -1.45); }
      else { legs.stance(0, 0.13, 0.06, 0.2); legs.stance(1, -0.13, -0.04, -0.3); }
      legs.update(dt, st.phase, st.dead, 1, fp ? 0 : 1); groundFeet(j, 0.07);
      if (!fp) legs.holdArms();
    }
    tunic.update(-j.thighL.rotation.x, -j.thighR.rotation.x, st.move, st.t, dt);
    root.updateMatrixWorld(true);
    if (st.dead >= 0) return;

    // the arrow's line: the heading the shot flies and its angle above level
    const facing = Math.atan2(_a.set(0, 0, 1).transformDirection(root.matrixWorld).x, _a.z);
    yawOff = angleDamp(yawOff, shooting && a.yaw !== undefined ? clamp(Math.atan2(Math.sin(a.yaw - facing), Math.cos(a.yaw - facing)), -YAW_OFF, YAW_OFF) : 0, 20, dt);
    const yaw = facing + yawOff;
    _u.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    const u = _u.clone();
    if (aim > 0.01) {
      // the face onto the target whatever the legs did to the trunk: turned to it and looking along the arrow
      j.head.getWorldDirection(_a);
      const dy = Math.atan2(Math.sin(yaw - Math.atan2(_a.x, _a.z)), Math.cos(yaw - Math.atan2(_a.x, _a.z)));
      j.neck.rotation.y += dy * 0.4 * aim; j.head.rotation.y += dy * 0.6 * aim; j.head.rotation.x -= pitch * 0.5 * aim;
      root.updateMatrixWorld(true);
    }
    anchor.getWorldPosition(anchorW);
    if (fp) fromEyes(root, j.neck, FP_ANCHOR, anchorW);
    // full draw: the bow arm reaching along the line from the anchor, its fist round the grip; how far that is, is the draw length
    const fan = shooting && (a.arrows ?? 1) > 1;
    // (the fan's string lies across, hooked palm down: the hand's width across the jaw, so it's anchored that much out from the face)
    if (fan && !fp) anchorW.addScaledVector(_e.crossVectors(UP, u).normalize(), -FAN_OUT * s);
    frame(u, fan ? FLAT : CANT, line.q);
    _y.set(0, 1, 0).applyQuaternion(line.q);
    j.shoulderL.getWorldPosition(_d);
    fistReach(handL, _y, _e.copy(u).negate(), GRIP_R, _c);
    // (the wrist, as the rest lies on the line at D from the anchor: B + u D)
    _b.copy(anchorW).addScaledVector(_y, (GRIP.y - REST_Y) * s).addScaledVector(u, GRIP.z * s).sub(_c).sub(_d);
    const L = (j.P.upperL + j.P.foreL) * s * REACH, ub = u.dot(_b);
    const D = -ub + Math.sqrt(Math.max(0, ub * ub - _b.lengthSq() + L * L));
    line.p.copy(anchorW).addScaledVector(u, D).addScaledVector(_y, -REST_Y * s);
    if (fp) { fromEyes(root, j.neck, FP_GRIP, line.p); _a.copy(line.p).sub(anchorW).normalize(); frame(_a, fan ? FLAT : 0.3, line.q); }
    const pullMax = Math.max(0.05, line.p.distanceTo(anchorW) / s - bow.brace);
    // between shots, the bow arm brings the bow in before the chest, the arrow pointing down the shot, its nock where the
    // draw hand lays the next arrow on it with its elbow bent (out along the shot, the nock was 37 cm across the body
    // and the arm reached straight out across the face for it)
    _a.copy(u).applyAxisAngle(_left.crossVectors(UP, u).normalize(), SET_TIP[0]);
    frame(_a, SET_TIP[1], set.q);
    j.chest.localToWorld(set.p.copy(NOCK_AT)).sub(_e.set(0, REST_Y, -bow.brace).multiplyScalar(s).applyQuaternion(set.q));
    // carried: in the fist at the side, held as the hand holds it whichever way the arm swings (its top forward and out, an arrow nocked along it)
    const wristFK = j.handL.getWorldPosition(new THREE.Vector3()), elbowFK = j.elbowL.getWorldPosition(new THREE.Vector3());
    const elbowPoleFK = elbowFK.clone().sub(j.shoulderL.getWorldPosition(_d));
    root.getWorldQuaternion(_q3);
    _a.copy(wristFK).sub(elbowFK).applyQuaternion(_q2.copy(_q3).invert());
    const swing = Math.atan2(_a.z, -_a.y);
    ready.q.copy(_q3).multiply(_q.setFromAxisAngle(FWD, -CARRY_OUT)).multiply(_q2.setFromAxisAngle(_x.set(1, 0, 0), CARRY_TILT - swing));
    _y.set(0, 1, 0).applyQuaternion(ready.q);
    fistReach(handL, _y, _e.copy(elbowFK).sub(wristFK).normalize(), GRIP_R, _c);
    ready.p.copy(wristFK).add(_c).sub(_b.copy(GRIP).multiplyScalar(s).applyQuaternion(ready.q));
    // (through the eyes the bow stays in the view, low on the left, and comes in for the next arrow below the line)
    if (fp) {
      fromEyes(root, j.neck, FP_REST, ready.p); frame(dirFromEyes(root, _a.copy(FP_REST_DIR).normalize(), _e), 0.7, ready.q);
      set.p.lerpVectors(anchorW, line.p, 0.8).addScaledVector(UP, -0.1 * s);
      _a.copy(line.p).sub(anchorW).normalize(); _a.applyAxisAngle(_left.crossVectors(UP, _a).normalize(), 0.3); frame(_a, 0.5, set.q);
    }
    // the bow where it is: on the line as it draws, in for the next arrow, and at rest between shots
    shown.p.lerpVectors(set.p, line.p, raise); shown.q.slerpQuaternions(set.q, line.q, raise);
    // loosed, the bow tips forward in the loose fist and is caught
    // (only out on the line: tipped as it came in, its lower limb swung back into the body)
    const drop = loosed ? Math.sin(clamp(after / 0.5, 0, 1) * Math.PI) * 0.5 * (a.draw ?? 1) * raise * raise : 0;
    if (drop) shown.q.multiply(_q2.setFromAxisAngle(_x.set(1, 0, 0), drop));
    // (it comes in from the side quicker than the body turns, so the hand takes the string on it before it comes up)
    const bowIn = smooth(clamp(aimT / BOW_IN, 0, 1));
    shown.p.lerpVectors(ready.p, shown.p, bowIn); _q.copy(shown.q); shown.q.copy(ready.q).slerp(_q, bowIn);
    // (out to the left and up on its way from the side to the shot and back, so the lower limb passes outside the thigh, not through it)
    shown.p.addScaledVector(_e.crossVectors(UP, u).normalize(), CARRY_SWING * s * Math.sin(bowIn * Math.PI)).addScaledVector(UP, 0.08 * s * Math.sin(bowIn * Math.PI));
    // the string: drawn as the bow comes up; loosed, it springs back past rest and rings out
    if (loosed) bow.set(0, -0.35 * (a.draw ?? 1) * Math.exp(-a.loosed! / 0.06) * Math.cos(a.loosed! * Math.PI * 2 * 9));
    else bow.set(drawnAt(kv) * pullMax * Math.min(1, aim * 1.5));
    // (the bow arm's elbow carried as it hangs, and on the shot turned out and a little down: its crease upright, the string clears the forearm)
    const elbowTo = _x.set(1, 0, 0).applyQuaternion(shown.q).addScaledVector(UP, -0.35).normalize().lerp(elbowPoleFK.normalize(), 1 - aim).clone();
    if (hasBow) placeBow(shown, elbowTo);
    // the arrows on the string (a fan laid across the flat bow's top), and where the shot leaves (the nocked arrow's middle)
    const n = shooting ? a.arrows ?? 1 : 1;
    bow.nockArrows(hasBow && nocked ? n : 0, shooting ? a.fan ?? 0 : 0, n > 1);
    tip.position.copy(bow.arrows[Math.floor((Math.max(1, n) - 1) / 2)].position);
    root.updateMatrixWorld(true);
    nockW.copy(bow.nock); bow.group.localToWorld(nockW);

    // the draw hand: on the string at the nock, or following through and fetching the next arrow (the other skills'
    // gestures and the draught blend back over it, as posed above)
    const fk = [j.shoulderR.quaternion.clone(), j.elbowR.quaternion.clone(), j.handR.quaternion.clone()];
    // (carried, the draw hand hangs free: it takes the string as the bow comes up)
    const loose = free;
    // (where the pose has the wrist: taking the string, the hand goes from there to it, the arm solved within a body's
    // ranges all the way; blending the joints between the two poses put the hand through the head)
    const fkAt = j.handR.getWorldPosition(new THREE.Vector3());
    const fkPole = j.elbowR.getWorldPosition(new THREE.Vector3()).sub(j.shoulderR.getWorldPosition(_d));
    // (the archer's left across the shot, level: the bow's own left is up when it's laid flat for a fan)
    _left.crossVectors(UP, u).normalize();
    // the draw elbow at full draw: in line behind the hand along the arrow from above, a little over it, so behind the head,
    // the upper arm rising from the shoulder away from the target (sent out towards the archer's back, the elbow came
    // round behind the body and the hand through the head)
    const fullPole = nockW.clone().addScaledVector(u, -(j.P.foreL * s + 0.09 * s)).addScaledVector(UP, ELBOW_UP * s).sub(j.shoulderR.getWorldPosition(_d)).normalize();
    // with the string taken before the chest, out to the right at the shoulder's height; between, as far round from there as
    // the string has come back, so it stays out to the side. (In line behind the hand all the way, the elbow stood straight
    // up over the head with the arrow pointing down before the chest, and with the hand at the face; sent forward while the
    // string came back, it jumped round behind as the hand reached the anchor)
    const setPole = _b.copy(SET_POLE).transformDirection(j.chest.matrixWorld).clone();
    const drawn = loosed ? 0 : drawnAt(kv) * Math.min(1, aim * 1.5);
    const linePole = setPole.clone().lerp(fullPole, drawn).normalize();
    // (the hand rolled on the string as far as the string has come back; the fan's string lies across, hooked palm down already)
    const tilt = fan ? 0 : HOOK_TILT * smooth(drawn);
    // (the hand's turn on the string: as on the line; followed the bow pitched down on its way up, the fingers pointed 40
    // degrees down and the wrist rose into the cheek)
    const onString = line.q.clone();
    held.visible = false;
    let e = -1;
    if (!loosed || after >= NOCKED || !hasBow) {
      // (its way up from the side bows out in front of the chest: straight there, it cut through the belly and the chest)
      // (the hand turns onto the string as it nears it)
      // (the elbow out and forward from where it hangs, then up behind: kept down by the side, the forearm crossed the chest
      // and the elbow swung up over the shoulder in a frame)
      if (onW < 1) {
        const pole = fkPole.normalize().lerp(linePole, onW);
        // (the hand rides its forearm until the elbow is up and out, then turns onto the string: turned onto it with the
        // elbow still low in front, the wrist met both its ends and the elbow jumped up)
        drawHand(_c.lerpVectors(fkAt, nockW, onW).addScaledVector(_a.set(0, 0, 1).transformDirection(j.chest.matrixWorld), BOW_OUT * s * Math.sin(onW * Math.PI)), onString, smooth(clamp((onW - 0.7) / 0.3, 0, 1)), pole.clone(), shooting && !loosed ? dt : 0, tilt, fan || !shooting || loosed);
      }
      else drawHand(nockW, onString, 1, linePole, shooting && !loosed ? dt : 0, tilt, fan || !shooting || loosed);
      lastTilt = tilt;
      j.head.worldToLocal(lastNock.copy(nockW));
    }
    else {
      // back along the jaw and down the neck from where the string left the fingers; up to the quiver's mouth over the
      // right shoulder; the arrow drawn up out of it and forward over the shoulder, then down in front of the chest to the
      // string, in one sweep. (The head, turned to the target, is between the quiver and the bow: carried straight from one
      // to the other, the arrow went over the head and the arm through it)
      const from = j.head.localToWorld(_d.copy(loosedAt));
      // (a little back and out from the neck, level: the shoulder is under the anchor, and back or down towards it the elbow
      // folded past its range)
      const follow = from.clone().addScaledVector(u, -0.04 * s).addScaledVector(_left, -0.08 * s).addScaledVector(UP, 0.01 * s);
      const q0 = quiver.localToWorld(_e.set(0, 0.3, 0)).clone(), axis = _x.set(0, 1, 0).transformDirection(quiver.matrixWorld).clone();
      const out = q0.clone().addScaledVector(axis, 0.22 * s).addScaledVector(_e.set(0, 0, 1).transformDirection(j.chest.matrixWorld), 0.1 * s);
      const over = j.chest.localToWorld(_e.copy(j.shoulderR.userData.rest ?? j.shoulderR.position).add(OVER)).clone();
      if (fp) { fromEyes(root, j.neck, FP_LOW, q0); fromEyes(root, j.neck, FP_LOW, out); out.addScaledVector(UP, 0.05 * s); fromEyes(root, j.neck, FP_UP, over); }
      // (up over the shoulder on the way to the quiver: across just above it, the arm folded past its range)
      const lift = j.chest.localToWorld(_e.copy(j.shoulderR.userData.rest ?? j.shoulderR.position).add(LIFT)).clone();
      const pts = [from.clone(), follow, lift, q0, out, over, nockW], ts = [0, FOLLOW];
      let total = 0; const lens = [0];
      for (let i = 2; i < pts.length; i++) lens.push(total += pts[i].distanceTo(pts[i - 1]));
      for (let i = 1; i < lens.length; i++) ts.push(FOLLOW + (NOCKED - FOLLOW) * lens[i] / total);
      QUIVER = ts[3]; OUT = ts[4];
      // (one ease over the way from the follow-through to the string: it sets off and arrives at rest, never stopping between)
      e = after < FOLLOW ? after : FOLLOW + (NOCKED - FOLLOW) * smooth((after - FOLLOW) / (NOCKED - FOLLOW));
      const at = through(pts, ts, Math.min(e, NOCKED), new THREE.Vector3());
      // (the string's turn eased off as the hand leaves it and back on as it lays the arrow on it; the elbow likewise)
      const on = Math.max(1 - smooth(clamp((after - 0.06) / 0.3, 0, 1)), smooth(clamp((e - OUT) / (NOCKED - OUT), 0, 1)));
      // (reaching up over the shoulder for it, the elbow raised and out to the side)
      // (from where the shot left it to there, and from there to before the shoulder, where the next draw starts)
      const reloadPole = _b.copy(UP).multiplyScalar(0.7).addScaledVector(u, -0.7).addScaledVector(_left, -0.2).normalize();
      const onA = 1 - smooth(clamp((after - 0.06) / 0.3, 0, 1));
      drawHand(at, onString, on, (on === onA ? fullPole : setPole).clone().lerp(reloadPole, 1 - on), 0, on === onA ? lastTilt * onA : 0);
      // the arrow in the fingers from the quiver to the string: point down out of the quiver, coming round onto the line
      if (e >= QUIVER) {
        held.visible = hasBow;
        const w = smooth(clamp((e - OUT) / (NOCKED - OUT), 0, 1));
        _a.copy(axis).negate().lerp(_b.copy(nockW).sub(bow.group.localToWorld(_e.set(0, REST_Y, 0))).negate().normalize(), w).normalize();
        j.handR.getWorldQuaternion(_q).invert();
        held.quaternion.setFromUnitVectors(FWD, _a.applyQuaternion(_q));
        held.position.copy(stringAt).addScaledVector(_a, ARROW / 2 / j.handR.getWorldScale(_s).x * s);
      }
    }
    if (loose > 0.001) {
      j.shoulderR.quaternion.slerp(fk[0], loose); j.elbowR.quaternion.slerp(fk[1], loose); j.handR.quaternion.slerp(fk[2], loose);
      // (the gestures' and the draught's arm brought within its ranges, the hand where they put it)
      if (!fp) { root.updateMatrixWorld(true); fitArm(j, false, undefined, body); }
    }
    hook(handR, loosed && after < NOCKED ? (after < FOLLOW ? 1 - smooth(after / FOLLOW) : 0.2) : 1 - loose, loosed && e >= QUIVER && after < NOCKED ? 1 : 0);
  }
  return {
    root, kit, joints: j, animate, tip, palm, height: 2,
    firstPerson(on) { fp = on; }, reset() { legs.reset(); aimT = 0; raise = 0; nocked = true; kHook = -1; },
    setGear(gear) { hasBow = !!gear.weapon; bow.group.visible = hasBow; cap.visible = gear.helm; for (const h of head.hair.slice(1)) h.visible = !gear.helm; },
    dispose() { kit.dispose(); root.traverse((o) => { const g = (o as THREE.Mesh).geometry; if (g && g !== arrowGeometry()) g.dispose(); }); },
  };
}
