// Hollow Husk: a gaunt, hunched corpse animated by arcane crystal. Its skin has split over a bare
// ribcage, crystals erupt from its back and shoulder, glowing veins run where they took root; a
// rotted shroud hangs off its shoulders, a broken shackle and chain swing from one wrist.
import * as THREE from 'three';
import { createKit } from '../../core/materials';
import { grunge, pbrMaterialMaps, veins } from '../../core/textures';
import { buildHumanoid, joint, resetPose, walkCycle, idle, deathFall, pulse, ramp } from './rig';
import { Sculpt, bend, limb, organic, rag, stripRig, taperTube } from './shapes';
import type { AnimState, Model } from '../../types';
import { mulberry } from '../../util';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export function buildHusk(): Model {
  const kit = createKit(0x7dffd0);
  const g = pbrMaterialMaps(grunge(), 2, 1);
  // grey dead skin, a cold sheen at glancing angles, and glowing veins where the crystals took root
  const flesh = kit.rim({
    color: 0x7a7466, roughness: 0.78, map: g.map, normalMap: g.normalMap, normalScale: new THREE.Vector2(1.6, 1.6),
    emissive: 0x2affd0, emissiveMap: veins(11), emissiveIntensity: 0.7,
  }, 0x5a8a80, 0.35);
  const bone = kit.std({ color: 0xd4c6a4, roughness: 0.55, normalMap: g.normalMap, normalScale: new THREE.Vector2(0.6, 0.6) });
  const socket = kit.std({ color: 0x060504, roughness: 1 });
  const cloth = kit.std({ color: 0x4a3c30, roughness: 0.95, map: g.map, normalMap: g.normalMap, side: THREE.DoubleSide });
  const iron = kit.std({ color: 0x4a4744, metalness: 0.85, roughness: 0.55, roughnessMap: g.roughnessMap });
  const crystal = kit.phys({ color: 0x2ad6c0, emissive: 0x19e8c8, emissiveIntensity: 1.5, roughness: 0.08, clearcoat: 1, flatShading: true });
  const core = kit.glow(0x7affe6, 3.2);
  const eye = kit.glow(0xffa030, 8);

  const j = buildHumanoid({ skin: flesh }, {
    hipY: 0.98, thighR: 0.07, shinR: 0.055, chestW: 0.19, chestD: 0.12, waistW: 0.12,
    upperL: 0.36, foreL: 0.34, upperR: 0.045, foreR: 0.038, handR: 0.06, headR: 0.11,
  });
  stripRig(j.root);
  const P = j.P, S = new Sculpt('husk').glow(core).glow(eye);
  const r = mulberry(7);
  // sinew and knots under the skin
  const lim = (len: number, r0: number, r1: number, b = 0, at = 0.35) => organic(limb(len, r0, r1, b, at), r0 * 0.12, 28, len * 100);

  // --- legs: wasted thighs, knobbly knees, long bony feet
  S.pair(lim(P.thighL, 0.072, 0.048, 0.22, 0.3), flesh, j.thighL, j.thighR);
  S.pair(new THREE.SphereGeometry(0.042, 10, 8), bone, j.kneeL, j.kneeR, [0, 0.01, 0.035], [0, 0, 0], [1, 1.1, 0.8]);
  S.pair(lim(P.shinL, 0.05, 0.032, 0.28, 0.22), flesh, j.kneeL, j.kneeR);
  S.pair(organic(new THREE.SphereGeometry(1, 12, 8), 0.12, 3, 3), flesh, j.ankleL, j.ankleR, [0, -0.035, 0.05], [0, 0, 0], [0.045, 0.03, 0.11]);
  for (const x of [-0.025, 0, 0.025]) {
    S.pair(taperTube([V(0, 0, 0), V(0, -0.01, 0.05), V(0, -0.03, 0.08)], (t) => 0.012 * (1 - t * 0.7)), bone, j.ankleL, j.ankleR, [x, -0.03, 0.13]);
  }

  // --- pelvis and a starved waist, the spine showing through the back
  S.add(organic(new THREE.SphereGeometry(1, 16, 10), 0.08, 3, 1), flesh, j.hips, [0, 0.02, 0], [0, 0, 0], [0.13, 0.09, 0.09]);
  S.pair(new THREE.SphereGeometry(1, 10, 8), bone, j.hips, null, [0.1, 0.05, 0.01], [0, 0, 0.5], [0.05, 0.06, 0.035]);
  S.add(organic(new THREE.SphereGeometry(1, 14, 10), 0.1, 4, 2), flesh, j.spine, [0, 0.1, -0.01], [0, 0, 0], [0.095, 0.14, 0.07]);
  for (let i = 0; i < 5; i++) S.add(new THREE.SphereGeometry(0.022 - i * 0.001, 8, 6), bone, j.spine, [0, 0.02 + i * 0.05, -0.065], [0, 0, 0], [1, 0.8, 1]);

  // --- chest: the skin has split open over the ribs; a crystal glows inside the cage
  S.add(organic(new THREE.SphereGeometry(1, 18, 12), 0.08, 3, 4), flesh, j.chest, [0, 0.1, -0.035], [0, 0, 0], [0.15, 0.2, 0.09]);
  S.add(new THREE.OctahedronGeometry(0.05, 0), core, j.chest, [0, 0.08, 0.03], [0.3, 0.5, 0], [0.8, 1.4, 0.8]);
  for (let i = 0; i < 6; i++) {
    const y = 0.23 - i * 0.045, a = 0.15 - Math.abs(i - 1.5) * 0.012, dz = i > 3 ? -0.02 : 0;
    S.pair(taperTube([V(0.03, y + 0.01, -0.085), V(a * 0.8, y, -0.06), V(a, y - 0.015, 0.015 + dz), V(a * 0.7, y - 0.035, 0.09 + dz), V(0.03, y - 0.05, 0.1 + dz)],
      (t) => 0.011 * (1 - t * 0.3), 14, 6), bone, j.chest, null);
  }
  S.add(new THREE.BoxGeometry(0.035, 0.2, 0.02), bone, j.chest, [0, 0.14, 0.1], [0.12, 0, 0]);
  S.pair(taperTube([V(0.02, 0.27, 0.08), V(0.1, 0.29, 0.05), V(0.2, 0.3, 0)], () => 0.012, 8, 6), bone, j.chest, null);
  // crystals erupting from the upper back and right shoulder
  const shard = (len: number) => new THREE.OctahedronGeometry(0.06, 0).scale(0.6, len, 0.6);
  for (let i = 0; i < 9; i++) {
    const x = (r() - 0.5) * 0.24, y = 0.12 + r() * 0.2, len = 1.6 + r() * 2.2;
    S.add(shard(len), crystal, j.chest, [x, y, -0.08], [-0.5 - r() * 0.7, r() * 3, -x * 3]);
  }
  S.add(shard(3.2), crystal, j.chest, [0.02, 0.2, -0.1], [-0.9, 0.4, 0.1], 1.3);
  S.add(shard(2.4), crystal, j.shoulderR, [-0.02, 0.07, 0], [0, 0, 0.7]);
  S.add(shard(1.6), crystal, j.shoulderR, [-0.05, 0.03, -0.03], [-0.4, 0, 1.1]);
  S.add(shard(1.2), crystal, j.elbowR, [-0.03, -0.1, -0.02], [0, 0, 1.3]);

  // --- neck and skull
  S.add(limb(P.neckL + 0.08, 0.035, 0.04), flesh, j.neck, [0, P.neckL + 0.02, 0], [Math.PI, 0, 0]);
  S.add(organic(new THREE.SphereGeometry(1, 18, 14), 0.06, 5, 5), bone, j.head, [0, 0.12, -0.005], [0, 0, 0], [0.098, 0.108, 0.118]);
  S.add(new THREE.SphereGeometry(1, 12, 8), bone, j.head, [0, 0.06, 0.06], [0, 0, 0], [0.075, 0.06, 0.06]);   // cheeks and maxilla
  S.pair(new THREE.SphereGeometry(1, 10, 6), bone, j.head, null, [0.04, 0.132, 0.085], [0, 0, -0.25], [0.045, 0.018, 0.03]);  // brow
  S.pair(new THREE.SphereGeometry(1, 10, 6), bone, j.head, null, [0.06, 0.075, 0.075], [0, 0, 0], [0.028, 0.02, 0.03]);      // cheekbones
  S.pair(new THREE.SphereGeometry(0.028, 10, 8), socket, j.head, null, [0.037, 0.105, 0.09], [0, 0, 0], [1, 0.85, 0.6]);
  S.pair(new THREE.SphereGeometry(0.011, 8, 6), eye, j.head, null, [0.036, 0.103, 0.1]);
  S.add(new THREE.ConeGeometry(0.014, 0.03, 3), socket, j.head, [0, 0.075, 0.113], [Math.PI + 0.3, 0, 0]);
  for (let i = -3; i <= 3; i++) S.add(new THREE.ConeGeometry(0.007, 0.025, 4), bone, j.head, [i * 0.011, 0.038, 0.105 - Math.abs(i) * 0.005], [Math.PI, 0, 0]);
  const jaw = joint(j.head, 0, 0.055, 0.0);
  S.add(organic(new THREE.BoxGeometry(0.1, 0.03, 0.1, 3, 1, 3), 0.004, 20, 6), bone, jaw, [0, -0.035, 0.05]);
  for (let i = -3; i <= 3; i++) S.add(new THREE.ConeGeometry(0.007, 0.022, 4), bone, jaw, [i * 0.011, -0.012, 0.095 - Math.abs(i) * 0.005]);

  // --- arms: long and thin, fingers like roots
  S.pair(new THREE.SphereGeometry(0.05, 10, 8), bone, j.shoulderL, j.shoulderR, [0, 0.01, 0]);
  S.pair(lim(P.upperL, 0.048, 0.034, 0.2), flesh, j.shoulderL, j.shoulderR);
  S.pair(new THREE.SphereGeometry(0.03, 8, 6), bone, j.elbowL, j.elbowR, [0, 0, -0.025]);
  S.pair(lim(P.foreL, 0.036, 0.026, 0.25, 0.25), flesh, j.elbowL, j.elbowR);
  S.pair(organic(new THREE.SphereGeometry(1, 10, 8), 0.1, 4, 8), flesh, j.handL, j.handR, [0, -0.04, 0.005], [0, 0, 0], [0.04, 0.05, 0.022]);
  for (let f = 0; f < 4; f++) {
    const x = (f - 1.5) * 0.017, len = f === 0 || f === 3 ? 0.085 : 0.1;
    const finger = taperTube([V(0, 0, 0), V(0, -len * 0.5, 0.012), V(0, -len, 0.035), V(0, -len * 1.2, 0.065)], (t) => 0.009 * (1 - t * 0.75), 10, 6);
    S.pair(finger, bone, j.handL, j.handR, [x, -0.075, 0.005]);
  }
  S.pair(taperTube([V(0, 0, 0), V(0, -0.03, 0.02), V(0, -0.05, 0.05)], (t) => 0.01 * (1 - t * 0.7), 8, 6), bone, j.handL, j.handR, [0.035, -0.05, 0.015], [0, 0, 0.6]);
  // a broken shackle on the left wrist, its chain swinging free
  S.add(new THREE.TorusGeometry(0.045, 0.014, 6, 14), iron, j.elbowL, [0, -P.foreL + 0.03, 0], [Math.PI / 2, 0, 0]);
  const chain: THREE.Group[] = [];
  let link: THREE.Object3D = joint(j.elbowL, 0, -P.foreL + 0.02, -0.04);
  for (let i = 0; i < 4; i++) {
    const lj = joint(link, 0, i === 0 ? 0 : -0.055, 0);
    S.add(new THREE.TorusGeometry(0.022, 0.007, 5, 10), iron, lj, [0, -0.028, 0], [0, i % 2 ? Math.PI / 2 : 0, 0], [0.8, 1.35, 1]);
    chain.push(lj); link = lj;
  }

  // --- the shroud: torn strips off the shoulders and the hips, each swaying on its own joint
  const strips: { j: THREE.Group; ph: number; amp: number }[] = [];
  const strip = (parent: THREE.Object3D, x: number, y: number, z: number, ry: number, w: number, h: number, seed: number, tilt = 0) => {
    const sj = joint(parent, x, y, z);
    sj.rotation.y = ry;
    S.add(bend(rag(w, h, seed), 0.3), cloth, sj, [0, 0, 0], [tilt, 0, 0]);
    strips.push({ j: sj, ph: seed * 1.7, amp: 0.1 + h * 0.2 });
  };
  strip(j.head, 0, 0.17, -0.07, 0, 0.16, 0.42, 7, 0.35);
  strip(j.chest, 0, 0.28, -0.11, 0, 0.3, 0.52, 1, 0.25);
  strip(j.chest, 0.15, 0.27, -0.05, 0.9, 0.16, 0.4, 2, 0.3);
  strip(j.chest, -0.15, 0.27, -0.05, -0.9, 0.16, 0.36, 3, 0.3);
  strip(j.hips, 0, 0.03, 0.1, 0, 0.18, 0.42, 4, -0.1);
  strip(j.hips, 0, 0.03, -0.1, Math.PI, 0.22, 0.46, 5, -0.1);
  S.add(new THREE.TorusGeometry(0.125, 0.018, 6, 20), cloth, j.hips, [0, 0.04, 0], [Math.PI / 2, 0, 0], [1, 0.75, 1]);
  S.build();

  const root = j.root;
  root.scale.setScalar(1.05);

  function animate(st: AnimState): void {
    const { t } = st;
    resetPose(j);
    idle(j, t * 0.8, 1 - st.move);
    walkCycle(j, st.phase, st.move, { stride: 0.42, knee: 0.8, arm: 0.2, bob: 0.08 });
    // hunched, arms reaching forward, the head lolling
    j.spine.rotation.x += 0.35; j.chest.rotation.x += 0.15; j.neck.rotation.x += -0.35; j.head.rotation.x += -0.1;
    j.shoulderL.rotation.x += -0.7 + Math.sin(t * 2.3) * 0.12; j.shoulderR.rotation.x += -0.6 + Math.sin(t * 2.1 + 1) * 0.12;
    j.elbowL.rotation.x += -0.3; j.elbowR.rotation.x += -0.35;
    j.head.rotation.z += Math.sin(t * 1.3) * 0.15;
    jaw.rotation.x = 0.18 + Math.sin(t * 5) * 0.1 + Math.max(0, Math.sin(t * 0.9)) * 0.15;

    const a = st.action;
    if (a && a.name === 'attack') {
      const k = a.t;
      const up = ramp(k, 0, 0.55) * (1 - ramp(k, 0.6, 0.75));
      const swing = ramp(k, 0.6, 0.75) * (1 - ramp(k, 0.8, 1));
      j.shoulderL.rotation.x += -1.9 * up + 0.4 * swing; j.shoulderR.rotation.x += -1.7 * up + 0.4 * swing;
      j.spine.rotation.x += -0.25 * up + 0.45 * swing;
      jaw.rotation.x += 0.5 * pulse(k, 0.4, 0.8);
    }
    if (st.hit > 0) j.spine.rotation.x += -0.4 * st.hit;
    if (st.dead >= 0) deathFall(j, st.dead, 1);

    // the chain hangs from the wrist: undo the arm's swing so it keeps pointing down, and trail it
    const arm = j.shoulderL.rotation.x + j.elbowL.rotation.x + j.spine.rotation.x + j.chest.rotation.x;
    chain.forEach((c, i) => {
      c.rotation.x = (i === 0 ? -arm : 0) + Math.sin(t * 3.1 - i * 0.6) * 0.12 + st.move * 0.15;
      c.rotation.z = Math.sin(t * 2.3 - i * 0.5) * 0.1;
    });
    for (const s of strips) s.j.rotation.x = Math.sin(t * 2.2 + s.ph) * s.amp * 0.5 + st.move * s.amp;
    crystal.emissiveIntensity = 1.3 + Math.sin(t * 2.4) * 0.35;
    core.emissiveIntensity = 3 + Math.sin(t * 2.4) * 1;
  }

  return { root, kit, joints: j, animate, height: 1.9, dispose() { kit.dispose(); } };
}
