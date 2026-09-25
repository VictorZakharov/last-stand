// Barkhide Hulk (and the Elder Thornheart boss variant): a giant of living wood. Sap glows through the grain
// of its bark and out of a split in its chest; roots wind round its limbs and splay from its feet; a burl
// of a head with a heavy brow, knot-hole eyes, a hollow maw and a beard of moss and hanging roots; branch
// antlers and shoulders in leaf, shelf fungi on its flank, hands of root fingers. The Thornheart carries
// a glowing heart in a cage of roots, a crown of branches in glowing blossom and a ring of orbiting thorns.
import * as THREE from 'three';
import { createKit } from '../../core/materials';
import { bark, grunge, pbrMaterialMaps, veins } from '../../core/textures';
import { buildHumanoid, joint, resetPose, walkCycle, idle, deathFall, ramp } from './rig';
import { Sculpt, bend, branches, horn, lathe, leaf, limb, organic, rag, stripRig, taperTube, twist } from './shapes';
import type { AnimState, Model } from '../../types';
import { mulberry } from '../../util';

type Variant = 'barkhulk' | 'thornheart';
// glow: the boss's yellow-green glows are much brighter to the eye than violet at the same strength, and it is big
const VARIANTS: Record<Variant, { skin: number; sap: number; leaf: number; heart: number | null; scale: number; glow: number }> = {
  barkhulk: { skin: 0xc0a07e, sap: 0x8cff30, leaf: 0x3e6a24, heart: null, scale: 1.45, glow: 1 },
  thornheart: { skin: 0x9a846a, sap: 0x6aff50, leaf: 0x2a5a2e, heart: 0xb8ff4a, scale: 2.35, glow: 0.3 },
};
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export function buildTreant(variant: Variant = 'barkhulk'): Model {
  const C = VARIANTS[variant];
  const kit = createKit(C.sap);
  const b = pbrMaterialMaps(bark(), 1, 1.8);
  const g = pbrMaterialMaps(grunge(), 2, 1);
  const skin = kit.rim({
    color: C.skin, roughness: 0.9, map: b.map, normalMap: b.normalMap, normalScale: new THREE.Vector2(1.8, 1.8),
    emissive: C.sap, emissiveMap: veins(variant === 'barkhulk' ? 71 : 73, 3), emissiveIntensity: 0.2 + 0.15 * C.glow,
  }, 0x90b070, 0.4);
  const wood = kit.rim({ color: 0x8a6e52, roughness: 0.85, map: b.map, normalMap: b.normalMap, normalScale: new THREE.Vector2(1.5, 1.5) }, 0x80a060, 0.2);
  const moss = kit.rim({ color: 0x33561a, roughness: 1, map: g.map, normalMap: g.normalMap, normalScale: new THREE.Vector2(3, 3) }, 0x6a9a3a, 0.15);
  const mossDark = kit.std({ color: 0x24401a, roughness: 1, normalMap: g.normalMap, side: THREE.DoubleSide });
  const leafMat = kit.rim({ color: C.leaf, roughness: 0.65, side: THREE.DoubleSide }, 0x80c050, 0.25);
  const leafOld = kit.std({ color: 0x6a6424, roughness: 0.7, side: THREE.DoubleSide });
  const shroom = kit.std({ color: 0x0a221c, emissive: 0x2affc8, emissiveIntensity: 1.2, roughness: 0.6 });
  const dark = kit.std({ color: 0x040302, roughness: 1 });
  const sap = kit.glow(C.sap, 2.2 * C.glow);
  const eye = kit.glow(C.sap, 5 * Math.max(0.45, C.glow));

  const j = buildHumanoid({ skin }, {
    hipY: 0.82, hipW: 0.26, thighL: 0.4, shinL: 0.38, thighR: 0.13, shinR: 0.11,
    torsoL: 0.64, chestW: 0.34, chestD: 0.26, waistW: 0.22, shoulderW: 0.42,
    upperL: 0.4, foreL: 0.42, upperR: 0.1, foreR: 0.12, handR: 0.13, neckL: 0.02, headR: 0.1,
  });
  stripRig(j.root);
  const P = j.P, S = new Sculpt(`treant-${variant}`).glow(sap).glow(eye).glow(shroom).glow(leafMat).glow(leafOld);
  j.neck.position.set(0, P.torsoL * 0.62, 0.2);
  const r = mulberry(variant === 'barkhulk' ? 5 : 11);
  const lim = (len: number, r0: number, r1: number, b = 0, at = 0.35) => organic(limb(len, r0, r1, b, at, 14), r0 * 0.16, 8, len * 30);
  // small burls need less detail
  const burl = (sx: number, sy: number, sz: number, seed: number, amp = 0.16, f = 1.8) => organic(new THREE.IcosahedronGeometry(1, Math.max(sx, sy, sz) > 0.12 ? 2 : 1), amp, f, seed).scale(sx, sy, sz);
  const shelfGeo = (rad: number) => lathe([[0.001, 0.3 * rad], [0.6 * rad, 0.26 * rad], [rad, 0.04 * rad], [0.9 * rad, 0], [0.001, 0.02 * rad]], 12);
  // a limb with roots winding round it
  const rooted = (len: number, r0: number, r1: number, pl: THREE.Object3D, pr: THREE.Object3D, b = 0.3, at = 0.35, n = 2) => {
    S.pair(lim(len, r0, r1, b, at), skin, pl, pr);
    for (let k = 0; k < n; k++) S.pair(twist(len * 0.95, (r0 + r1) * 0.5, r0 * 0.22, 0.6, k * 2.4 + len), wood, pl, pr);
  };
  // leaves in a spray round a twig end
  const spray = (parent: THREE.Object3D, at: THREE.Vector3, n: number, size: number) => {
    for (let i = 0; i < n; i++) S.add(leaf(size * (0.8 + r() * 0.4), size * 0.5), i % 4 === 3 ? leafOld : leafMat, parent, [at.x, at.y, at.z], [-0.4 - r() * 1.4, r() * Math.PI * 2, (r() - 0.5) * 0.8]);
  };
  // a branch tree from `from` along `dir`, leaves at every twig end
  const bough = (parent: THREE.Object3D, from: THREE.Vector3, dir: THREE.Vector3, len: number, rad: number, depth: number, leaves = 4, size = 0.1) => {
    const out: THREE.BufferGeometry[] = [], tips: THREE.Vector3[] = [];
    branches(r, from, dir, len, rad, depth, out, tips, 0.55);
    for (const geo of out) S.add(geo, wood, parent);
    for (const tp of tips) spray(parent, tp, leaves, size);
    return tips;
  };
  const beard = (parent: THREE.Object3D, pos: [number, number, number], n: number, w: number, len: number, seed: number, yaw = 0) => {
    for (let i = 0; i < n; i++) S.add(bend(rag(w, len * (0.7 + r() * 0.6), seed + i, 3), -0.15), mossDark, parent, [pos[0] + (i - (n - 1) / 2) * w * 0.7, pos[1], pos[2]], [0, yaw + (r() - 0.5) * 0.5, 0]);
  };

  // --- legs: trunks wound with roots, a burl at the knee, roots splaying from the feet into the ground
  rooted(P.thighL, 0.16, 0.13, j.thighL, j.thighR, 0.25, 0.3, 3);
  rooted(P.shinL, 0.13, 0.12, j.kneeL, j.kneeR, 0.2, 0.3, 2);
  S.pair(burl(0.12, 0.1, 0.1, 3), skin, j.kneeL, j.kneeR, [0, 0.01, 0.05]);
  S.pair(burl(0.13, 0.08, 0.16, 4, 0.12), skin, j.ankleL, j.ankleR, [0, -0.03, 0.04]);
  for (let i = 0; i < 5; i++) {
    const a = -1.1 + i * 0.55 + (r() - 0.5) * 0.2, c = Math.sin(a), s = Math.cos(a), len = 0.22 + r() * 0.1;
    S.pair(taperTube([V(0, 0, 0), V(c * len * 0.5, -0.02, s * len * 0.5), V(c * len, -0.08, s * len)], (t) => 0.045 * (1 - t * 0.85), 10, 6), wood, j.ankleL, j.ankleR, [0, -0.02, 0.04]);
  }

  // --- body: a gnarled trunk; moss round the waist with a fringe hanging; the chest split over glowing sap
  S.add(burl(0.28, 0.15, 0.22, 5), skin, j.hips, [0, 0.03, 0]);
  S.add(lathe([[0.26, 0], [0.24, 0.12], [0.26, 0.26], [0.3, 0.36]], 16), skin, j.spine, [0, -0.02, 0], [0, 0, 0], [1, 1, 0.82]);
  S.add(organic(new THREE.TorusGeometry(0.26, 0.07, 8, 20).rotateX(Math.PI / 2), 0.04, 6, 6), moss, j.spine, [0, 0.02, 0], [0, 0, 0], [1, 1, 0.85]);
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI * 0.8 + i * (Math.PI * 1.6 / 6);
    S.add(bend(rag(0.1, 0.18 + r() * 0.14, 30 + i, 3), -0.1), mossDark, j.spine, [Math.sin(a) * 0.29, 0.0, Math.cos(a) * 0.24], [0, a, 0]);
  }
  S.add(burl(0.4, 0.26, 0.3, 7, 0.14, 1.6), skin, j.chest, [0, 0.16, -0.05]);
  S.pair(burl(0.2, 0.16, 0.14, 8), skin, j.chest, null, [0.15, 0.2, 0.14]);
  for (let i = 0; i < 6; i++) {
    const x = (i - 2.5) * 0.12;
    S.add(taperTube([V(x, -0.1, 0.2), V(x * 1.2, 0.08, 0.26 - Math.abs(x) * 0.2), V(x * 1.1, 0.26, 0.22 - Math.abs(x) * 0.2), V(x * 0.9, 0.38, 0.1)], (t) => 0.032 * (1 - t * 0.4), 14, 6), wood, j.chest);
  }
  if (!C.heart) {
    S.add(new THREE.SphereGeometry(1, 12, 10), dark, j.chest, [0.02, 0.18, 0.24], [0, 0, 0.15], [0.05, 0.13, 0.04]);
    S.add(new THREE.SphereGeometry(1, 12, 10), sap, j.chest, [0.02, 0.18, 0.245], [0, 0, 0.15], [0.025, 0.1, 0.035]);
  }
  // shelf fungus on the flank, moss and a sapling on the back
  for (let i = 0; i < 4; i++) S.add(shelfGeo(0.07 - i * 0.012), shroom, j.chest, [-0.36 + i * 0.02, 0.28 - i * 0.07, -0.05 + i * 0.03], [0, 0, -0.1]);
  S.add(burl(0.3, 0.16, 0.2, 9, 0.2, 2), moss, j.chest, [0, 0.36, -0.2]);
  bough(j.chest, V(0.1, 0.4, -0.24), V(0.3, 1, -0.5), 0.3, 0.032, 1, 6, 0.13);

  // --- head: a burl with a heavy brow, knot-hole eyes, a hollow maw, a beard of moss and hanging roots
  S.add(burl(0.16, 0.16, 0.15, 10, 0.14), skin, j.head, [0, 0.08, 0.04]);
  S.add(burl(0.16, 0.045, 0.07, 11, 0.16, 3), wood, j.head, [0, 0.145, 0.16], [0.35, 0, 0]);
  S.pair(new THREE.SphereGeometry(1, 10, 8), dark, j.head, null, [0.062, 0.1, 0.19], [0, 0, 0], [0.04, 0.03, 0.025]);
  S.pair(new THREE.SphereGeometry(1, 10, 8), eye, j.head, null, [0.062, 0.1, 0.205], [0, 0, 0], [0.02, 0.015, 0.012]);
  S.add(new THREE.SphereGeometry(1, 12, 10), dark, j.head, [0, 0.01, 0.18], [0, 0, 0], [0.07, 0.045, 0.035]);
  S.add(new THREE.SphereGeometry(1, 12, 10), sap, j.head, [0, 0.005, 0.18], [0, 0, 0], [0.045, 0.02, 0.03]);
  beard(j.head, [0, -0.04, 0.14], 4, 0.07, 0.3, 40);
  for (let i = 0; i < 5; i++) {
    const x = (i - 2) * 0.05, len = 0.2 + r() * 0.15;
    S.add(taperTube([V(0, 0, 0), V(x * 0.3, -len * 0.4, 0.02), V(x * 0.6, -len * 0.8, 0.0), V(x, -len, 0.03)], (t) => 0.014 * (1 - t * 0.8), 8, 5), wood, j.head, [x, -0.03, 0.12]);
  }
  // branch antlers in leaf
  for (const s of [1, -1]) bough(j.head, V(s * 0.1, 0.18, 0), V(s * 0.8, 1, -0.2), 0.34, 0.04, 2, 5, 0.13);

  // --- shoulders: moss and leafy boughs; arms wound with roots; hands of root fingers
  for (const [sh, s] of [[j.shoulderL, 1], [j.shoulderR, -1]] as const) {
    S.add(burl(0.18, 0.13, 0.17, s > 0 ? 12 : 13, 0.2, 2), moss, sh, [s * 0.02, 0.07, 0]);
    bough(sh, V(s * 0.05, 0.14, -0.04), V(s * 0.5, 1, -0.2), 0.26, 0.032, 1, 6, 0.13);
  }
  rooted(P.upperL, 0.13, 0.11, j.shoulderL, j.shoulderR, 0.3);
  rooted(P.foreL, 0.13, 0.12, j.elbowL, j.elbowR, 0.4, 0.3);
  S.pair(burl(0.14, 0.13, 0.12, 14), skin, j.handL, j.handR, [0, -0.08, 0.02]);
  for (let f = 0; f < 4; f++) {
    S.pair(taperTube([V(0, 0, 0), V(0, -0.08, 0.02), V(0, -0.15, 0.06), V(0, -0.18, 0.11)], (t) => 0.03 * (1 - t * 0.75), 10, 6), wood, j.handL, j.handR, [(f - 1.5) * 0.055, -0.14, 0.04], [0, 0, (f - 1.5) * 0.12]);
  }
  S.pair(taperTube([V(0, 0, 0), V(0.05, -0.05, 0.05), V(0.06, -0.1, 0.1)], (t) => 0.028 * (1 - t * 0.75), 8, 6), wood, j.handL, j.handR, [0.1, -0.08, 0.04]);

  // --- the Thornheart: a heart in a cage of roots, a crown of branches in glowing blossom, a ring of thorns
  const orbiters: THREE.Group[] = [];
  let orbitRing: THREE.Group | null = null;
  let heart: THREE.Mesh | null = null;
  let heartMat: THREE.MeshStandardMaterial | null = null;
  if (C.heart) {
    const hm = heartMat = kit.glow(C.heart, 3.5 * C.glow);
    heart = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 2), hm);
    heart.castShadow = false;
    heart.position.set(0, 0.2, 0.3);
    j.chest.add(heart);
    S.add(new THREE.SphereGeometry(1, 14, 10), dark, j.chest, [0, 0.2, 0.24], [0, 0, 0], [0.14, 0.16, 0.08]);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      S.add(taperTube([V(c * 0.15, s * 0.17, -0.04), V(c * 0.14, s * 0.15, 0.06), V(c * 0.07, s * 0.08, 0.13), V(c * 0.01, s * 0.01, 0.15)], (t) => 0.024 * (1 - t * 0.6), 10, 6), wood, j.chest, [0, 0.2, 0.3]);
    }
    const blossom = kit.glow(C.heart, 2.4 * C.glow);
    S.glow(blossom);
    for (let i = 0; i < 5; i++) {
      const a = (i / 4 - 0.5) * 2.2;
      const tips = bough(j.head, V(Math.sin(a) * 0.1, 0.2, -0.02), V(Math.sin(a) * 0.7, 1, -0.25), 0.3, 0.035, 1, 2, 0.08);
      for (const tp of tips) S.add(organic(new THREE.IcosahedronGeometry(1, 1), 0.2, 6, i), blossom, j.head, [tp.x, tp.y, tp.z], [0, 0, 0], 0.035);
    }
    const thorn = kit.glow(C.heart, 2.2 * C.glow);
    S.glow(thorn);
    const ring = joint(j.root, 0, 1.4, 0);
    for (let i = 0; i < 6; i++) {
      const o = joint(ring);
      o.rotation.y = (i / 6) * Math.PI * 2;
      const shard = joint(o, 0.95, 0, 0);
      S.add(horn(0.4, 0.045, 0.5, V(0, 0, 1), V(0, 1, 0), 3), thorn, shard, [0, -0.2, 0]);
      orbiters.push(shard);
    }
    orbitRing = ring;
  }
  S.build();

  const root = j.root;
  root.scale.setScalar(C.scale);

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
    sap.emissiveIntensity = 2.2 * C.glow * (0.85 + Math.sin(t * 1.4) * 0.15);
    if (heart && heartMat) {
      const beat = Math.max(0, Math.sin(t * 3.2)) ** 4;
      heart.scale.setScalar(1 + beat * 0.35);
      heartMat.emissiveIntensity = 3.5 * C.glow * (1 + beat * 0.5);
    }
    if (orbitRing) {
      orbitRing.rotation.y = -t * 0.8;
      orbiters.forEach((o, i) => { o.rotation.z = Math.PI / 2 + Math.sin(t * 2 + i) * 0.2; o.position.y = Math.sin(t * 2 + i) * 0.12; });
    }
  }

  return { root, kit, joints: j, animate, height: 2.6, dispose() { kit.dispose(); } };
}
