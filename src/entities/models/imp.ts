// Voidling: small, fast horned imp with a whipping tail.
import * as THREE from 'three';
import { createKit } from '../../core/materials';
import { grunge, pbrMaterialMaps } from '../../core/textures';
import type { AnimState, Model } from '../../types';
import { buildHumanoid, part, joint, resetPose, walkCycle, deathFall, ramp } from './rig';

export function buildImp(): Model {
  const kit = createKit(0xff60ff);
  const g = pbrMaterialMaps(grunge(), 2, 1);
  const skin = kit.std({ color: 0x4a1a2e, roughness: 0.55, normalMap: g.normalMap, normalScale: new THREE.Vector2(1.2, 1.2), map: g.map });
  const horn = kit.std({ color: 0x1a1210, roughness: 0.4 });
  const claw = kit.std({ color: 0xd8ccb0, roughness: 0.35 });
  const eye = kit.glow(0xfff040, 7);
  const belly = kit.std({ color: 0x7a3040, roughness: 0.6 });

  const j = buildHumanoid({ skin, torso: skin, legs: skin, feet: horn, arms: skin, hands: claw }, {
    hipY: 0.52, thighL: 0.26, shinL: 0.24, thighR: 0.06, shinR: 0.045, torsoL: 0.34, chestW: 0.15, chestD: 0.12, waistW: 0.11,
    shoulderW: 0.16, upperL: 0.2, foreL: 0.2, upperR: 0.04, foreR: 0.033, handR: 0.045, neckL: 0.05, headR: 0.13,
  });
  part(new THREE.SphereGeometry(0.1, 12, 8).scale(1, 1.2, 0.6), belly, j.chest, 0, 0.0, 0.06);
  // head
  part(new THREE.SphereGeometry(0.15, 16, 12).scale(1, 0.9, 1.1), skin, j.head, 0, 0.1, 0.02);
  part(new THREE.ConeGeometry(0.08, 0.14, 8).rotateX(Math.PI / 2), skin, j.head, 0, 0.06, 0.15);
  for (const s of [1, -1]) {
    part(new THREE.SphereGeometry(0.028, 8, 6), eye, j.head, s * 0.06, 0.13, 0.13).castShadow = false;
    const h = part(new THREE.ConeGeometry(0.035, 0.26, 8), horn, j.head, s * 0.09, 0.24, -0.02);
    h.rotation.set(-0.5, 0, -s * 0.5);
    const ear = part(new THREE.ConeGeometry(0.04, 0.16, 4), skin, j.head, s * 0.15, 0.12, -0.02);
    ear.rotation.z = -s * 1.2;
  }
  // claws
  for (const hand of [j.handL, j.handR]) for (let i = -1; i <= 1; i++) {
    const c = part(new THREE.ConeGeometry(0.01, 0.08, 4).rotateX(Math.PI), claw, hand, i * 0.018, -0.1, 0.02);
    c.castShadow = false;
  }
  // spine ridges
  for (let i = 0; i < 4; i++) part(new THREE.ConeGeometry(0.025, 0.09, 4).rotateX(-0.6), horn, j.chest, 0, 0.15 - i * 0.08, -0.1);
  // tail: chain of joints
  const tail: THREE.Group[] = []
  let parent = j.hips;
  for (let i = 0; i < 7; i++) {
    const tj = joint(parent, 0, i === 0 ? 0 : 0, i === 0 ? -0.1 : -0.1);
    part(new THREE.SphereGeometry(0.035 * (1 - i * 0.1), 8, 6).scale(1, 1, 2), skin, tj, 0, 0, -0.05);
    tail.push(tj); parent = tj;
  }
  part(new THREE.ConeGeometry(0.04, 0.1, 4).rotateX(-Math.PI / 2), horn, parent, 0, 0, -0.12);

  const root = j.root;

  function animate(st: AnimState): void {
    const { t } = st;
    resetPose(j);
    walkCycle(j, st.phase, st.move, { stride: 0.85, knee: 1.3, arm: 0.6, bob: 0.12 });
    j.spine.rotation.x += 0.35 + st.move * 0.2; j.neck.rotation.x += -0.4;
    j.shoulderL.rotation.z += 0.3; j.shoulderR.rotation.z += -0.3;
    j.elbowL.rotation.x += -0.8; j.elbowR.rotation.x += -0.8;
    j.body.position.y += Math.abs(Math.sin(st.phase)) * 0.08 * st.move;
    for (let i = 0; i < tail.length; i++) {
      tail[i].rotation.y = Math.sin(t * 6 - i * 0.7) * 0.25;
      tail[i].rotation.x = i === 0 ? -0.5 : 0.18 + Math.sin(t * 4 - i) * 0.08;
    }
    const a = st.action;
    if (a && a.name === 'attack') {
      const k = a.t;
      const wind = ramp(k, 0, 0.5) * (1 - ramp(k, 0.55, 0.7));
      const strike = ramp(k, 0.55, 0.7) * (1 - ramp(k, 0.8, 1));
      j.shoulderR.rotation.x += -2.2 * wind + 0.6 * strike; j.shoulderR.rotation.z += -0.4 * wind;
      j.shoulderL.rotation.x += -1.0 * strike;
      j.spine.rotation.x += -0.3 * wind + 0.5 * strike;
      j.body.position.z += strike * 0.25;
    }
    if (st.hit > 0) j.spine.rotation.x += -0.5 * st.hit;
    if (st.dead >= 0) deathFall(j, st.dead, 1);
  }

  return { root, kit, joints: j, animate, height: 1.1, dispose() { kit.dispose(); } };
}
