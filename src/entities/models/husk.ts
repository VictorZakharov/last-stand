// Hollow Husk: gaunt, hunched undead with arcane crystals erupting from its back.
import * as THREE from 'three';
import { createKit } from '../../core/materials';
import { grunge, pbrMaterialMaps } from '../../core/textures';
import { buildHumanoid, part, joint, resetPose, walkCycle, idle, deathFall, pulse, ramp } from './rig';
import type { AnimState, Model } from '../../types';
import { rand } from '../../util';

export function buildHusk(): Model {
  const kit = createKit(0x7dffd0);
  const g = pbrMaterialMaps(grunge(), 2, 1);
  const flesh = kit.std({ color: 0x5d5a50, roughness: 0.85, map: g.map, normalMap: g.normalMap, normalScale: new THREE.Vector2(1.5, 1.5) });
  const rags = kit.std({ color: 0x241f1c, roughness: 0.95, side: THREE.DoubleSide, normalMap: g.normalMap });
  const bone = kit.std({ color: 0xa89c84, roughness: 0.7 });
  const crystal = kit.phys({ color: 0x2ad6c0, emissive: 0x19e8c8, emissiveIntensity: 1.6, roughness: 0.1, clearcoat: 1, flatShading: true });
  const eye = kit.glow(0xffa030, 6);

  const j = buildHumanoid({ skin: flesh, torso: flesh, legs: flesh, feet: flesh, arms: flesh, hands: bone }, {
    hipY: 0.98, thighR: 0.07, shinR: 0.055, chestW: 0.19, chestD: 0.12, waistW: 0.12,
    upperL: 0.36, foreL: 0.34, upperR: 0.045, foreR: 0.038, handR: 0.06, headR: 0.11,
  });
  // head: skull-like with jaw
  part(new THREE.SphereGeometry(0.115, 14, 10).scale(0.9, 1, 1.05), flesh, j.head, 0, 0.1, 0);
  const jaw = joint(j.head, 0, 0.04, 0.03);
  part(new THREE.BoxGeometry(0.1, 0.04, 0.1), bone, jaw, 0, -0.03, 0.03);
  for (const s of [1, -1]) part(new THREE.SphereGeometry(0.018, 6, 6), eye, j.head, s * 0.04, 0.12, 0.095).castShadow = false;
  // ribs
  for (let i = 0; i < 4; i++) part(new THREE.TorusGeometry(0.15 - i * 0.012, 0.012, 4, 12, Math.PI).rotateX(Math.PI / 2).rotateY(Math.PI / 2 - Math.PI / 2), bone, j.chest, 0, 0.12 - i * 0.06, 0.0);
  // loincloth
  part(new THREE.PlaneGeometry(0.2, 0.4, 1, 3).translate(0, -0.2, 0), rags, j.hips, 0, 0, 0.12);
  part(new THREE.PlaneGeometry(0.22, 0.45, 1, 3).translate(0, -0.22, 0), rags, j.hips, 0, 0, -0.12);
  // crystals
  const shards = [];
  for (let i = 0; i < 6; i++) {
    const c = part(new THREE.OctahedronGeometry(0.06, 0).scale(0.7, rand(2.2, 3.6), 0.7), crystal, j.chest, rand(-0.12, 0.12), rand(0.05, 0.3), -0.1);
    c.rotation.set(rand(-1.2, -0.4), rand(0, 3), rand(-0.5, 0.5));
    shards.push(c);
  }
  part(new THREE.OctahedronGeometry(0.05, 0).scale(0.7, 2.5, 0.7), crystal, j.shoulderL, 0.02, 0.06, 0).rotation.z = -0.6;

  const root = j.root;
  root.scale.setScalar(1.05);

  function animate(st: AnimState): void {
    const { t } = st;
    resetPose(j);
    idle(j, t * 0.8, 1 - st.move);
    walkCycle(j, st.phase, st.move, { stride: 0.42, knee: 0.8, arm: 0.2, bob: 0.08 });
    // hunched, arms reaching forward
    j.spine.rotation.x += 0.35; j.chest.rotation.x += 0.15; j.neck.rotation.x += -0.35; j.head.rotation.x += -0.1;
    j.shoulderL.rotation.x += -0.7 + Math.sin(t * 2.3) * 0.12; j.shoulderR.rotation.x += -0.6 + Math.sin(t * 2.1 + 1) * 0.12;
    j.elbowL.rotation.x += -0.3; j.elbowR.rotation.x += -0.35;
    j.head.rotation.z += Math.sin(t * 1.3) * 0.15;
    jaw.rotation.x = 0.2 + Math.sin(t * 5) * 0.12;

    const a = st.action;
    if (a && a.name === 'attack') {
      const k = a.t;
      const up = ramp(k, 0, 0.55) * (1 - ramp(k, 0.6, 0.75));
      const swing = ramp(k, 0.6, 0.75) * (1 - ramp(k, 0.8, 1));
      j.shoulderL.rotation.x += -1.9 * up + 0.4 * swing; j.shoulderR.rotation.x += -1.7 * up + 0.4 * swing;
      j.spine.rotation.x += -0.25 * up + 0.45 * swing;
      jaw.rotation.x += 0.4 * pulse(k, 0.4, 0.8);
    }
    if (st.hit > 0) j.spine.rotation.x += -0.4 * st.hit;
    if (st.dead >= 0) deathFall(j, st.dead, 1);
  }

  return { root, kit, joints: j, animate, height: 1.9, dispose() { kit.dispose(); } };
}
