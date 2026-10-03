// A woodland archer in a fitted green trailcoat, leather bracers and boots, with a recurved bow (models/bow.ts). His shot
// is an archer's: side-on to the target with his head turned to it, the bow arm straight along the arrow's line and the
// string drawn to an anchor at the corner of his mouth, the draw elbow in line behind the arrow, so his draw length is
// what his own arms reach. Loosed, the draw hand follows through back along the jaw and the bow tips forward in the
// loose fist; then the hand takes the next arrow from the quiver over his right shoulder and nocks it. Between shots he
// holds the bow low before him with an arrow nocked and his hand on the string.
import * as THREE from 'three';
import { createKit } from '../../core/materials';
import { cloth, leather, wood, pbrMaterialMaps } from '../../core/textures';
import { buildHumanoid, joint, part, resetPose, walkCycle, idle, deathFall, reachArm, groundFeet } from './rig';
import { Sculpt, stripRig, limb, lathe } from './shapes';
import { belt, buckle, strap, Skirt } from './armor';
import { buildHead, buildNeck, toGroup } from './head';
import { buildHand, hold, fistReach, type Hand } from './hands';
import { LegIK } from './ik';
import { buildFlask, drink } from './flask';
import { Bow, pullAt, arrowGeometry, ARROW, REST_Y } from './bow';
import { fromEyes } from '../viewModel';
import { clamp, damp, lerp, smooth } from '../../util';
import type { AnimState, Model } from '../../types';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0), FWD = V(0, 0, 1);
const DRINK = { wrist: V(0.03, -0.08, 0.22), tipped: V(0.03, 0.1, 0.2), pole: V(-0.8, 0.2, -0.2) };
/** where the nock comes to at full draw (the head's mm): under the right corner of the mouth, the string against the face */
const ANCHOR = toGroup(-36, 28, 88);
/** how far round the body turns side-on to the target (rad), the share of it the hips take standing, and moving */
const SIDE = 1.5, HIP_SIDE = 0.68, HIP_SIDE_MOVING = 0.2;
/** the bow's cant at full draw (rad: its top tipped over to the right) */
const CANT = 0.14;
/** the share of the draw over which the bow comes up onto the line */
const RAISE = 0.35;
/** after the release (0..1 of what follows it): the follow-through ends, the hand at the quiver, the arrow drawn out of it, nocked */
const FOLLOW = 0.2, QUIVER = 0.48, OUT = 0.66, NOCKED = 0.9;
/** the riser's grip in the bow's frame, and its radius */
const GRIP = V(0, -0.012, 0.003), GRIP_R = 0.022;
/** the bow arm's reach at full draw, of its length: nearly straight (a locked elbow is no archer's) */
const REACH = 0.99;
/** how long the body takes to come round onto a shot and back off it (s) */
const AIM_IN = 0.18, AIM_OUT = 0.5;
/** first person: the bow's grip ahead in the view, left of and below its middle (the eyes' frame: x right, y up, -z ahead, m) */
const FP_GRIP = V(-0.3, -0.2, -0.62);

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3();
const _u = new THREE.Vector3(), _left = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _x = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _s = new THREE.Vector3();
const _ra = new THREE.Vector3(), _rb = new THREE.Vector3(), _rq = new THREE.Quaternion();

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

export function buildRanger(): Model {
  const kit = createKit(0xc9d993);
  const coat = kit.rim({ color: 0x35472c, roughness: 1, ...pbrMaterialMaps(cloth(), 1) }, 0x71835a, 0.25);
  const dark = kit.std({ color: 0x292d24, roughness: 1, ...pbrMaterialMaps(cloth(), 1) });
  const hide = kit.std({ color: 0x65452b, roughness: 1, ...pbrMaterialMaps(leather(), 1) });
  const bowWood = kit.std({ color: 0x956f3d, roughness: 0.85, ...pbrMaterialMaps(wood(), 1) });
  const limbWood = kit.std({ color: 0x5a3c22, roughness: 0.7, ...pbrMaterialMaps(wood(), 1) });
  const brass = kit.std({ color: 0xa58a50, metalness: 0.8, roughness: 0.65 });
  const skin = kit.rim({ color: 0xc9957c, roughness: 0.9 }, 0x6a2a1c, 0.2);
  const cord = kit.std({ color: 0xc6bb9a, roughness: 1 });
  const fletched = kit.std({ vertexColors: true, roughness: 0.8, metalness: 0.1 });
  const j = buildHumanoid({ skin: coat }, { chestW: 0.17, chestD: 0.14, shoulderW: 0.2, shoulderY: 0.45, upperR: 0.06, foreR: 0.05, shinL: 0.41 });
  stripRig(j.root);
  const S = new Sculpt();
  S.add(lathe([[0.15, -0.12], [0.165, 0.04], [0.17, 0.18], [0.15, 0.245], [0.085, 0.29]], 24), coat, j.chest, [0, 0, 0], [0, 0, 0], [1, 1, 0.84]);
  S.add(lathe([[0.145, -0.04], [0.15, 0.1], [0.16, 0.24]], 20), coat, j.spine, [0, 0, 0], [0, 0, 0], [1, 1, 0.86]);
  const tunic = new Skirt({ r0: 0.165, r1: 0.25, len: 0.25, depth: 0.95, folds: 8, foldAmp: 0.025, push: 1.25, flare: 0.5, rows: 6 });
  const hem = part(tunic.geo, coat, j.hips, 0, 0.03);
  hem.name = 'tunic hem';
  S.add(belt(0.16, 0.14, 0.015, 0.055, 0.008), hide, j.spine);
  S.add(buckle(0.035, 0.04, 0.007), brass, j.spine, [0, 0.015, 0.15]);
  S.add(strap([V(-0.13, 0.24, 0.13), V(0, 0.09, 0.15), V(0.14, -0.09, 0.12)], 0.035, 0.007), hide, j.chest);
  for (const s of [-1, 1]) {
    S.add(new THREE.BoxGeometry(0.065, 0.08, 0.04), hide, j.hips, [s * 0.19, -0.05, 0.07]);
    S.add(new THREE.BoxGeometry(0.07, 0.025, 0.045), dark, j.hips, [s * 0.19, -0.01, 0.07]);
  }
  for (const [sh, el] of [[j.shoulderL, j.elbowL], [j.shoulderR, j.elbowR]]) {
    S.skin(limb(0.36, 0.068, 0.06, 0.02, 0.22, 14), coat, sh, el, 0.2, 0.32);
    S.add(limb(0.27, 0.055, 0.043, 0.012, 0.18, 12), hide, el);
    for (const y of [-0.09, -0.22]) S.add(belt(0.057, 0.053, y, 0.018, 0.004), brass, el);
  }
  for (const [th, kn, an] of [[j.thighL, j.kneeL, j.ankleL], [j.thighR, j.kneeR, j.ankleR]]) {
    S.add(limb(0.46, 0.085, 0.07, 0.015, 0.28, 12), dark, th);
    S.add(limb(0.41, 0.067, 0.048, 0.015, 0.3, 12), hide, kn);
    for (const y of [-0.15, -0.3]) S.add(belt(0.066, 0.061, y, 0.022, 0.006), dark, kn);
    S.add(new THREE.SphereGeometry(1, 16, 10).scale(0.058, 0.045, 0.12), hide, an, [0, -0.03, 0.065]);
    const sole = new THREE.Shape();
    sole.moveTo(-0.04, -0.05); sole.bezierCurveTo(-0.065, -0.05, -0.062, 0.08, -0.05, 0.15);
    sole.bezierCurveTo(-0.04, 0.19, 0.04, 0.19, 0.05, 0.15);
    sole.bezierCurveTo(0.062, 0.08, 0.065, -0.05, 0.04, -0.05); sole.closePath();
    S.add(new THREE.ExtrudeGeometry(sole, { depth: 0.015, bevelEnabled: false, curveSegments: 10 }).rotateX(Math.PI / 2), dark, an, [0, -0.06, 0]);
  }
  // Reuse the shared anatomical head, without the mage's headwear.
  const head = buildHead(j.head, kit, 'mage', { hair: 'swept' });
  buildNeck(j.neck, kit, 'mage', j.P.neckL, j.head);
  const mouth = new THREE.Object3D(); mouth.name = 'mouth'; head.group.add(mouth); toGroup(0, 50, 112, mouth.position);
  const anchor = new THREE.Object3D(); head.group.add(anchor); anchor.position.copy(ANCHOR);
  const cap = joint(head.group); cap.name = 'cap'; cap.visible = false;
  const capGeo = new THREE.BufferGeometry(), positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  for (let y = 0; y <= 8; y++) for (let x = 0; x <= 32; x++) {
    const p = head.surface(x / 32 * Math.PI * 2, lerp(0.15, Math.PI / 2, y / 8), 6);
    positions.push(p.x, p.y, p.z);
    uvs.push(x / 32, y / 8);
    if (y < 8 && x < 32) { const a = y * 33 + x; indices.push(a, a + 1, a + 33, a + 1, a + 34, a + 33); }
  }
  capGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); capGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); capGeo.setIndex(indices); capGeo.computeVertexNormals();
  part(capGeo, coat, cap);
  const brim = part(new THREE.SphereGeometry(1, 20, 8).scale(0.11, 0.008, 0.075), hide, cap);
  const brow = head.surface(0, 0.15, 8); brim.position.copy(brow); brim.position.z += 0.035;
  const handL = buildHand(j.handL, 1, hide, skin), handR = buildHand(j.handR, -1, hide, skin);
  // A leather quiver over the right shoulder blade, its arrows' nocks and fletching standing out of its mouth above the shoulder.
  const quiver = joint(j.chest, -0.13, 0.04, -0.18); quiver.rotation.z = -0.25;
  S.add(lathe([[0.025, -0.27], [0.06, -0.23], [0.065, 0.15], [0.07, 0.16]], 14), hide, quiver);
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
  let fp = false, hasBow = true, aimT = 0, raise = 0, free = 0, flaskOut = 0, nocked = true, lastLoosed = -1;
  /** where the string was in the fingers last frame, and at the release (the head's frame): the follow-through starts there */
  const lastNock = new THREE.Vector3(), loosedAt = new THREE.Vector3();
  const ready = pose(), set = pose(), line = pose(), shown = pose(), nockW = new THREE.Vector3(), anchorW = new THREE.Vector3();
  const sc = () => root.scale.x;

  /** the arm from `shoulder` reaching `wrist` (world), its elbow towards `pole` (world) */
  const reach = (left: boolean, wrist: THREE.Vector3, pole: THREE.Vector3) => {
    const sh = left ? j.shoulderL : j.shoulderR, el = left ? j.elbowL : j.elbowR;
    j.chest.getWorldQuaternion(_rq).invert();
    reachArm(sh, el, j.P.upperL, j.P.foreL, j.chest.worldToLocal(_ra.copy(wrist)), _rb.copy(pole).applyQuaternion(_rq));
  };
  /** the hand turned to `q` (world) on its forearm */
  const turnHand = (hand: THREE.Object3D, elbow: THREE.Object3D, q: THREE.Quaternion) => { elbow.updateWorldMatrix(true, false); hand.quaternion.copy(elbow.getWorldQuaternion(_q3).invert().multiply(q)); };
  /** the bow placed at `bp` (world), in the left hand, its grip in the fist */
  const placeBow = (bp: BowPose) => {
    const s = sc();
    _y.set(0, 1, 0).applyQuaternion(bp.q);
    // the wrist where the fist round the grip has it, the hand's length running back towards the shoulder
    _c.copy(GRIP).multiplyScalar(s).applyQuaternion(bp.q).add(bp.p);
    j.shoulderL.getWorldPosition(_d);
    fistReach(handL, _y, _e.copy(_d).sub(_c).normalize(), GRIP_R, _a);
    const wrist = _b.copy(_c).sub(_a), pole = _e.set(0, 0, 0);
    // the bow arm's elbow turned out and a little down (its crease upright: the string clears the forearm)
    _x.set(1, 0, 0).applyQuaternion(bp.q); pole.copy(_x).addScaledVector(UP, -0.35);
    reach(true, wrist.clone(), pole.clone());
    root.updateMatrixWorld(true);
    hold(handL, _y, GRIP_R, _e.copy(_d).sub(_c).normalize());
    // the bow in the hand's frame
    j.handL.updateWorldMatrix(true, false);
    _m.compose(bp.p, bp.q, _s.setScalar(s));
    _m2.copy(j.handL.matrixWorld).invert().multiply(_m).decompose(bow.group.position, bow.group.quaternion, bow.group.scale);
  };
  /** the draw hand's turn on the string at the bow's pose `q`: the fingers along the arrow, the palm to the face, the index on top */
  const stringTurn = (q: THREE.Quaternion, out: THREE.Quaternion) => {
    _x.set(1, 0, 0).applyQuaternion(q); _z.set(0, 0, 1).applyQuaternion(q); _y.set(0, 1, 0).applyQuaternion(q);
    // (the hand's -y down its fingers, -z out of its palm: x the bow's up)
    return out.setFromRotationMatrix(_m.makeBasis(_y, _z.negate(), _x.negate()));
  };
  /** the right hand with its string point at `at` (world), turned `q` (world) by `w` (0: straight on its forearm), its elbow towards `pole` */
  const drawHand = (at: THREE.Vector3, q: THREE.Quaternion, w: number, pole: THREE.Vector3) => {
    const s = sc();
    // (the hand's turn depends on the forearm's, which the reach for it sets: a few passes settle it)
    for (let pass = 0; pass < 3; pass++) {
      root.updateMatrixWorld(true);
      j.elbowR.getWorldQuaternion(_q).slerp(q, w);
      reach(false, _ra.copy(stringAt).multiplyScalar(s).applyQuaternion(_q).negate().add(at), pole);
    }
    root.updateMatrixWorld(true);
    j.elbowR.getWorldQuaternion(_q).slerp(q, w);
    turnHand(j.handR, j.elbowR, _q);
    root.updateMatrixWorld(true);
  };

  function animate(st: AnimState): void {
    const dt = st.dt, a = st.action, s = sc();
    resetPose(j); idle(j, st.t, 1 - st.move * 0.5);
    walkCycle(j, st.phase, st.move, { run: true, arm: 0.25, stride: 0.5, dir: st.moveDir ?? 1 });
    const shooting = a?.name === 'bow' && a.draw !== undefined, loosed = shooting && a.loosed !== undefined;
    // what follows a release (0..1), the draw (0..1 of its time) and how far that pulls the string
    const after = loosed ? clamp((a.t - 0.55) / 0.45, 0, 1) : -1, k = shooting ? a.draw! : 0;
    if (loosed && lastLoosed < 0) { nocked = false; j.head.worldToLocal(loosedAt.copy(lastNock)); }
    lastLoosed = loosed ? a.loosed! : -1;
    if (!loosed && !nocked && !shooting) nocked = true;
    if (after >= NOCKED) nocked = true;
    // (eased both ways: the bow comes up and goes down from a standstill)
    aimT = clamp(aimT + (shooting ? dt / AIM_IN : -dt / AIM_OUT), 0, 1);
    const aim = smooth(aimT);
    raise = shooting ? (loosed ? 1 - smooth(clamp((after - FOLLOW) / (QUIVER - FOLLOW), 0, 1)) : smooth(clamp(k / RAISE, 0, 1))) : damp(raise, 0, 6, dt);
    // side-on to the target: the hips turn (less when moving: the legs walk along them), the trunk the rest, the head back to the target
    const side = aim * SIDE, hip = side * lerp(HIP_SIDE, HIP_SIDE_MOVING, st.move);
    j.hips.rotation.y -= hip; j.spine.rotation.y -= (side - hip) * 0.45; j.chest.rotation.y -= (side - hip) * 0.55;
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
    hook(handR, 1 - free, 0);
    const drinkOut = drinking ? drink(drinkRig, a.t, mouth, DRINK) : 0;
    flaskOut = damp(flaskOut, drinkOut, 16, dt); flask.visible = flaskOut > 0.02; flask.scale.setScalar(Math.max(0.02, flaskOut));
    if (aim < 0.5) st.look?.();
    if (st.dead >= 0) { deathFall(j, st.dead); legs.reset(); }
    else {
      if (!fp) legs.captureArms();
      if (aim > 0.4) { legs.stance(0, -0.02, 0.2, -1.1); legs.stance(1, 0.02, -0.22, -1.45); }
      else { legs.stance(0, 0.13, 0.06, 0.2); legs.stance(1, -0.13, -0.04, -0.3); }
      legs.update(dt, st.phase, st.dead, 1, fp ? 0 : 1); groundFeet(j, 0.07);
      if (!fp) legs.holdArms();
    }
    tunic.update(-j.thighL.rotation.x, -j.thighR.rotation.x, st.move, st.t, dt);
    root.updateMatrixWorld(true);
    if (st.dead >= 0) return;

    // the arrow's line: the heading the shot flies and its angle above level
    const yaw = shooting && a.yaw !== undefined ? a.yaw : Math.atan2(_a.set(0, 0, 1).transformDirection(root.matrixWorld).x, _a.z);
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
    if (fp) { fromEyes(root, j.neck, _a.set(0, -0.12, 0), anchorW); }
    // full draw: the bow arm reaching along the line from the anchor, its fist round the grip; how far that is, is the draw length
    frame(u, CANT, line.q);
    _y.set(0, 1, 0).applyQuaternion(line.q);
    j.shoulderL.getWorldPosition(_d);
    fistReach(handL, _y, _e.copy(u).negate(), GRIP_R, _c);
    // (the wrist, as the rest lies on the line at D from the anchor: B + u D)
    _b.copy(anchorW).addScaledVector(_y, (GRIP.y - REST_Y) * s).addScaledVector(u, GRIP.z * s).sub(_c).sub(_d);
    const L = (j.P.upperL + j.P.foreL) * s * REACH, ub = u.dot(_b);
    const D = -ub + Math.sqrt(Math.max(0, ub * ub - _b.lengthSq() + L * L));
    line.p.copy(anchorW).addScaledVector(u, D).addScaledVector(_y, -REST_Y * s);
    if (fp) { fromEyes(root, j.neck, FP_GRIP, line.p); _a.copy(line.p).sub(anchorW).normalize(); frame(_a, 0.3, line.q); }
    const pullMax = Math.max(0.05, line.p.distanceTo(anchorW) / s - bow.brace);
    // between shots, the bow arm comes in and down to take the next arrow
    _a.copy(u).applyAxisAngle(_left.crossVectors(UP, u).normalize(), 0.45);
    frame(_a, 0.55, set.q);
    set.p.copy(anchorW).addScaledVector(u, D * 0.72).addScaledVector(UP, -0.2 * s).addScaledVector(_left, 0.04 * s);
    // at rest: low before the body, canted over, the arrow pointing at the ground ahead
    _a.set(-0.25, -0.55, 0.8).normalize().transformDirection(root.matrixWorld);
    _q.copy(frame(_a, 1.0, ready.q));
    ready.p.set(0.1, 0.92, 0.3).applyMatrix4(root.matrixWorld);
    // the bow where it is: on the line as it draws, in for the next arrow, and at rest between shots
    shown.p.lerpVectors(set.p, line.p, raise); shown.q.slerpQuaternions(set.q, line.q, raise);
    // loosed, the bow tips forward in the loose fist and is caught
    const drop = loosed ? Math.sin(clamp(after / 0.5, 0, 1) * Math.PI) * 0.5 * (a.draw ?? 1) : 0;
    if (drop) shown.q.multiply(_q2.setFromAxisAngle(_x.set(1, 0, 0), drop));
    shown.p.lerpVectors(ready.p, shown.p, aim); _q.copy(shown.q); shown.q.copy(ready.q).slerp(_q, aim);
    // the string: drawn as the bow comes up; loosed, it springs back past rest and rings out
    if (loosed) bow.set(0, -0.35 * (a.draw ?? 1) * Math.exp(-a.loosed! / 0.06) * Math.cos(a.loosed! * Math.PI * 2 * 9));
    else bow.set(pullAt(k) * pullMax * Math.min(1, aim * 1.5));
    if (hasBow) placeBow(shown);
    // the arrows on the string, and where the shot leaves (the nocked arrow's middle)
    const n = shooting ? a.arrows ?? 1 : 1;
    bow.nockArrows(hasBow && nocked && free < 0.5 ? n : 0, shooting ? a.fan ?? 0 : 0);
    tip.position.copy(bow.nock).addScaledVector(_a.set(0, REST_Y, 0).sub(bow.nock).normalize(), ARROW / 2);
    root.updateMatrixWorld(true);
    nockW.copy(bow.nock); bow.group.localToWorld(nockW);

    // the draw hand: on the string at the nock, or following through and fetching the next arrow (the other skills'
    // gestures and the draught blend back over it, as posed above)
    const fk = free > 0.001 ? [j.shoulderR.quaternion.clone(), j.elbowR.quaternion.clone(), j.handR.quaternion.clone()] : null;
    _left.set(1, 0, 0).applyQuaternion(shown.q);
    // the draw elbow in line behind the arrow: towards the arrow's line carried on back past the nock
    j.shoulderR.getWorldPosition(_d);
    const linePole = nockW.clone().addScaledVector(u, -0.35 * s).sub(_d);
    stringTurn(shown.q, _q2);
    const onString = _q2.clone();
    held.visible = false;
    if (!loosed || after >= NOCKED || !hasBow) { drawHand(nockW, onString, 1, linePole); lastNock.copy(nockW); }
    else {
      // back along the jaw from where the string left the fingers; up to the quiver's mouth over the right shoulder; the
      // arrow drawn out and over the shoulder to the string, in one sweep
      const from = j.head.localToWorld(_d.copy(loosedAt));
      const follow = from.clone().addScaledVector(u, -0.13 * s).addScaledVector(_left, -0.05 * s).addScaledVector(UP, -0.03 * s);
      const q0 = quiver.localToWorld(_e.set(0, 0.3, 0)).clone(), axis = _x.set(0, 1, 0).transformDirection(quiver.matrixWorld).clone();
      const out = q0.clone().addScaledVector(axis, 0.36 * s).addScaledVector(u, 0.12 * s);
      const over = out.clone().lerp(nockW, 0.5).addScaledVector(UP, 0.1 * s);
      const at = through([from.clone(), follow, q0, out, over, nockW], [0, FOLLOW, QUIVER, OUT, (OUT + NOCKED) / 2, NOCKED], after, new THREE.Vector3());
      // (the string's turn eased off as the hand leaves it and back on as it lays the arrow on it; the elbow likewise)
      const on = Math.max(1 - smooth(clamp((after - 0.08) / 0.17, 0, 1)), smooth(clamp((after - OUT) / (NOCKED - OUT), 0, 1)));
      const reloadPole = _b.copy(UP).multiplyScalar(0.3).addScaledVector(u, -1).addScaledVector(_left, -0.6).normalize();
      drawHand(at, onString, on, linePole.clone().normalize().lerp(reloadPole, 1 - on));
      // the arrow in the fingers from the quiver to the string: point down out of the quiver, coming round onto the line
      if (after >= QUIVER) {
        held.visible = hasBow;
        const w = smooth(clamp((after - OUT) / (NOCKED - OUT), 0, 1));
        _a.copy(axis).negate().lerp(_b.copy(nockW).sub(bow.group.localToWorld(_e.set(0, REST_Y, 0))).negate().normalize(), w).normalize();
        j.handR.getWorldQuaternion(_q).invert();
        held.quaternion.setFromUnitVectors(FWD, _a.applyQuaternion(_q));
        held.position.copy(stringAt).addScaledVector(_a, ARROW / 2 / j.handR.getWorldScale(_s).x * s);
      }
    }
    if (fk) { j.shoulderR.quaternion.slerp(fk[0], free); j.elbowR.quaternion.slerp(fk[1], free); j.handR.quaternion.slerp(fk[2], free); }
    hook(handR, loosed && after < NOCKED ? (after < FOLLOW ? 1 - smooth(after / FOLLOW) : 0.2) : 1 - free, loosed && after >= QUIVER && after < NOCKED ? 1 : 0);
  }
  return {
    root, kit, joints: j, animate, tip, palm, height: 2,
    firstPerson(on) { fp = on; }, reset() { legs.reset(); aimT = 0; raise = 0; nocked = true; },
    setGear(gear) { hasBow = !!gear.weapon; bow.group.visible = hasBow; cap.visible = gear.helm; for (const h of head.hair) h.visible = !gear.helm; },
    dispose() { kit.dispose(); root.traverse((o) => { const g = (o as THREE.Mesh).geometry; if (g && g !== arrowGeometry()) g.dispose(); }); },
  };
}
