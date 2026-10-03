// A woodland archer in a fitted green trailcoat, leather bracers and boots, with a recurved bow.
import * as THREE from 'three';
import { createKit } from '../../core/materials';
import { cloth, leather, wood, pbrMaterialMaps } from '../../core/textures';
import { buildHumanoid, joint, part, resetPose, walkCycle, idle, deathFall, reachArm, groundFeet, ramp } from './rig';
import { Sculpt, stripRig, limb, lathe } from './shapes';
import { taperTube, belt, buckle, strap } from './armor';
import { buildHead, buildNeck, toGroup } from './head';
import { buildHand, poseHand, hold, seat } from './hands';
import { LegIK } from './ik';
import { PoseFade } from './motion';
import { buildFlask, drink } from './flask';
import { fromEyes } from '../viewModel';
import { damp, lerp } from '../../util';
import type { AnimState, Model } from '../../types';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0), _dir = new THREE.Vector3(), _q = new THREE.Quaternion(), _chestQ = new THREE.Quaternion();
const LEFT_POLE = V(0.7, -0.3, 0.1), DRINK = { wrist: V(0.03, -0.08, 0.22), tipped: V(0.03, 0.1, 0.2), pole: V(-0.8, 0.2, -0.2) };
const FP_GRIP = V(-0.38, -0.25, -0.65);

export function buildRanger(): Model {
  const kit = createKit(0xc9d993);
  const coat = kit.rim({ color: 0x35472c, roughness: 1, ...pbrMaterialMaps(cloth(), 1) }, 0x71835a, 0.25);
  const dark = kit.std({ color: 0x292d24, roughness: 1, ...pbrMaterialMaps(cloth(), 1) });
  const hide = kit.std({ color: 0x65452b, roughness: 1, ...pbrMaterialMaps(leather(), 1) });
  const bowWood = kit.std({ color: 0x956f3d, roughness: 0.85, ...pbrMaterialMaps(wood(), 1) });
  const brass = kit.std({ color: 0xa58a50, metalness: 0.8, roughness: 0.65 });
  const skin = kit.rim({ color: 0xc9957c, roughness: 0.9 }, 0x6a2a1c, 0.2);
  const cord = kit.std({ color: 0xc6bb9a, roughness: 1 });
  const j = buildHumanoid({ skin: coat }, { chestW: 0.17, chestD: 0.14, shoulderW: 0.2, shoulderY: 0.45, upperR: 0.06, foreR: 0.05, shinL: 0.41 });
  stripRig(j.root);
  const S = new Sculpt();
  S.add(lathe([[0.15, -0.12], [0.165, 0.04], [0.17, 0.18], [0.15, 0.245], [0.085, 0.29]], 24), coat, j.chest, [0, 0, 0], [0, 0, 0], [1, 1, 0.84]);
  S.add(lathe([[0.145, -0.04], [0.15, 0.1], [0.16, 0.24]], 20), coat, j.spine, [0, 0, 0], [0, 0, 0], [1, 1, 0.86]);
  S.add(lathe([[0.2, -0.23], [0.19, -0.16], [0.16, 0.03]], 24), coat, j.hips, [0, 0, 0], [0, 0, 0], [1, 1, 0.85]);
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
    S.add(new THREE.BoxGeometry(0.11, 0.017, 0.23), dark, an, [0, -0.065, 0.06]);
  }
  // Reuse the shared anatomical head, without the mage's beard or headwear.
  const head = buildHead(j.head, kit, 'mage', { hair: 'swept' });
  buildNeck(j.neck, kit, 'mage', j.P.neckL, j.head);
  const mouth = new THREE.Object3D(); mouth.name = 'mouth'; head.group.add(mouth); toGroup(0, 50, 112, mouth.position);
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
  // A leather quiver and visible feathered arrow shafts on the back.
  const quiver = joint(j.chest, -0.13, 0.04, -0.18); quiver.rotation.z = -0.25;
  S.add(lathe([[0.025, -0.27], [0.06, -0.23], [0.065, 0.15], [0.07, 0.16]], 14), hide, quiver);
  for (let i = 0; i < 6; i++) {
    const x = Math.sin(i * 2.4) * 0.042, z = Math.cos(i * 2.4) * 0.042;
    S.add(new THREE.CylinderGeometry(0.004, 0.004, 0.38, 5), bowWood, quiver, [x, 0.13, z]);
    S.add(new THREE.BoxGeometry(0.026, 0.055, 0.004), cord, quiver, [x, 0.285, z]);
  }
  S.build();
  const bow = joint(j.handL); bow.name = 'bow';
  const curve = [V(0, -0.65, -0.03), V(0, -0.52, 0.12), V(0, -0.25, 0.15), V(0, 0, 0), V(0, 0.25, 0.15), V(0, 0.52, 0.12), V(0, 0.65, -0.03)];
  const B = new Sculpt();
  B.add(taperTube(curve, (t) => 0.014 + Math.sin(t * Math.PI) * 0.012, 40, 8), bowWood, bow);
  B.add(new THREE.CylinderGeometry(0.026, 0.026, 0.15, 10), hide, bow);
  B.build();
  const strings = [0, 1].map(() => part(new THREE.CylinderGeometry(0.002, 0.002, 1, 5), cord, bow));
  const nocked = part(new THREE.CylinderGeometry(0.004, 0.004, 0.65, 6).rotateX(Math.PI / 2), bowWood, bow);
  const tip = joint(bow, 0, 0, 0.3), palm = joint(j.handR, 0, -0.07, 0.03);
  const flask = buildFlask(kit, brass, hide); flask.name = 'flask'; j.handR.add(flask); flask.position.set(0, -0.07, 0.03); flask.rotation.x = Math.PI;
  const drinkRig = { ...j, shoulderL: j.shoulderR, elbowL: j.elbowR, handL: j.handR };
  const legs = new LegIK(j), fade = new PoseFade(j), root = j.root;
  root.scale.setScalar(1.08);
  let fp = false, hasBow = true, aim = 0, lastName = '', lastK = 1, flaskOut = 0;
  const grip = V(0.33, 0.1, 0.4), stringPoint = new THREE.Vector3(), target = new THREE.Vector3(), pole = DRINK.pole, segment = new THREE.Vector3();
  const arm = (left: boolean, at: THREE.Vector3, p: THREE.Vector3) => reachArm(left ? j.shoulderL : j.shoulderR, left ? j.elbowL : j.elbowR, j.P.upperL, j.P.foreL, at, p);

  function animate(st: AnimState): void {
    resetPose(j); idle(j, st.t, 1 - st.move * 0.5);
    walkCycle(j, st.phase, st.move, { run: true, arm: 0.25, stride: 0.5, dir: st.moveDir ?? 1 });
    const a = st.action, shooting = a?.name === 'point';
    if ((a?.name ?? '') !== lastName || (a && a.t < lastK - 0.2)) fade.cut(0.12);
    lastName = a?.name ?? ''; lastK = a?.t ?? 1;
    aim = damp(aim, shooting ? 1 : 0, shooting ? 22 : 6, st.dt);
    const draw = shooting ? ramp(a.t, 0, 0.5) * (1 - ramp(a.t, 0.55, 0.7)) : 0;
    j.chest.rotation.y += aim * 0.25; j.spine.rotation.x += st.move * 0.1;
    grip.set(lerp(0.22, fp ? 0.32 : 0.26, aim), lerp(-0.23, fp ? -0.06 : 0.16, aim), lerp(0.17, 0.46, aim));
    if (fp) { root.updateMatrixWorld(true); fromEyes(root, j.neck, FP_GRIP, grip); j.chest.worldToLocal(grip); }
    arm(true, grip, LEFT_POLE);
    // Keep the bow vertical and facing forward in the chest frame, seated in the carrying fist.
    j.chest.updateWorldMatrix(true, false); j.handL.updateWorldMatrix(true, false);
    j.handL.parent!.getWorldQuaternion(_q).invert().multiply(j.chest.getWorldQuaternion(_chestQ));
    j.handL.quaternion.copy(_q); bow.rotation.set(0, -j.chest.rotation.y, fp ? -0.15 : -0.1);
    seat(handL, bow, 0.026);
    root.updateMatrixWorld(true);
    stringPoint.set(0, 0, -0.03 - draw * (fp ? 0.18 : 0.38));
    target.copy(stringPoint); bow.localToWorld(target); j.chest.worldToLocal(target);
    if (aim > 0.01) arm(false, target, pole);
    poseHand(handR, 0.55 + draw * 0.5, 0.05);
    if (a?.name === 'cast' || a?.name === 'buff' || a?.name === 'slam') {
      j.shoulderR.rotation.x = -0.6 - Math.sin(a.t * Math.PI) * 0.9; j.elbowR.rotation.x = -0.5;
      if (a.name === 'slam') j.body.position.y -= Math.sin(a.t * Math.PI) * 0.12;
    }
    const drinking = a?.name === 'drink';
    const drinkOut = drinking ? drink(drinkRig, a.t, mouth, DRINK) : 0;
    flaskOut = damp(flaskOut, drinkOut, 16, st.dt); flask.visible = flaskOut > 0.02; flask.scale.setScalar(Math.max(0.02, flaskOut));
    if (st.dead < 0) fade.apply(st.dt); else fade.reset();
    st.look?.();
    if (st.dead >= 0) { deathFall(j, st.dead); legs.reset(); }
    else {
      if (!fp) legs.captureArms();
      legs.stance(0, 0.13, aim * 0.08, 0.2); legs.stance(1, -0.13, -aim * 0.08, -0.3);
      legs.update(st.dt, st.phase, st.dead, 1, fp ? 0 : 1); groundFeet(j, 0.07);
      if (!fp) legs.holdArms();
    }
    strings.forEach((m, i) => {
      const end = curve[i ? 6 : 0], d = segment.copy(end).sub(stringPoint);
      m.position.copy(end).add(stringPoint).multiplyScalar(0.5); m.scale.y = d.length(); m.quaternion.setFromUnitVectors(UP, d.normalize());
    });
    nocked.visible = hasBow && shooting && a.t < 0.55; nocked.position.copy(stringPoint); nocked.position.z += 0.325;
    root.updateMatrixWorld(true); hold(handL, _dir.copy(UP).transformDirection(bow.matrixWorld), 0.026);
  }
  return {
    root, kit, joints: j, animate, tip, palm, height: 2,
    firstPerson(on) { fp = on; }, reset() { legs.reset(); fade.reset(); aim = 0; },
    setGear(gear) { hasBow = !!gear.weapon; bow.visible = hasBow; cap.visible = gear.helm; for (const h of head.hair) h.visible = !gear.helm; },
    dispose() { kit.dispose(); root.traverse((o) => (o as THREE.Mesh).geometry?.dispose()); },
  };
}
