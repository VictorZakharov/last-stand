// Mossback: hulking, hunched forest beast whose back is a mound of moss, stones and
// fungus; long heavy arms, a tusked jaw and dim amber eyes.
import * as THREE from 'three';
import { createKit } from '../../core/materials';
import { grunge, pbrMaterialMaps } from '../../core/textures';
import { buildHumanoid, part, joint, resetPose, walkCycle, idle, deathFall, pulse, ramp } from './rig';
import type { AnimState, Model } from '../../types';
import { rand } from '../../util';

export function buildMossback(): Model {
  const kit = createKit(0x9cff6a);
  const g = pbrMaterialMaps(grunge(), 2, 1);
  const hide = kit.std({ color: 0x6a5642, roughness: 0.9, map: g.map, normalMap: g.normalMap, normalScale: new THREE.Vector2(1.6, 1.6) });
  const moss = kit.std({ color: 0x46702a, roughness: 1, normalMap: g.normalMap, normalScale: new THREE.Vector2(2.5, 2.5), flatShading: true });
  const stone = kit.std({ color: 0x5a5c56, roughness: 0.85, flatShading: true });
  const tusk = kit.std({ color: 0xd0c4a4, roughness: 0.5 });
  const shroom = kit.std({ color: 0x0a221c, emissive: 0x2affc8, emissiveIntensity: 1.2, roughness: 0.6 });
  const eye = kit.glow(0xffb040, 5);

  const j = buildHumanoid({ skin: hide, hands: hide }, {
    hipY: 0.78, hipW: 0.24, thighL: 0.36, shinL: 0.36, thighR: 0.1, shinR: 0.085,
    torsoL: 0.58, chestW: 0.3, chestD: 0.22, waistW: 0.2, shoulderW: 0.34,
    upperL: 0.4, foreL: 0.42, upperR: 0.09, foreR: 0.09, handR: 0.11, neckL: 0.02, headR: 0.12,
  });
  // mossy hump over the shoulders and back, studded with stones and glowing fungus
  part(new THREE.IcosahedronGeometry(0.34, 1).scale(1.25, 0.85, 1), moss, j.chest, 0, 0.22, -0.1);
  part(new THREE.IcosahedronGeometry(0.22, 1).scale(1.2, 0.8, 1), moss, j.spine, 0, 0.12, -0.12);
  for (let i = 0; i < 5; i++) {
    const s = part(new THREE.DodecahedronGeometry(rand(0.06, 0.1), 0), stone, j.chest, rand(-0.25, 0.25), rand(0.3, 0.48), rand(-0.3, -0.05));
    s.rotation.set(rand(0, 3), rand(0, 3), 0);
  }
  for (let i = 0; i < 4; i++) {
    const x = rand(-0.28, 0.28), y = rand(0.1, 0.4);
    part(new THREE.CylinderGeometry(0.012, 0.016, 0.07, 5), tusk, j.chest, x, y + 0.03, -0.38).castShadow = false;
    part(new THREE.SphereGeometry(0.045, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), shroom, j.chest, x, y + 0.06, -0.38).castShadow = false;
  }
  // head: low, broad, with a heavy jaw and tusks
  part(new THREE.SphereGeometry(0.16, 14, 10).scale(1.15, 0.85, 1.1), hide, j.head, 0, 0.05, 0.08);
  const jaw = joint(j.head, 0, -0.02, 0.06);
  part(new THREE.BoxGeometry(0.22, 0.07, 0.18), hide, jaw, 0, -0.03, 0.06);
  for (const s of [1, -1]) {
    const t = part(new THREE.ConeGeometry(0.025, 0.14, 6), tusk, jaw, s * 0.08, 0.04, 0.13);
    t.rotation.set(-0.3, 0, -s * 0.25);
    part(new THREE.SphereGeometry(0.022, 6, 6), eye, j.head, s * 0.07, 0.08, 0.22).castShadow = false;
  }
  // big knuckled fists
  for (const hand of [j.handL, j.handR]) part(new THREE.DodecahedronGeometry(0.12, 1), hide, hand, 0, -0.08, 0.02);
  // moss hanging from the forearms
  for (const elbow of [j.elbowL, j.elbowR]) {
    const m = part(new THREE.ConeGeometry(0.1, 0.3, 5).rotateX(Math.PI), moss, elbow, 0, -0.18, -0.08);
    m.castShadow = false;
  }

  const root = j.root;
  root.scale.setScalar(1.12);

  function animate(st: AnimState): void {
    const { t } = st;
    resetPose(j);
    idle(j, t * 0.7, 1 - st.move);
    walkCycle(j, st.phase, st.move, { stride: 0.45, knee: 0.8, arm: 0.5, bob: 0.1 });
    // heavy forward hunch, arms hanging low
    j.spine.rotation.x += 0.5; j.chest.rotation.x += 0.15; j.neck.rotation.x += -0.55;
    j.shoulderL.rotation.x += -0.3; j.shoulderR.rotation.x += -0.3;
    j.shoulderL.rotation.z += 0.2; j.shoulderR.rotation.z += -0.2;
    j.body.rotation.z += Math.sin(st.phase) * 0.08 * st.move;
    jaw.rotation.x = 0.1 + Math.sin(t * 2.5) * 0.06;
    const a = st.action;
    if (a && a.name === 'attack') {
      // overhead double-fist smash
      const k = a.t;
      const up = ramp(k, 0, 0.55) * (1 - ramp(k, 0.6, 0.72));
      const down = ramp(k, 0.6, 0.72) * (1 - ramp(k, 0.85, 1));
      j.shoulderL.rotation.x += -2.6 * up - 0.3 * down; j.shoulderR.rotation.x += -2.6 * up - 0.3 * down;
      j.spine.rotation.x += -0.4 * up + 0.6 * down;
      j.body.position.y += -0.08 * down;
      jaw.rotation.x += 0.35 * pulse(k, 0.3, 0.8);
    }
    if (st.hit > 0) j.spine.rotation.x += -0.3 * st.hit;
    if (st.dead >= 0) deathFall(j, st.dead, 1);
  }

  return { root, kit, joints: j, animate, height: 1.8, dispose() { kit.dispose(); } };
}
