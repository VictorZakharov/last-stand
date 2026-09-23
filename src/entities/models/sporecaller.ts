// Sporecaller: stooped fungal shaman under a broad glowing cap, shedding spores and
// hurling them from a pod on its gnarled staff.
import * as THREE from 'three';
import { createKit } from '../../core/materials';
import { bark, grunge, pbrMaterialMaps } from '../../core/textures';
import { buildHumanoid, part, joint, resetPose, walkCycle, idle, deathFall, pulse } from './rig';
import type { AnimState, Model } from '../../types';
import { particles, col } from '../../fx/particles';

export function buildSporecaller(): Model {
  const kit = createKit(0xa0ff50);
  const g = pbrMaterialMaps(grunge(), 2, 1);
  const b = pbrMaterialMaps(bark(), 1, 1.2);
  const flesh = kit.std({ color: 0x9c9272, roughness: 0.75, map: g.map, normalMap: g.normalMap });
  const robe = kit.std({ color: 0x33281c, roughness: 0.95, normalMap: g.normalMap, side: THREE.DoubleSide });
  const cap = kit.std({ color: 0x5a2a3a, roughness: 0.6, map: g.map, emissive: 0x3a1020, emissiveIntensity: 0.4 });
  const spots = kit.glow(0xc8ff60, 2.5);
  const gills = kit.std({ color: 0xd8cfa8, roughness: 0.9, side: THREE.DoubleSide });
  const wood = kit.std({ color: 0x7a6450, roughness: 0.9, map: b.map, normalMap: b.normalMap });
  const pod = kit.glow(0x9cff3a, 4);
  const eye = kit.glow(0xc8ff60, 5);

  const j = buildHumanoid({ skin: flesh, torso: robe, legs: robe, feet: flesh, arms: robe, hands: flesh }, {
    hipY: 0.72, thighL: 0.36, shinL: 0.34, chestW: 0.17, chestD: 0.13, waistW: 0.15, torsoL: 0.46,
    upperR: 0.05, foreR: 0.045, headR: 0.1, neckL: 0.12,
  });
  // robe skirt
  const skirt = part(new THREE.ConeGeometry(0.3, 0.7, 12, 3, true).translate(0, -0.3, 0), robe, j.hips, 0, 0.02, 0);
  // the cap is the head: a wide dome with glowing spots and gills underneath
  part(new THREE.SphereGeometry(0.34, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.62, 1), cap, j.head, 0, 0.12, 0);
  part(new THREE.CircleGeometry(0.33, 20).rotateX(Math.PI / 2), gills, j.head, 0, 0.12, 0).castShadow = false;
  for (let i = 0; i < 9; i++) {
    const a = i * 2.4, rr = 0.1 + (i % 3) * 0.07;
    const s = part(new THREE.SphereGeometry(0.03, 6, 4), spots, j.head, Math.cos(a) * rr, 0.12 + Math.sqrt(Math.max(0, 0.34 ** 2 - rr ** 2)) * 0.62, Math.sin(a) * rr);
    s.scale.set(1, 0.4, 1);
    s.castShadow = false;
  }
  // a face in the stalk under the cap
  part(new THREE.CylinderGeometry(0.09, 0.1, 0.16, 10), flesh, j.head, 0, 0.04, 0);
  for (const s of [1, -1]) part(new THREE.SphereGeometry(0.018, 6, 6), eye, j.head, s * 0.04, 0.06, 0.085).castShadow = false;
  // staff in the right hand, spore pod at the top (the cast origin)
  const staff = joint(j.handR, 0, -0.06, 0.02);
  part(new THREE.CylinderGeometry(0.022, 0.03, 1.5, 6), wood, staff, 0, 0.35, 0);
  const tip = joint(staff, 0, 1.12, 0);
  const podMesh = part(new THREE.SphereGeometry(0.09, 12, 10).scale(1, 1.3, 1), pod, tip);
  podMesh.castShadow = false;
  for (let i = 0; i < 3; i++) {
    const c = part(new THREE.ConeGeometry(0.015, 0.2, 4), wood, tip, Math.cos(i * 2.1) * 0.06, 0.02, Math.sin(i * 2.1) * 0.06);
    c.rotation.set(Math.sin(i * 2.1) * 0.5, 0, -Math.cos(i * 2.1) * 0.5);
  }

  const root = j.root;
  let acc = 0;
  const wp = new THREE.Vector3();

  function animate(st: AnimState): void {
    const { t, dt } = st;
    resetPose(j);
    idle(j, t, 1 - st.move);
    walkCycle(j, st.phase, st.move, { stride: 0.4, knee: 0.7, arm: 0.15, bob: 0.05 });
    j.spine.rotation.x += 0.25; j.neck.rotation.x += 0.1;
    j.head.rotation.z = Math.sin(t * 1.4) * 0.08;
    // staff held upright out front
    j.shoulderR.rotation.x += -0.5; j.elbowR.rotation.x += -0.9; staff.rotation.x = 1.3;
    j.shoulderL.rotation.x += -0.3; j.elbowL.rotation.x += -0.5;
    skirt.rotation.x = -st.move * 0.2;
    let glow = 1;
    const a = st.action;
    if (a && a.name === 'attack') {
      const w = pulse(a.t, 0, 1);
      j.shoulderR.rotation.x += -1.3 * w; j.elbowR.rotation.x += 0.7 * w;
      j.spine.rotation.x += -0.25 * w;
      j.head.rotation.x += -0.2 * w;
      glow = 1 + w * 3;
    }
    podMesh.scale.setScalar(0.9 + glow * 0.1 + Math.sin(t * 6) * 0.05);
    pod.emissiveIntensity = 3 * glow;
    if (st.hit > 0) j.spine.rotation.x += -0.4 * st.hit;
    if (st.dead >= 0) deathFall(j, st.dead, 1);

    // spores drift down from under the cap
    acc += dt;
    if (st.dead < 0 && acc > 0.1) {
      acc = 0;
      j.head.getWorldPosition(wp);
      particles.glow.spawn({
        x: wp.x + (Math.random() - 0.5) * 0.6, y: wp.y + 0.05, z: wp.z + (Math.random() - 0.5) * 0.6,
        vy: -0.25, life: 1.2, size: 0.08, sizeEnd: 0.02, color: col(0xc8ff60, 1.2), colorEnd: col(0x204010, 0.3), alpha: 0.8,
      });
    }
  }

  return { root, kit, joints: j, animate, tip, height: 1.9, dispose() { kit.dispose(); } };
}
