// Rift Witch: legless floating caster in tattered robes, holding a void orb.
import * as THREE from 'three';
import { createKit } from '../../core/materials';
import { grunge, pbrMaterialMaps } from '../../core/textures';
import { buildHumanoid, part, joint, resetPose, idle, pulse } from './rig';
import type { AnimState, Model } from '../../types';
import { particles, col } from '../../fx/particles';

export function buildWitch(): Model {
  const kit = createKit(0xd070ff);
  const g = pbrMaterialMaps(grunge(), 2, 1);
  const robe = kit.std({ color: 0x2a1030, roughness: 0.9, normalMap: g.normalMap, side: THREE.DoubleSide });
  const robe2 = kit.std({ color: 0x160818, roughness: 0.95, side: THREE.DoubleSide });
  const skin = kit.std({ color: 0x8a8a9a, roughness: 0.6 });
  const bone = kit.std({ color: 0xc8bfa8, roughness: 0.6 });
  const face = kit.glow(0xe060ff, 3.5);
  const orbMat = kit.glow(0xc050ff, 4);
  const hem = kit.glow(0x9030ff, 1.6);

  const j = buildHumanoid({ skin: robe, torso: robe, legs: robe, feet: robe, arms: robe, hands: skin }, {
    hipY: 1.05, chestW: 0.17, chestD: 0.12, waistW: 0.12, upperR: 0.045, foreR: 0.04, headR: 0.11,
  });
  // hide legs: the robe replaces them
  j.thighL.visible = j.thighR.visible = false;
  // flowing lower robe tapering into wisps
  const skirtGeo = new THREE.ConeGeometry(0.34, 1.1, 16, 6, true);
  const pos = skirtGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < -0.3) pos.setY(i, y - Math.random() * 0.25);
  }
  skirtGeo.rotateX(Math.PI).translate(0, -0.5, 0);
  const skirt = part(skirtGeo, robe2, j.hips, 0, 0.05, 0);
  part(new THREE.TorusGeometry(0.21, 0.012, 4, 20).rotateX(Math.PI / 2), hem, j.hips, 0, -0.35, 0).castShadow = false;
  // hood & face
  part(new THREE.SphereGeometry(0.15, 18, 12, Math.PI * 0.5 + 0.5, Math.PI * 2 - 1.0, 0, Math.PI * 0.75), robe, j.head, 0, 0.1, 0);
  part(new THREE.ConeGeometry(0.1, 0.35, 10).rotateX(-2.5), robe, j.head, 0, 0.14, -0.14);
  part(new THREE.SphereGeometry(0.085, 12, 10), face, j.head, 0, 0.08, 0.03).castShadow = false;
  // bone necklace + shoulder spikes
  for (let i = 0; i < 7; i++) {
    const a = -1.2 + i * 0.4;
    part(new THREE.ConeGeometry(0.015, 0.06, 4).rotateX(Math.PI), bone, j.chest, Math.sin(a) * 0.16, 0.22 - Math.cos(a) * 0.03, Math.cos(a) * 0.12);
  }
  for (const [s, sh] of [[1, j.shoulderL], [-1, j.shoulderR]] as const) {
    const sp = part(new THREE.ConeGeometry(0.03, 0.18, 5), bone, sh, s * 0.03, 0.08, 0);
    sp.rotation.z = -s * 0.4;
  }
  // orb between hands
  const orbJ = joint(j.chest, 0, 0.0, 0.38);
  const orb = part(new THREE.SphereGeometry(0.09, 16, 12), orbMat, orbJ);
  orb.castShadow = false;

  const root = j.root;
  let acc = 0;
  const wp = new THREE.Vector3();

  function animate(st: AnimState): void {
    const { t, dt } = st;
    resetPose(j);
    idle(j, t, 1);
    j.body.position.y = 0.25 + Math.sin(t * 2.2) * 0.08;
    j.body.rotation.x = st.move * 0.3;
    skirt.rotation.x = -st.move * 0.35 + Math.sin(t * 3) * 0.04;
    skirt.rotation.z = Math.sin(t * 2.5) * 0.05;
    // hands cradle the orb
    j.shoulderL.rotation.x += -0.9; j.shoulderR.rotation.x += -0.9;
    j.shoulderL.rotation.z += -0.35; j.shoulderR.rotation.z += 0.35;
    j.elbowL.rotation.x += -0.8; j.elbowR.rotation.x += -0.8;
    let glow = 1;
    const a = st.action;
    if (a && a.name === 'attack') {
      const w = pulse(a.t, 0, 1);
      j.shoulderL.rotation.x += -0.8 * w; j.shoulderR.rotation.x += -0.8 * w;
      j.elbowL.rotation.x += 0.6 * w; j.elbowR.rotation.x += 0.6 * w;
      j.spine.rotation.x += -0.2 * w;
      orbJ.position.z = 0.38 + w * 0.25;
      glow = 1 + w * 3;
    } else orbJ.position.z = 0.38;
    orb.scale.setScalar(glow * 0.8 + Math.sin(t * 8) * 0.05);
    orbMat.emissiveIntensity = 3 * glow;
    if (st.hit > 0) j.spine.rotation.x += -0.4 * st.hit;
    if (st.dead >= 0) { j.body.position.y *= 1 - st.dead; j.body.rotation.x = st.dead * 0.8; }

    // wisps trailing from the hem
    acc += dt;
    if (st.dead < 0 && acc > 0.06) {
      acc = 0;
      skirt.getWorldPosition(wp);
      particles.glow.spawn({
        x: wp.x + (Math.random() - 0.5) * 0.4, y: wp.y - 0.6, z: wp.z + (Math.random() - 0.5) * 0.4,
        vy: -0.2, life: 0.7, size: 0.25, sizeEnd: 0.05, color: col(0x8030ff, 1.2), colorEnd: col(0x200040, 0.3), alpha: 0.7,
      });
    }
  }

  return { root, kit, joints: j, animate, tip: orbJ, height: 2.1, dispose() { kit.dispose(); } };
}
