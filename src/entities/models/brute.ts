// Cinder Brute (and the Hollow Colossus boss variant): massive stone-skinned
// giant with glowing magma cracks, huge fists and shoulder spikes.
import * as THREE from 'three';
import { createKit } from '../../core/materials';
import { grunge, pbrMaterialMaps, cracks } from '../../core/textures';
import { buildHumanoid, part, joint, resetPose, walkCycle, idle, deathFall, ramp } from './rig';
import type { AnimState, Model } from '../../types';
import { rand } from '../../util';

type Variant = 'brute' | 'colossus';
const VARIANTS: Record<Variant, { skin: number; crack: number; crackI: number; horn: number; crystal: number | null; scale: number }> = {
  brute: { skin: 0x2a2220, crack: 0xff5a14, crackI: 1.8, horn: 0x151010, crystal: null, scale: 1.45 },
  colossus: { skin: 0x3a3a44, crack: 0x9a40ff, crackI: 2.2, horn: 0xcfc6b0, crystal: 0xb070ff, scale: 2.35 },
};

export function buildBrute(variant: Variant = 'brute'): Model {
  const V = VARIANTS[variant];
  const kit = createKit(V.crack);
  const g = pbrMaterialMaps(grunge(), 2, 1);
  const crackTex = cracks(variant === 'brute' ? 5 : 8);
  const skin = kit.std({
    color: V.skin, roughness: 0.8, map: g.map, normalMap: g.normalMap, normalScale: new THREE.Vector2(2, 2),
    emissive: new THREE.Color(V.crack), emissiveMap: crackTex, emissiveIntensity: V.crackI,
  });
  const horn = kit.std({ color: V.horn, roughness: 0.45, metalness: 0.1 });
  const plate = kit.std({ color: 0x1a1a1e, metalness: 0.8, roughness: 0.5, roughnessMap: g.roughnessMap });
  const eye = kit.glow(V.crack, 7);

  const j = buildHumanoid({ skin, torso: skin, legs: skin, feet: skin, arms: skin, hands: skin }, {
    hipY: 0.82, hipW: 0.26, thighL: 0.4, shinL: 0.38, thighR: 0.12, shinR: 0.1,
    torsoL: 0.62, chestW: 0.36, chestD: 0.26, waistW: 0.24, shoulderW: 0.4,
    upperL: 0.38, foreL: 0.38, upperR: 0.1, foreR: 0.11, handR: 0.14, neckL: 0.02, headR: 0.1,
  });
  // massive chest & traps
  part(new THREE.SphereGeometry(0.3, 16, 12).scale(1.3, 0.8, 0.9), skin, j.chest, 0, 0.25, -0.02);
  part(new THREE.SphereGeometry(0.16, 14, 10).scale(1, 1.15, 1), skin, j.head, 0, 0.06, 0.06);
  for (const s of [1, -1]) {
    part(new THREE.SphereGeometry(0.025, 8, 6), eye, j.head, s * 0.06, 0.09, 0.2).castShadow = false;
    const h = part(new THREE.ConeGeometry(0.05, 0.32, 8), horn, j.head, s * 0.13, 0.14, 0.02);
    h.rotation.set(0.4, 0, -s * 1.1);
  }
  // shoulder rocks / spikes
  for (const [s, sh] of [[1, j.shoulderL], [-1, j.shoulderR]] as const) {
    part(new THREE.DodecahedronGeometry(0.17, 0), plate, sh, s * 0.03, 0.06, 0);
    for (let i = 0; i < 3; i++) {
      const sp = part(new THREE.ConeGeometry(0.04, rand(0.22, 0.34), 5), horn, sh, s * rand(0.0, 0.08), 0.18, rand(-0.08, 0.08));
      sp.rotation.set(rand(-0.3, 0.3), 0, -s * rand(0.2, 0.7));
    }
  }
  // fists
  for (const hand of [j.handL, j.handR]) part(new THREE.DodecahedronGeometry(0.15, 1), skin, hand, 0, -0.1, 0.02);
  // belt plate
  part(new THREE.CylinderGeometry(0.28, 0.3, 0.12, 12), plate, j.spine, 0, 0.0, 0);

  const orbiters: THREE.Group[] = [];
  let orbitRing: THREE.Group | null = null;
  if (V.crystal) {
    const cm = kit.phys({ color: V.crystal, emissive: V.crystal, emissiveIntensity: 2.2, roughness: 0.1, clearcoat: 1, flatShading: true });
    // crown
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI - Math.PI / 2;
      const c = part(new THREE.OctahedronGeometry(0.05, 0).scale(0.6, 3, 0.6), cm, j.head, Math.sin(a) * 0.14, 0.2, Math.cos(a) * 0.05 - 0.04);
      c.rotation.z = -Math.sin(a) * 0.5;
    }
    // back crystals
    for (let i = 0; i < 7; i++) {
      const c = part(new THREE.OctahedronGeometry(0.08, 0).scale(0.6, rand(2.5, 4), 0.6), cm, j.chest, rand(-0.25, 0.25), rand(0.15, 0.45), -0.22);
      c.rotation.set(rand(-1.2, -0.5), rand(0, 3), rand(-0.4, 0.4));
    }
    const ring = joint(j.root, 0, 1.4, 0);
    for (let i = 0; i < 6; i++) {
      const o = joint(ring);
      part(new THREE.OctahedronGeometry(0.09, 0).scale(0.6, 1.8, 0.6), cm, o, 0.95, 0, 0).castShadow = false;
      o.rotation.y = (i / 6) * Math.PI * 2;
      orbiters.push(o);
    }
    orbitRing = ring;
  }

  const root = j.root;
  root.scale.setScalar(V.scale);

  function animate(st: AnimState): void {
    const { t } = st;
    resetPose(j);
    idle(j, t * 0.7, 1 - st.move);
    walkCycle(j, st.phase, st.move, { stride: 0.45, knee: 0.8, arm: 0.35, bob: 0.1 });
    j.spine.rotation.x += 0.3; j.neck.rotation.x += -0.35;
    j.shoulderL.rotation.z += 0.25; j.shoulderR.rotation.z += -0.25;
    j.elbowL.rotation.x += -0.35; j.elbowR.rotation.x += -0.35;
    j.body.rotation.z += Math.sin(st.phase) * 0.06 * st.move;
    j.chest.scale.setScalar(1 + Math.sin(t * 1.5) * 0.015);

    const a = st.action;
    if (a) {
      const k = a.t;
      if (a.name === 'slam' || a.name === 'attack') {
        const up = ramp(k, 0, 0.7) * (1 - ramp(k, 0.72, 0.8));
        const down = ramp(k, 0.72, 0.8) * (1 - ramp(k, 0.9, 1));
        j.shoulderL.rotation.x += -2.9 * up - 0.9 * down; j.shoulderR.rotation.x += -2.9 * up - 0.9 * down;
        j.elbowL.rotation.x += -0.5 * up; j.elbowR.rotation.x += -0.5 * up;
        j.spine.rotation.x += -0.35 * up + 0.7 * down;
        j.body.position.y += -0.12 * down;
        j.kneeL.rotation.x += 0.5 * down; j.kneeR.rotation.x += 0.5 * down;
        j.thighL.rotation.x += -0.4 * down; j.thighR.rotation.x += -0.4 * down;
      } else if (a.name === 'cast') {
        const w = Math.sin(k * Math.PI);
        j.shoulderR.rotation.x += -1.6 * w; j.shoulderL.rotation.x += -1.3 * w;
        j.neck.rotation.x += -0.3 * w;
      } else if (a.name === 'roar') {
        const w = Math.sin(k * Math.PI);
        j.shoulderL.rotation.z += 1.2 * w; j.shoulderR.rotation.z += -1.2 * w;
        j.spine.rotation.x += -0.5 * w; j.neck.rotation.x += -0.4 * w;
      }
    }
    if (st.hit > 0) j.spine.rotation.x += -0.15 * st.hit;
    if (st.dead >= 0) deathFall(j, st.dead, 1);
    if (orbitRing) {
      orbitRing.rotation.y = t * 0.9;
      orbiters.forEach((o, i) => { o.children[0].rotation.y = t * 3 + i; o.position.y = Math.sin(t * 2 + i) * 0.12; });
    }
  }

  return { root, kit, joints: j, animate, height: 2.6, dispose() { kit.dispose(); } };
}
