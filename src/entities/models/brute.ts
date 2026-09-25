// Cinder Brute (and the Hollow Colossus boss variant): a hulking stone giant split by molten cracks.
// A hunched, crag-spined back, a molten heart showing through its broken chest, a low skull with
// tusks and ridged horns, forged pauldrons, a harness and a belt of chains, huge rock fists with
// spiked knuckles and broken shackles. The Colossus is pale stone and violet crystal: a crown,
// crystals erupting from its back and a ring of shards orbiting it.
import * as THREE from 'three';
import { createKit } from '../../core/materials';
import { grunge, pbrMaterialMaps, cracks } from '../../core/textures';
import { buildHumanoid, joint, resetPose, walkCycle, idle, deathFall, ramp } from './rig';
import { Sculpt, horn, limb, organic, stripRig, taperTube } from './shapes';
import type { AnimState, Model } from '../../types';
import { mulberry } from '../../util';

type Variant = 'brute' | 'colossus';
const VARIANTS: Record<Variant, { skin: number; crack: number; crackI: number; horn: number; metal: number; crystal: number | null; scale: number }> = {
  brute: { skin: 0x2e2622, crack: 0xff5a14, crackI: 1.8, horn: 0x1a1412, metal: 0x5a5550, crystal: null, scale: 1.45 },
  colossus: { skin: 0x44444e, crack: 0x9a40ff, crackI: 2.2, horn: 0xcfc6b0, metal: 0x4a4a58, crystal: 0xb070ff, scale: 2.35 },
};
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export function buildBrute(variant: Variant = 'brute'): Model {
  const C = VARIANTS[variant];
  const kit = createKit(C.crack);
  const g = pbrMaterialMaps(grunge(), 2, 1);
  const skin = kit.std({
    color: C.skin, roughness: 0.82, map: g.map, normalMap: g.normalMap, normalScale: new THREE.Vector2(2.2, 2.2),
    emissive: new THREE.Color(C.crack), emissiveMap: cracks(variant === 'brute' ? 5 : 8), emissiveIntensity: C.crackI,
  });
  const rock = kit.std({ color: C.skin, roughness: 0.9, map: g.map, normalMap: g.normalMap, normalScale: new THREE.Vector2(2.5, 2.5), flatShading: true });
  const horny = kit.std({ color: C.horn, roughness: 0.45, metalness: 0.1, normalMap: g.normalMap });
  const iron = kit.std({ color: C.metal, metalness: 0.85, roughness: 0.5, roughnessMap: g.roughnessMap, normalMap: g.normalMap, normalScale: new THREE.Vector2(0.8, 0.8) });
  const rivet = kit.std({ color: 0x8a7a60, metalness: 1, roughness: 0.35 });
  const leather = kit.std({ color: 0x2a1c14, roughness: 0.75, normalMap: g.normalMap });
  const heat = kit.glow(C.crack, 4);
  const eye = kit.glow(C.crack, 8);

  const j = buildHumanoid({ skin }, {
    hipY: 0.82, hipW: 0.26, thighL: 0.4, shinL: 0.38, thighR: 0.12, shinR: 0.1,
    torsoL: 0.62, chestW: 0.36, chestD: 0.26, waistW: 0.24, shoulderW: 0.42,
    upperL: 0.38, foreL: 0.38, upperR: 0.1, foreR: 0.11, handR: 0.14, neckL: 0.02, headR: 0.1,
  });
  stripRig(j.root);
  const P = j.P, S = new Sculpt(`brute-${variant}`).glow(heat).glow(eye);
  // the head juts forward from between the shoulders rather than sitting on top
  j.neck.position.set(0, P.torsoL * 0.5 + 0.02, 0.16);
  const r = mulberry(variant === 'brute' ? 3 : 9);
  const lim = (len: number, r0: number, r1: number, b = 0, at = 0.35) => organic(limb(len, r0, r1, b, at, 14), r0 * 0.14, 9, len * 10);
  const boulder = (sx: number, sy: number, sz: number, seed: number) => organic(new THREE.IcosahedronGeometry(1, 2), 0.18, 1.6, seed).scale(sx, sy, sz);
  const rivets = (parent: THREE.Object3D, pts: [number, number, number][]) => { for (const p of pts) S.add(new THREE.SphereGeometry(0.014, 6, 4), rivet, parent, p); };

  // --- legs: pillars of stone, iron knee guards, broad clawed feet
  S.pair(lim(P.thighL, 0.14, 0.11, 0.3, 0.3), skin, j.thighL, j.thighR);
  S.pair(lim(P.shinL, 0.11, 0.09, 0.35, 0.25), skin, j.kneeL, j.kneeR);
  S.pair(new THREE.SphereGeometry(0.1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), iron, j.kneeL, j.kneeR, [0, 0.0, 0.05], [Math.PI / 2, 0, 0], [1, 0.7, 1]);
  S.pair(boulder(0.1, 0.06, 0.16, 4), rock, j.ankleL, j.ankleR, [0, -0.04, 0.06]);
  for (const x of [-0.06, 0, 0.06]) S.pair(horn(0.07, 0.022, 0.8, V(1, 0, 0), V(0, -0.2, 1)), horny, j.ankleL, j.ankleR, [x, -0.05, 0.18]);

  // --- hips: a belt of chains and a forged loin plate with a skull boss
  S.add(boulder(0.26, 0.13, 0.2, 5), skin, j.hips, [0, 0.03, 0]);
  S.add(new THREE.CylinderGeometry(0.29, 0.31, 0.1, 18), leather, j.spine, [0, 0.0, 0]);
  S.add(new THREE.CylinderGeometry(0.2, 0.23, 0.32, 10, 1, true, -0.9, 1.8).translate(0, -0.16, 0), iron, j.hips, [0, 0.02, 0.0], [0.12, 0, 0]);
  S.add(new THREE.CylinderGeometry(0.2, 0.23, 0.28, 10, 1, true, -0.9, 1.8).translate(0, -0.14, 0), iron, j.hips, [0, 0.02, 0.0], [-0.12, Math.PI, 0]);
  S.add(organic(new THREE.SphereGeometry(1, 12, 10), 0.08, 5, 6), horny, j.spine, [0, 0.0, 0.3], [0, 0, 0], [0.07, 0.075, 0.05]);
  S.pair(new THREE.SphereGeometry(0.018, 8, 6), heat, j.spine, null, [0.025, 0.01, 0.345]);
  for (let i = 0; i < 7; i++) {
    const a = -1.4 + i * 0.47;
    S.add(new THREE.TorusGeometry(0.025, 0.008, 5, 10), iron, j.spine, [Math.sin(a) * 0.31, -0.05 - (i % 2) * 0.04, Math.cos(a) * 0.31], [0, a, i % 2 ? Math.PI / 2 : 0], [1, 1.4, 1]);
  }

  // --- torso: a barrel chest of plates of stone, split over a molten heart; crags along the back
  S.add(boulder(0.3, 0.26, 0.24, 7), skin, j.spine, [0, 0.2, 0]);
  S.add(boulder(0.44, 0.26, 0.3, 8), skin, j.chest, [0, 0.12, -0.04]);
  S.pair(boulder(0.2, 0.14, 0.12, 9), skin, j.chest, null, [0.16, 0.12, 0.2]);
  S.add(new THREE.SphereGeometry(0.075, 16, 12), heat, j.chest, [0, 0.12, 0.26]);
  S.add(organic(new THREE.TorusGeometry(0.085, 0.035, 8, 14), 0.012, 30, 16), rock, j.chest, [0, 0.12, 0.27]);
  S.add(boulder(0.24, 0.16, 0.14, 10), skin, j.chest, [0, 0.42, -0.16]);
  for (let i = 0; i < 7; i++) {
    const x = (r() - 0.5) * 0.4, y = 0.2 + r() * 0.35;
    S.add(organic(new THREE.ConeGeometry(0.07 + r() * 0.04, 0.25 + r() * 0.2, 6, 2), 0.02, 12, i), rock, j.chest, [x, y, -0.26 - r() * 0.04], [-1.1 - r() * 0.4, r(), x * 1.5]);
  }
  // a harness across the chest, with an iron ring over the heart
  S.add(taperTube([V(0.36, 0.42, -0.1), V(0.2, 0.36, 0.2), V(0, 0.22, 0.29), V(-0.22, 0.02, 0.24), V(-0.3, -0.08, 0.05)], () => 0.028, 16, 6), leather, j.chest);
  S.add(new THREE.TorusGeometry(0.06, 0.016, 6, 16), iron, j.chest, [0, 0.22, 0.3], [0.1, 0, 0]);

  // --- head: low between the shoulders; heavy brow, burning eyes, tusks, ridged horns
  S.add(boulder(0.15, 0.14, 0.15, 11), skin, j.head, [0, 0.07, 0.05]);
  S.add(boulder(0.16, 0.05, 0.08, 12), rock, j.head, [0, 0.13, 0.15], [0.3, 0, 0]);
  S.pair(new THREE.SphereGeometry(0.024, 10, 8), eye, j.head, null, [0.055, 0.095, 0.195], [0, 0, 0], [1.3, 0.7, 0.8]);
  const jaw = joint(j.head, 0, 0.02, 0.05);
  S.add(boulder(0.12, 0.05, 0.12, 13), skin, jaw, [0, -0.03, 0.08]);
  S.add(new THREE.SphereGeometry(1, 10, 6), heat, jaw, [0, 0.0, 0.13], [0, 0, 0], [0.07, 0.015, 0.05]);
  S.pair(horn(0.16, 0.024, 1.4, V(1, 0, 0), V(0.15, 1, 0.3)), horny, jaw, null, [0.075, -0.01, 0.16]);
  S.pair(horn(0.42, 0.05, 1.9, V(0, 0, -1), V(1, 0.35, 0.15), 6), horny, j.head, null, [0.13, 0.12, 0.02]);

  // --- shoulders: forged pauldrons in three lames, spiked on the left; a crag of rock on the right
  for (let i = 0; i < 3; i++) {
    const s = 1 - i * 0.12;
    S.add(new THREE.SphereGeometry(0.2 * s, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.42), iron, j.shoulderL, [0.02 + i * 0.03, 0.06 - i * 0.07, 0], [0, 0, -0.45 - i * 0.2]);
  }
  rivets(j.shoulderL, [[0.1, 0.17, 0.1], [0.1, 0.17, -0.1], [0.18, 0.08, 0.12], [0.18, 0.08, -0.12]]);
  for (let i = 0; i < 3; i++) S.add(horn(0.26 - i * 0.05, 0.035, -0.4, V(0, 0, 1), V(0.6, 1, (i - 1) * 0.4)), horny, j.shoulderL, [0.06, 0.16, (i - 1) * 0.08]);
  S.add(boulder(0.2, 0.17, 0.2, 14), rock, j.shoulderR, [-0.04, 0.08, 0]);
  for (let i = 0; i < 3; i++) S.add(organic(new THREE.ConeGeometry(0.06, 0.26 - i * 0.05, 5, 2), 0.02, 12, 20 + i), rock, j.shoulderR, [-0.06 - i * 0.03, 0.2, (i - 1) * 0.07], [(i - 1) * 0.3, 0, 0.4 + i * 0.15]);

  // --- arms: forearms bigger than the upper arm, fists like boulders with iron knuckles, shackles
  S.pair(lim(P.upperL, 0.13, 0.1, 0.35), skin, j.shoulderL, j.shoulderR);
  S.pair(lim(P.foreL, 0.13, 0.12, 0.4, 0.3), skin, j.elbowL, j.elbowR);
  S.pair(new THREE.CylinderGeometry(0.135, 0.14, 0.12, 14), iron, j.elbowL, j.elbowR, [0, -P.foreL + 0.08, 0]);
  S.pair(new THREE.TorusGeometry(0.14, 0.02, 6, 16).rotateX(Math.PI / 2), rivet, j.elbowL, j.elbowR, [0, -P.foreL + 0.08, 0]);
  S.pair(boulder(0.17, 0.16, 0.16, 15), skin, j.handL, j.handR, [0, -0.1, 0.02]);
  for (let i = 0; i < 4; i++) S.pair(new THREE.ConeGeometry(0.03, 0.1, 5), iron, j.handL, j.handR, [(i - 1.5) * 0.07, -0.2, 0.12], [1.2, 0, 0]);
  // broken chain hanging off each shackle
  const chains: THREE.Group[][] = [];
  for (const [elbow, s] of [[j.elbowL, 1], [j.elbowR, -1]] as const) {
    const list: THREE.Group[] = [];
    let link: THREE.Object3D = joint(elbow, s * 0.12, -P.foreL + 0.05, -0.05);
    for (let i = 0; i < 4; i++) {
      const lj = joint(link, 0, i === 0 ? 0 : -0.075, 0);
      S.add(new THREE.TorusGeometry(0.03, 0.01, 5, 10), iron, lj, [0, -0.038, 0], [0, i % 2 ? Math.PI / 2 : 0, 0], [0.8, 1.4, 1]);
      list.push(lj); link = lj;
    }
    chains.push(list);
  }

  // --- the Colossus: a crystal crown, crystals erupting from its back, a ring of orbiting shards
  const orbiters: THREE.Group[] = [];
  let orbitRing: THREE.Group | null = null;
  let crystalMat: THREE.MeshPhysicalMaterial | null = null;
  if (C.crystal) {
    const cm = crystalMat = kit.phys({ color: C.crystal, emissive: C.crystal, emissiveIntensity: 2.2, roughness: 0.1, clearcoat: 1, flatShading: true });
    for (let i = 0; i < 7; i++) {
      const a = (i / 6) * Math.PI - Math.PI / 2;
      S.add(new THREE.OctahedronGeometry(0.05, 0).scale(0.6, i === 3 ? 4.2 : 3 - Math.abs(i - 3) * 0.3, 0.6), cm, j.head, [Math.sin(a) * 0.15, 0.2, Math.cos(a) * 0.06 + 0.02], [0, 0, -Math.sin(a) * 0.5]);
    }
    for (let i = 0; i < 11; i++) {
      S.add(new THREE.OctahedronGeometry(0.08, 0).scale(0.6, 2.2 + r() * 2.3, 0.6), cm, j.chest, [(r() - 0.5) * 0.55, 0.15 + r() * 0.4, -0.25], [-0.5 - r() * 0.8, r() * 3, (r() - 0.5) * 0.8]);
    }
    S.pair(new THREE.OctahedronGeometry(0.07, 0).scale(0.6, 3, 0.6), cm, j.shoulderL, j.shoulderR, [0.05, 0.25, -0.05], [0, 0, -0.3]);
    const ring = joint(j.root, 0, 1.4, 0);
    for (let i = 0; i < 6; i++) {
      const o = joint(ring);
      o.rotation.y = (i / 6) * Math.PI * 2;
      const shard = joint(o, 0.95, 0, 0);
      S.add(new THREE.OctahedronGeometry(0.09, 0).scale(0.6, 1.8, 0.6), cm, shard);
      orbiters.push(shard);
    }
    S.glow(cm);
    orbitRing = ring;
  }
  S.build();

  const root = j.root;
  root.scale.setScalar(C.scale);

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
    jaw.rotation.x = 0.08 + Math.sin(t * 1.5) * 0.05;

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
        jaw.rotation.x += 0.35 * up;
      } else if (a.name === 'cast') {
        const w = Math.sin(k * Math.PI);
        j.shoulderR.rotation.x += -1.6 * w; j.shoulderL.rotation.x += -1.3 * w;
        j.neck.rotation.x += -0.3 * w;
      } else if (a.name === 'roar') {
        const w = Math.sin(k * Math.PI);
        j.shoulderL.rotation.z += 1.2 * w; j.shoulderR.rotation.z += -1.2 * w;
        j.spine.rotation.x += -0.5 * w; j.neck.rotation.x += -0.4 * w;
        jaw.rotation.x += 0.6 * w;
      }
    }
    if (st.hit > 0) j.spine.rotation.x += -0.15 * st.hit;
    if (st.dead >= 0) deathFall(j, st.dead, 1);
    // the molten heart beats; the chains hang down from the swinging arms
    heat.emissiveIntensity = 3.2 + Math.max(0, Math.sin(t * 2.6)) ** 4 * 3;
    chains.forEach((list, s) => {
      const sh = s === 0 ? j.shoulderL : j.shoulderR, el = s === 0 ? j.elbowL : j.elbowR;
      const arm = sh.rotation.x + el.rotation.x + j.spine.rotation.x + j.chest.rotation.x;
      list.forEach((c, i) => { c.rotation.x = (i === 0 ? -arm : 0) + Math.sin(t * 2.4 - i * 0.6 + s) * 0.1 + st.move * 0.2; c.rotation.z = Math.sin(t * 1.9 - i * 0.5 + s) * 0.08; });
    });
    if (orbitRing) {
      orbitRing.rotation.y = t * 0.9;
      orbiters.forEach((o, i) => { o.rotation.y = t * 3 + i; o.position.y = Math.sin(t * 2 + i) * 0.12; });
      if (crystalMat) crystalMat.emissiveIntensity = 2 + Math.sin(t * 2) * 0.4;
    }
  }

  return { root, kit, joints: j, animate, height: 2.6, dispose() { kit.dispose(); } };
}
