// Thornling: small, quick twig creature with a leafy crown, thorned limbs and long claws.
import * as THREE from 'three';
import { createKit } from '../../core/materials';
import { bark, pbrMaterialMaps } from '../../core/textures';
import type { AnimState, Model } from '../../types';
import { buildHumanoid, part, joint, resetPose, walkCycle, deathFall, ramp } from './rig';
import { rand } from '../../util';

export function buildThornling(): Model {
  const kit = createKit(0xb8ff60);
  const b = pbrMaterialMaps(bark(), 1, 1.4);
  const wood = kit.std({ color: 0xb09070, roughness: 0.9, map: b.map, normalMap: b.normalMap, normalScale: new THREE.Vector2(1.4, 1.4) });
  const thorn = kit.std({ color: 0x241a12, roughness: 0.5 });
  const leaf = kit.std({ color: 0x4a7a26, roughness: 0.8, side: THREE.DoubleSide, flatShading: true });
  const eye = kit.glow(0xd8ff50, 6);

  const j = buildHumanoid({ skin: wood, feet: thorn, hands: thorn }, {
    hipY: 0.55, thighL: 0.28, shinL: 0.27, thighR: 0.045, shinR: 0.035, torsoL: 0.36, chestW: 0.12, chestD: 0.1, waistW: 0.075,
    shoulderW: 0.14, upperL: 0.26, foreL: 0.27, upperR: 0.035, foreR: 0.028, handR: 0.035, neckL: 0.06, headR: 0.11,
  });
  // head: a knotted gourd of wood with a split mouth
  part(new THREE.SphereGeometry(0.13, 12, 10).scale(0.9, 1.15, 1), wood, j.head, 0, 0.1, 0.01);
  part(new THREE.BoxGeometry(0.12, 0.012, 0.03), thorn, j.head, 0, 0.04, 0.115).castShadow = false;
  for (const s of [1, -1]) part(new THREE.SphereGeometry(0.025, 8, 6), eye, j.head, s * 0.05, 0.12, 0.11).castShadow = false;
  // leafy crown
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const lf = part(new THREE.ConeGeometry(0.05, 0.2, 3).scale(1, 1, 0.25), leaf, j.head, Math.cos(a) * 0.06, 0.24, Math.sin(a) * 0.06);
    lf.rotation.set(Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7);
    lf.castShadow = false;
  }
  // twig spikes along the back and the forearms
  for (let i = 0; i < 5; i++) part(new THREE.ConeGeometry(0.018, 0.12, 4).rotateX(-0.7), thorn, j.chest, rand(-0.04, 0.04), 0.16 - i * 0.07, -0.09);
  for (const elbow of [j.elbowL, j.elbowR]) for (let i = 0; i < 3; i++) {
    const t = part(new THREE.ConeGeometry(0.012, 0.08, 4).rotateX(-1.2), thorn, elbow, 0, -0.06 - i * 0.07, -0.03);
    t.castShadow = false;
  }
  // long claws
  for (const hand of [j.handL, j.handR]) for (let i = -1; i <= 1; i++) {
    const c = part(new THREE.ConeGeometry(0.012, 0.14, 4).rotateX(Math.PI), thorn, hand, i * 0.02, -0.12, 0.02);
    c.castShadow = false;
  }
  // a leafy tail-sprig
  const sprig = joint(j.hips, 0, 0.02, -0.08);
  part(new THREE.CylinderGeometry(0.01, 0.02, 0.26, 5).translate(0, 0.13, 0), wood, sprig).castShadow = false;
  part(new THREE.ConeGeometry(0.06, 0.16, 3).scale(1, 1, 0.3), leaf, sprig, 0, 0.28, 0).castShadow = false;

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
    sprig.rotation.x = -1.1 + Math.sin(t * 7) * 0.2; sprig.rotation.z = Math.sin(t * 5) * 0.3;
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
    }
    if (st.hit > 0) j.spine.rotation.x += -0.5 * st.hit;
    if (st.dead >= 0) deathFall(j, st.dead, 1);
  }

  return { root, kit, joints: j, animate, height: 1.1, dispose() { kit.dispose(); } };
}
