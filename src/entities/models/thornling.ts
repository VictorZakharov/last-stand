// Thornling: a small, quick creature of braided twigs. Sap glows through the grain of its wood; a gourd
// of a head carved into a snarl, splinter teeth, deep sockets with burning eyes, a crown of thorny
// branches in leaf; thorns down its back and forearms, long hooked twig claws, root toes and a vine tail.
import * as THREE from 'three';
import { createKit } from '../../core/materials';
import { bark, pbrMaterialMaps, veins } from '../../core/textures';
import type { AnimState, Model } from '../../types';
import { buildHumanoid, joint, resetPose, walkCycle, deathFall, ramp, pulse } from './rig';
import { Sculpt, horn, leaf, limb, organic, stripRig, taperTube, twist } from './shapes';
import { mulberry } from '../../util';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export function buildThornling(): Model {
  const kit = createKit(0xb8ff60);
  const b = pbrMaterialMaps(bark(), 1, 1.4);
  const wood = kit.rim({
    color: 0x8e6e4c, roughness: 0.8, map: b.map, normalMap: b.normalMap, normalScale: new THREE.Vector2(1.6, 1.6),
    emissive: 0xa8ff30, emissiveMap: veins(41, 3), emissiveIntensity: 0.22,
  }, 0xb0d878, 0.5);
  const strand = kit.rim({ color: 0x5a4430, roughness: 0.8, map: b.map, normalMap: b.normalMap }, 0x90b060, 0.3);
  const thorn = kit.std({ color: 0x1e140c, roughness: 0.35, metalness: 0.1 });
  const leafMat = kit.rim({ color: 0x5a9a2e, roughness: 0.6, side: THREE.DoubleSide }, 0x80c040, 0.25);
  const leafDry = kit.std({ color: 0x6a6a24, roughness: 0.7, side: THREE.DoubleSide });
  const dark = kit.std({ color: 0x050402, roughness: 1 });
  const eye = kit.glow(0xd8ff50, 7);
  const maw = kit.glow(0xa8ff30, 3);

  const j = buildHumanoid({ skin: wood }, {
    hipY: 0.55, thighL: 0.28, shinL: 0.27, thighR: 0.045, shinR: 0.035, torsoL: 0.36, chestW: 0.12, chestD: 0.1, waistW: 0.075,
    shoulderW: 0.14, upperL: 0.26, foreL: 0.27, upperR: 0.035, foreR: 0.028, handR: 0.035, neckL: 0.06, headR: 0.11,
  });
  stripRig(j.root);
  const P = j.P, S = new Sculpt('thornling').glow(eye).glow(maw).glow(leafMat).glow(leafDry);
  const r = mulberry(17);
  const lim = (len: number, r0: number, r1: number, b = 0, at = 0.35) => organic(limb(len, r0, r1, b, at, 10), r0 * 0.18, 26, len * 40);
  // a limb of braided twigs: a core and two strands winding round it
  const braid = (len: number, r0: number, r1: number, parentL: THREE.Object3D, parentR: THREE.Object3D, b = 0.25) => {
    S.pair(lim(len, r0, r1, b), wood, parentL, parentR);
    for (let k = 0; k < 2; k++) S.pair(twist(len * 0.95, (r0 + r1) * 0.45, r0 * 0.32, 0.8, k * Math.PI), strand, parentL, parentR);
  };
  const thornAt = (parent: THREE.Object3D, pos: [number, number, number], len: number, dir: THREE.Vector3, curl = -0.6) =>
    S.add(horn(len, len * 0.16, curl, V(1, 0, 0), dir), thorn, parent, pos);

  // --- legs: braided, a knot at the knee, three root toes and a spur behind
  braid(P.thighL, 0.058, 0.042, j.thighL, j.thighR, 0.3);
  braid(P.shinL, 0.044, 0.03, j.kneeL, j.kneeR, 0.2);
  S.pair(organic(new THREE.SphereGeometry(0.045, 10, 8), 0.012, 30, 3), wood, j.kneeL, j.kneeR, [0, 0, 0.01]);
  S.pair(organic(new THREE.SphereGeometry(1, 10, 8), 0.1, 4, 4), wood, j.ankleL, j.ankleR, [0, -0.015, 0.02], [0, 0, 0], [0.035, 0.028, 0.05]);
  for (const a of [-0.45, 0, 0.45]) {
    S.pair(taperTube([V(0, 0, 0), V(0, -0.012, 0.05), V(0, -0.03, 0.09), V(0, -0.038, 0.12)], (t) => 0.014 * (1 - t * 0.85), 8, 5), strand, j.ankleL, j.ankleR, [0, -0.01, 0.02], [0, a, 0]);
  }
  S.pair(horn(0.07, 0.012, 0.5, V(1, 0, 0), V(0, 0.3, -1)), thorn, j.ankleL, j.ankleR, [0, 0.0, -0.02]);

  // --- body: a knot of a pelvis, a twisted trunk of a waist, a cage of twigs round a glowing sap heart
  S.add(organic(new THREE.SphereGeometry(1, 12, 10), 0.12, 4, 5), wood, j.hips, [0, 0.01, 0], [0, 0, 0], [0.085, 0.06, 0.07]);
  S.add(lim(0.2, 0.045, 0.06, 0.1), wood, j.spine, [0, 0.19, 0], [Math.PI, 0, 0]);
  for (let k = 0; k < 3; k++) S.add(twist(0.2, 0.05, 0.014, 0.7, k * 2.1), strand, j.spine, [0, 0.2, 0]);
  S.add(organic(new THREE.SphereGeometry(1, 16, 12), 0.1, 4, 6), wood, j.chest, [0, 0.08, -0.03], [0, 0, 0], [0.135, 0.13, 0.09]);
  S.add(new THREE.SphereGeometry(0.028, 12, 10), maw, j.chest, [0, 0.07, 0.01]);
  for (let i = 0; i < 4; i++) {
    const y = 0.0 + i * 0.045, w = 0.1 - Math.abs(i - 1.5) * 0.012;
    for (const s of [1, -1]) S.add(taperTube([V(0, 0, -0.02), V(s * w * 0.9, 0.01, 0.03), V(s * w * 0.5, 0.02, 0.085), V(s * 0.012, 0.025, 0.095)], (t) => 0.011 * (1 - t * 0.5), 10, 5), strand, j.chest, [0, y, 0]);
  }
  // thorns down the back, raking backwards
  for (let i = 0; i < 6; i++) thornAt(j.chest, [(r() - 0.5) * 0.06, 0.2 - i * 0.05, -0.08], 0.09 + r() * 0.07, V((r() - 0.5) * 0.6, 0.5, -1));
  for (let i = 0; i < 3; i++) thornAt(j.spine, [0, 0.16 - i * 0.05, -0.05], 0.06, V(0, 0.4, -1));

  // --- head: a gourd of wood carved into a snarl
  S.add(lim(0.1, 0.028, 0.035), wood, j.neck, [0, 0.08, 0], [Math.PI, 0, 0]);
  S.add(organic(new THREE.SphereGeometry(1, 18, 14), 0.08, 5, 7), wood, j.head, [0, 0.1, 0], [0, 0, 0], [0.105, 0.125, 0.105]);
  S.add(organic(new THREE.SphereGeometry(1, 12, 8), 0.1, 6, 8), wood, j.head, [0, 0.148, 0.075], [0.3, 0, 0], [0.09, 0.025, 0.045]);
  S.pair(new THREE.SphereGeometry(1, 10, 8), dark, j.head, null, [0.042, 0.118, 0.094], [0, 0.3, -0.3], [0.03, 0.02, 0.014]);
  S.pair(new THREE.SphereGeometry(1, 10, 8), eye, j.head, null, [0.042, 0.118, 0.104], [0, 0.3, -0.3], [0.017, 0.012, 0.008]);
  const jaw = joint(j.head, 0, 0.06, 0.02);
  S.add(organic(new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, Math.PI * 0.4, Math.PI * 0.6), 0.1, 6, 9), wood, jaw, [0, 0.0, 0.03], [0, 0, 0], [0.085, 0.06, 0.08]);
  S.add(new THREE.SphereGeometry(1, 12, 8), maw, j.head, [0, 0.06, 0.07], [0, 0, 0], [0.055, 0.012, 0.03]);
  for (let i = -3; i <= 3; i++) {
    S.add(new THREE.ConeGeometry(0.006, 0.03 + (i % 2 ? 0.01 : 0), 4), thorn, j.head, [i * 0.014, 0.055, 0.09 - Math.abs(i) * 0.006], [Math.PI, 0, 0]);
    S.add(new THREE.ConeGeometry(0.006, 0.028, 4), thorn, jaw, [i * 0.014 + 0.007, 0.005, 0.1 - Math.abs(i) * 0.007]);
  }
  // crown: thorny branches in leaf, sweeping back
  const crown = joint(j.head, 0, 0.2, -0.01);
  for (let i = 0; i < 5; i++) {
    const a = (i / 4 - 0.5) * 1.8, dir = V(Math.sin(a) * 0.8, 1, -0.6 - r() * 0.3);
    const len = 0.16 + r() * 0.08;
    S.add(horn(len, 0.02, -0.7, V(Math.cos(a), 0, 0), dir), strand, crown, [Math.sin(a) * 0.05, 0, 0]);
    const tip = dir.clone().normalize().multiplyScalar(len * 0.85).add(V(Math.sin(a) * 0.05, 0, 0));
    for (let k = 0; k < 2; k++) S.add(leaf(0.1 + r() * 0.05, 0.05, 0.4, 0.4), k ? leafMat : leafDry, crown, [tip.x, tip.y, tip.z], [-0.6 - r() * 0.6, a + (k - 0.5) * 1.6, (k - 0.5) * 0.8]);
  }
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    S.add(leaf(0.12 + r() * 0.06, 0.055), i % 3 ? leafMat : leafDry, crown, [Math.sin(a) * 0.04, -0.02, Math.cos(a) * 0.04], [-0.9, a, 0]);
  }
  thornAt(j.head, [0.08, 0.14, 0.02], 0.08, V(1, 0.6, 0), 0.4);
  thornAt(j.head, [-0.08, 0.14, 0.02], 0.08, V(-1, 0.6, 0), -0.4);

  // --- arms: long and braided, thorns on the forearms, hooked twig claws
  S.pair(organic(new THREE.SphereGeometry(0.04, 10, 8), 0.01, 30, 10), wood, j.shoulderL, j.shoulderR);
  braid(P.upperL, 0.04, 0.03, j.shoulderL, j.shoulderR);
  braid(P.foreL, 0.034, 0.024, j.elbowL, j.elbowR, 0.15);
  for (let i = 0; i < 3; i++) {
    S.pair(horn(0.07 - i * 0.012, 0.011, -0.5, V(1, 0, 0), V(0.3, -0.4, -1)), thorn, j.elbowL, j.elbowR, [0.01, -0.05 - i * 0.07, -0.02]);
  }
  S.pair(organic(new THREE.SphereGeometry(1, 10, 8), 0.1, 5, 11), wood, j.handL, j.handR, [0, -0.02, 0], [0, 0, 0], [0.03, 0.035, 0.022]);
  for (let f = 0; f < 3; f++) {
    const c = taperTube([V(0, 0, 0), V(0, -0.07, 0.01), V(0, -0.13, 0.04), V(0, -0.15, 0.085)], (t) => 0.009 * (1 - t * 0.85), 10, 5);
    S.pair(c, thorn, j.handL, j.handR, [(f - 1) * 0.018, -0.04, 0.005], [0, 0, (f - 1) * 0.18]);
  }

  // --- vine tail with a spray of leaves
  const tail: THREE.Group[] = [];
  let parent: THREE.Object3D = j.hips;
  for (let i = 0; i < 5; i++) {
    const tj = joint(parent, 0, 0, i === 0 ? -0.06 : -0.075);
    S.add(limb(0.08, 0.016 * (1 - i * 0.12), 0.014 * (1 - i * 0.12)), strand, tj, [0, 0, 0], [Math.PI / 2, 0, 0]);
    if (i % 2) S.add(leaf(0.06, 0.03), leafMat, tj, [0, 0.01, -0.04], [-0.3, 0, (i - 2) * 0.8]);
    tail.push(tj); parent = tj;
  }
  for (let k = 0; k < 3; k++) S.add(leaf(0.1, 0.045), k === 1 ? leafDry : leafMat, parent, [0, 0, -0.07], [-Math.PI / 2 + (k - 1) * 0.3, 0, (k - 1) * 0.9]);
  S.build();

  const root = j.root;

  function animate(st: AnimState): void {
    const { t } = st;
    resetPose(j);
    walkCycle(j, st.phase, st.move, { stride: 0.9, knee: 1.35, arm: 0.5, bob: 0.12 });
    // crouched, arms trailing like a sprinter
    j.spine.rotation.x += 0.45 + st.move * 0.2; j.neck.rotation.x += -0.5;
    j.shoulderL.rotation.set(j.shoulderL.rotation.x + 0.4, 0, 0.35); j.shoulderR.rotation.set(j.shoulderR.rotation.x + 0.4, 0, -0.35);
    j.elbowL.rotation.x += -0.6; j.elbowR.rotation.x += -0.6;
    j.head.rotation.z += Math.sin(t * 9) * 0.08 * (1 - st.move);
    j.body.position.y += Math.abs(Math.sin(st.phase)) * 0.06 * st.move;
    jaw.rotation.x = 0.08 + Math.max(0, Math.sin(t * 2.1)) * 0.2;
    crown.rotation.z = Math.sin(t * 3.1) * 0.05; crown.rotation.x = Math.sin(t * 2.3) * 0.05 - st.move * 0.1;
    for (let i = 0; i < tail.length; i++) {
      tail[i].rotation.x = i === 0 ? 0.9 + Math.sin(t * 7) * 0.12 : -0.28 + Math.sin(t * 5 - i) * 0.1;
      tail[i].rotation.y = Math.sin(t * 5 - i * 0.8) * 0.3;
    }
    const a = st.action;
    if (a && a.name === 'attack') {
      // leap-slash with both claws
      const k = a.t;
      const wind = ramp(k, 0, 0.5) * (1 - ramp(k, 0.55, 0.7));
      const strike = ramp(k, 0.55, 0.68) * (1 - ramp(k, 0.8, 1));
      j.shoulderL.rotation.x += -2.4 * wind + 0.8 * strike; j.shoulderR.rotation.x += -2.4 * wind + 0.8 * strike;
      j.spine.rotation.x += -0.35 * wind + 0.55 * strike;
      j.kneeL.rotation.x += 0.5 * wind; j.kneeR.rotation.x += 0.5 * wind;
      j.body.position.y += -0.08 * wind + 0.1 * strike;
      j.body.position.z += strike * 0.3;
      jaw.rotation.x += 0.45 * pulse(k, 0.3, 0.85);
    }
    if (st.hit > 0) { j.spine.rotation.x += -0.5 * st.hit; jaw.rotation.x += 0.3 * st.hit; }
    if (st.dead >= 0) deathFall(j, st.dead, 1);
  }

  return { root, kit, joints: j, animate, height: 1.1, dispose() { kit.dispose(); } };
}
