// Barkhide Hulk (and the Elder Thornheart boss variant): a giant of living wood with
// sap glowing through its bark, branch antlers, leafy shoulders and root-like feet.
// The boss carries a glowing heart in a cage of branches and a ring of orbiting thorns.
import * as THREE from 'three';
import { createKit, glowScale, SMALL_GLOW } from '../../core/materials';
import { bark, pbrMaterialMaps } from '../../core/textures';
import { buildHumanoid, part, joint, resetPose, walkCycle, idle, deathFall, ramp } from './rig';
import type { AnimState, Model } from '../../types';
import { rand } from '../../util';

type Variant = 'barkhulk' | 'thornheart';
const VARIANTS: Record<Variant, { skin: number; sap: number; leaf: number; heart: number | null; scale: number }> = {
  barkhulk: { skin: 0x8a7458, sap: 0x8cff30, leaf: 0x3a6224, heart: null, scale: 1.45 },
  thornheart: { skin: 0x5e5044, sap: 0x6aff50, leaf: 0x28502c, heart: 0xb8ff4a, scale: 2.35 },
};

export function buildTreant(variant: Variant = 'barkhulk'): Model {
  const V = VARIANTS[variant];
  const kit = createKit(V.sap);
  const b = pbrMaterialMaps(bark(), 2, 2);
  const skin = kit.std({ color: V.skin, roughness: 0.9, map: b.map, normalMap: b.normalMap, normalScale: new THREE.Vector2(2, 2) });
  // green glows bloom far more than violet ones: scaled like every small glow
  const g = glowScale(V.sap, SMALL_GLOW);
  const sap = kit.glow(V.sap, 1.8 * g);
  const wood = kit.std({ color: 0x3a2e24, roughness: 0.85, map: b.map });
  const leaf = kit.std({ color: V.leaf, roughness: 0.85, flatShading: true });
  const eye = kit.glow(V.sap, 6 * g);

  const j = buildHumanoid({ skin }, {
    hipY: 0.82, hipW: 0.26, thighL: 0.4, shinL: 0.38, thighR: 0.13, shinR: 0.11,
    torsoL: 0.64, chestW: 0.34, chestD: 0.26, waistW: 0.22, shoulderW: 0.4,
    upperL: 0.4, foreL: 0.42, upperR: 0.1, foreR: 0.12, handR: 0.13, neckL: 0.02, headR: 0.1,
  });
  // barrel trunk-chest and a knotted head
  part(new THREE.CylinderGeometry(0.3, 0.24, 0.5, 9).scale(1.2, 1, 0.9), skin, j.chest, 0, 0.2, -0.02);
  part(new THREE.DodecahedronGeometry(0.15, 1).scale(1, 1.2, 1), skin, j.head, 0, 0.07, 0.06);
  for (const s of [1, -1]) part(new THREE.SphereGeometry(0.025, 8, 6), eye, j.head, s * 0.06, 0.09, 0.2).castShadow = false;
  // branch antlers: a main branch with forks on each side of the head
  for (const s of [1, -1]) {
    const br = joint(j.head, s * 0.1, 0.16, 0);
    br.rotation.set(0.2, 0, -s * 0.5);
    part(new THREE.CylinderGeometry(0.02, 0.04, 0.4, 5).translate(0, 0.2, 0), wood, br);
    for (let i = 0; i < 2; i++) {
      const f = part(new THREE.CylinderGeometry(0.012, 0.022, 0.22, 4).translate(0, 0.11, 0), wood, br, 0, 0.16 + i * 0.12, 0);
      f.rotation.set(rand(-0.3, 0.3), 0, -s * (0.6 + i * 0.3));
    }
  }
  // leafy shoulders
  for (const [s, sh] of [[1, j.shoulderL], [-1, j.shoulderR]] as const) {
    part(new THREE.IcosahedronGeometry(0.17, 1).scale(1.1, 0.8, 1), leaf, sh, s * 0.03, 0.08, 0);
    for (let i = 0; i < 2; i++) {
      const tw = part(new THREE.CylinderGeometry(0.012, 0.025, 0.28, 4).translate(0, 0.14, 0), wood, sh, s * rand(0, 0.06), 0.12, rand(-0.06, 0.06));
      tw.rotation.set(rand(-0.4, 0.4), 0, -s * rand(0.3, 0.8));
    }
  }
  // gnarled fists and root toes
  for (const hand of [j.handL, j.handR]) part(new THREE.DodecahedronGeometry(0.14, 1), skin, hand, 0, -0.1, 0.02);
  for (const ankle of [j.ankleL, j.ankleR]) for (let i = -1; i <= 1; i++) {
    const t = part(new THREE.ConeGeometry(0.04, 0.2, 5).rotateX(Math.PI / 2), wood, ankle, i * 0.05, -0.08, 0.14);
    t.rotation.y = i * 0.4;
  }
  // moss belt
  part(new THREE.TorusGeometry(0.25, 0.06, 5, 12).rotateX(Math.PI / 2), leaf, j.spine, 0, 0.02, 0);
  // sap glowing from knot holes in the bark
  const knots: [THREE.Object3D, number, number, number][] = [
    [j.chest, 0.16, 0.3, 0.2], [j.chest, -0.2, 0.1, 0.22], [j.chest, 0.05, -0.05, 0.25], [j.elbowL, 0.06, -0.2, 0.07], [j.elbowR, -0.07, -0.12, 0.08], [j.kneeL, 0.07, -0.18, 0.08],
  ];
  for (const [p, x, y, z] of knots) part(new THREE.SphereGeometry(0.022, 8, 6).scale(1, 1.6, 0.5), sap, p, x, y, z).castShadow = false;

  const orbiters: THREE.Group[] = [];
  let orbitRing: THREE.Group | null = null;
  let heart: THREE.Mesh | null = null;
  if (V.heart) {
    const hg = glowScale(V.heart, SMALL_GLOW);
    const hm = kit.glow(V.heart, 3.5 * hg);
    // heart glowing inside a cage of branches on the chest
    heart = part(new THREE.IcosahedronGeometry(0.1, 1), hm, j.chest, 0, 0.22, 0.25);
    heart.castShadow = false;
    for (let i = 0; i < 5; i++) {
      const rib = part(new THREE.TorusGeometry(0.14, 0.018, 4, 10, Math.PI), wood, j.chest, 0, 0.22, 0.24);
      rib.rotation.set(0, Math.PI / 2, (i / 5) * Math.PI);
    }
    // a crown of taller branches
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI - Math.PI / 2;
      const c = part(new THREE.CylinderGeometry(0.01, 0.03, 0.4, 4).translate(0, 0.2, 0), wood, j.head, Math.sin(a) * 0.12, 0.16, Math.cos(a) * 0.05 - 0.04);
      c.rotation.z = -Math.sin(a) * 0.6;
    }
    const ring = joint(j.root, 0, 1.4, 0);
    const thorn = kit.glow(V.heart, 2.2 * hg);

    for (let i = 0; i < 6; i++) {
      const o = joint(ring);
      part(new THREE.ConeGeometry(0.06, 0.34, 5), thorn, o, 0.95, 0, 0).castShadow = false;
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
    idle(j, t * 0.6, 1 - st.move);
    walkCycle(j, st.phase, st.move, { stride: 0.42, knee: 0.7, arm: 0.3, bob: 0.08 });
    // a slow, creaking sway
    j.spine.rotation.x += 0.2; j.neck.rotation.x += -0.25;
    j.spine.rotation.z += Math.sin(t * 0.9) * 0.04;
    j.shoulderL.rotation.z += 0.3; j.shoulderR.rotation.z += -0.3;
    j.elbowL.rotation.x += -0.3; j.elbowR.rotation.x += -0.3;
    j.body.rotation.z += Math.sin(st.phase) * 0.05 * st.move;

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
        // flings seeds from both arms
        const w = Math.sin(k * Math.PI);
        j.shoulderR.rotation.x += -1.5 * w; j.shoulderL.rotation.x += -1.5 * w;
        j.shoulderR.rotation.z += -0.5 * w; j.shoulderL.rotation.z += 0.5 * w;
        j.neck.rotation.x += -0.3 * w;
      } else if (a.name === 'roar') {
        const w = Math.sin(k * Math.PI);
        j.shoulderL.rotation.z += 1.3 * w; j.shoulderR.rotation.z += -1.3 * w;
        j.spine.rotation.x += -0.5 * w; j.neck.rotation.x += -0.5 * w;
      }
    }
    if (st.hit > 0) j.spine.rotation.x += -0.15 * st.hit;
    if (st.dead >= 0) deathFall(j, st.dead, 1);
    if (heart) heart.scale.setScalar(1 + Math.max(0, Math.sin(t * 3.2)) ** 4 * 0.35);
    if (orbitRing) {
      orbitRing.rotation.y = -t * 0.8;
      orbiters.forEach((o, i) => { o.children[0].rotation.z = Math.PI / 2 + Math.sin(t * 2 + i) * 0.2; o.position.y = Math.sin(t * 2 + i) * 0.12; });
    }
  }

  return { root, kit, joints: j, animate, height: 2.6, dispose() { kit.dispose(); } };
}
