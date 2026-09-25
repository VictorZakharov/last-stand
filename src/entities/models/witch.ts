// Rift Witch: a legless floating caster. Layered tattered robes end in a torn hem that trails void
// wisps; a deep hood hides everything but a horned bone mask with burning eyes; a ragged mantle of
// bone charms; bell sleeves and long clawed fingers cradling a void orb bound by turning rune rings.
import * as THREE from 'three';
import { createKit } from '../../core/materials';
import { grunge, pbrMaterialMaps, veins } from '../../core/textures';
import { buildHumanoid, joint, resetPose, idle, pulse } from './rig';
import { Sculpt, bend, horn, lathe, limb, organic, rag, skipping, stripRig, taperTube } from './shapes';
import type { AnimState, Model } from '../../types';
import { particles, col } from '../../fx/particles';
import { mulberry } from '../../util';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** an open robe cone (top radius r0 at y = 0, bottom r1 at -h) with a torn, uneven hem */
function tatteredSkirt(r0: number, r1: number, h: number, seed: number, radial = 28): THREE.BufferGeometry {
  if (skipping()) return new THREE.BufferGeometry();
  const r = mulberry(seed), geo = new THREE.CylinderGeometry(r0, r1, h, radial, 8, true).translate(0, -h / 2, 0);
  const cuts = Array.from({ length: radial + 1 }, () => r());
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = -y / h;
    const a = Math.atan2(z, x), c = cuts[Math.round(((a / (Math.PI * 2)) + 1) % 1 * radial)];
    // folds, and the lower edge torn into tongues of different lengths
    const fold = 1 + Math.sin(a * 9 + seed) * 0.06 * k;
    p.setXYZ(i, x * fold, k > 0.99 ? y + h * 0.55 * c * c : y, z * fold);
  }
  geo.computeVertexNormals();
  return geo;
}

export function buildWitch(): Model {
  const kit = createKit(0xd070ff);
  const g = pbrMaterialMaps(grunge(), 2, 1);
  const robe = kit.rim({ color: 0x3a1640, roughness: 0.85, map: g.map, normalMap: g.normalMap, side: THREE.DoubleSide }, 0x9050c0, 0.4);
  const robe2 = kit.std({ color: 0x1a0a1e, roughness: 0.95, normalMap: g.normalMap, side: THREE.DoubleSide, emissive: 0xa040ff, emissiveMap: veins(31, 4), emissiveIntensity: 0.6 });
  const skin = kit.rim({ color: 0x8a8298, roughness: 0.6 }, 0xa080d0, 0.3);
  const bone = kit.std({ color: 0xd8ccb0, roughness: 0.5, normalMap: g.normalMap, normalScale: new THREE.Vector2(0.5, 0.5) });
  const dark = kit.std({ color: 0x030205, roughness: 1 });
  const face = kit.glow(0xe060ff, 6);
  const orbMat = kit.glow(0xc050ff, 4);
  const hem = kit.glow(0x9030ff, 2);
  const shell = kit.phys({ color: 0x2a0a40, roughness: 0.05, clearcoat: 1, transparent: true, opacity: 0.2, depthWrite: false, emissive: 0x6020a0, emissiveIntensity: 0.3 });

  const j = buildHumanoid({ skin: robe }, {
    hipY: 1.05, chestW: 0.17, chestD: 0.12, waistW: 0.12, upperR: 0.045, foreR: 0.04, headR: 0.11,
  });
  stripRig(j.root);
  const P = j.P, S = new Sculpt('witch').glow(face).glow(orbMat).glow(hem);

  // --- robes: two torn layers from the waist, a glowing hem, a sash
  const skirt = joint(j.hips, 0, 0.08, 0);
  S.add(tatteredSkirt(0.16, 0.3, 1.0, 3, 20), robe, skirt);
  S.add(tatteredSkirt(0.14, 0.2, 1.2, 8, 16), robe2, skirt, [0, 0, 0], [0, 0.4, 0]);
  S.add(new THREE.TorusGeometry(0.16, 0.022, 6, 24).rotateX(Math.PI / 2), robe2, j.hips, [0, 0.1, 0]);
  // bone charms hanging off the sash
  for (let i = 0; i < 5; i++) {
    const a = -0.9 + i * 0.45;
    S.add(taperTube([V(0, 0, 0), V(0, -0.08, 0.01)], () => 0.004, 4, 4), bone, j.hips, [Math.sin(a) * 0.16, 0.08, Math.cos(a) * 0.15]);
    S.add(new THREE.OctahedronGeometry(0.02, 0), bone, j.hips, [Math.sin(a) * 0.16, 0.0, Math.cos(a) * 0.155], [0, a, 0], [0.8, 1.6, 0.5]);
  }
  // trailing ribbons behind, each on its own joint
  const ribbons: THREE.Group[] = [];
  for (const [x, len, seed] of [[0.07, 0.9, 1], [-0.06, 1.05, 2], [0, 0.75, 3]] as const) {
    const rj = joint(j.hips, x, 0.05, -0.14);
    S.add(bend(rag(0.08, len, seed, 2), 0.2), robe2, rj);
    ribbons.push(rj);
  }

  // --- torso, a ragged mantle over the shoulders, bone necklace and shoulder spurs
  S.add(organic(new THREE.SphereGeometry(1, 14, 10), 0.06, 4, 1), robe, j.spine, [0, 0.12, 0], [0, 0, 0], [0.12, 0.17, 0.09]);
  S.add(organic(new THREE.SphereGeometry(1, 18, 12), 0.05, 4, 2), robe, j.chest, [0, 0.06, 0], [0, 0, 0], [0.16, 0.18, 0.11]);
  S.add(tatteredSkirt(0.1, 0.3, 0.36, 5, 20), robe2, j.chest, [0, 0.3, -0.01], [0, 0, 0], [1, 1, 0.85]);
  for (let i = 0; i < 9; i++) {
    const a = -1.3 + i * 0.325;
    S.add(horn(0.07, 0.012, 0.6, V(1, 0, 0), V(0, -1, 0.3)), bone, j.chest, [Math.sin(a) * 0.15, 0.26 - Math.cos(a) * 0.02, Math.cos(a) * 0.115], [0, a, 0]);
  }
  S.add(new THREE.TorusGeometry(0.14, 0.006, 4, 24, Math.PI * 1.3).rotateX(Math.PI / 2).rotateY(-Math.PI * 0.15 + Math.PI / 2 + Math.PI), bone, j.chest, [0, 0.27, 0.0]);
  S.pair(horn(0.24, 0.028, -0.8, V(0, 0, 1), V(0.5, 1, -0.2), 5), bone, j.shoulderL, j.shoulderR, [0.02, 0.06, -0.02]);
  S.pair(horn(0.15, 0.02, -0.7, V(0, 0, 1), V(0.8, 0.7, -0.4)), bone, j.shoulderL, j.shoulderR, [0.05, 0.04, -0.05]);

  // --- head: a deep pointed hood; inside it darkness, a bone mask with antler horns and burning eyes
  S.add(limb(0.12, 0.04, 0.045), skin, j.neck, [0, 0.1, 0], [Math.PI, 0, 0]);
  const hood = lathe([[0.001, -0.02], [0.13, 0.0], [0.16, 0.1], [0.14, 0.2], [0.08, 0.28], [0.02, 0.33], [0.001, 0.34]], 20);
  const hp = hood.attributes.position;
  if (hp) for (let i = 0; i < hp.count; i++) { const y = hp.getY(i), z = hp.getZ(i); hp.setZ(i, z - y * y * 1.6); if (z > 0.06 && y < 0.24) hp.setZ(i, 0.06 + (z - 0.06) * 0.25); }
  if (hp) hood.computeVertexNormals();
  S.add(organic(hood, 0.006, 20, 3), robe, j.head, [0, 0.02, -0.02]);
  S.add(new THREE.SphereGeometry(0.1, 14, 10), dark, j.head, [0, 0.1, 0.0]);
  S.add(organic(new THREE.SphereGeometry(1, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), 0.04, 8, 4), bone, j.head, [0, 0.11, 0.04], [Math.PI / 2 - 0.2, 0, 0], [0.075, 0.09, 0.075]);
  S.pair(new THREE.SphereGeometry(0.02, 10, 8), dark, j.head, null, [0.03, 0.115, 0.108], [0, 0, 0], [1.2, 0.7, 0.6]);
  S.pair(new THREE.SphereGeometry(0.011, 8, 6), face, j.head, null, [0.03, 0.114, 0.115], [0, 0, -0.3], [1.5, 0.8, 1]);
  S.add(new THREE.BoxGeometry(0.004, 0.05, 0.004), dark, j.head, [0, 0.07, 0.12], [0.2, 0, 0]);
  S.pair(horn(0.26, 0.018, 1.1, V(1, 0, 0.2), V(0.35, 1, 0.15), 4), bone, j.head, null, [0.05, 0.16, 0.07]);
  S.pair(horn(0.1, 0.01, 0.9, V(1, 0, 0), V(0.8, 0.6, 0)), bone, j.head, null, [0.1, 0.24, 0.04]);

  // --- arms: bell sleeves, grey skin, long clawed fingers
  S.pair(organic(new THREE.SphereGeometry(1, 12, 8), 0.05, 5, 6), robe, j.shoulderL, j.shoulderR, [0, 0, 0], [0, 0, 0], [0.065, 0.06, 0.065]);
  S.pair(limb(P.upperL, 0.05, 0.045, 0.1), robe, j.shoulderL, j.shoulderR);
  S.pair(lathe([[0.001, -P.foreL - 0.04], [0.085, -P.foreL - 0.02], [0.075, -P.foreL + 0.05], [0.048, -0.05], [0.045, 0.02], [0.001, 0.03]], 16), robe, j.elbowL, j.elbowR);
  S.pair(organic(new THREE.SphereGeometry(1, 10, 8), 0.06, 5, 7), skin, j.handL, j.handR, [0, -0.03, 0.005], [0, 0, 0], [0.035, 0.045, 0.018]);
  for (let f = 0; f < 4; f++) {
    const len = f === 0 || f === 3 ? 0.1 : 0.12;
    S.pair(taperTube([V(0, 0, 0), V(0, -len * 0.5, 0.015), V(0, -len, 0.04), V(0, -len * 1.15, 0.07)], (t) => 0.008 * (1 - t * 0.8), 10, 5),
      bone, j.handL, j.handR, [(f - 1.5) * 0.016, -0.06, 0.005]);
  }

  // --- the orb between the hands: a dark glass shell over a burning core, two rune rings turning
  const orbJ = joint(j.chest, 0, 0.0, 0.38);
  const orbCore = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 12), orbMat);
  orbCore.castShadow = false;
  orbJ.add(orbCore);
  S.add(new THREE.SphereGeometry(0.1, 20, 16), shell, orbJ);
  S.glow(shell);
  const ringA = joint(orbJ), ringB = joint(orbJ);
  S.add(new THREE.TorusGeometry(0.15, 0.005, 4, 40), orbMat, ringA);
  for (let i = 0; i < 6; i++) S.add(new THREE.OctahedronGeometry(0.012, 0), orbMat, ringA, [Math.cos(i) * 0.15, Math.sin(i) * 0.15, 0]);
  S.add(new THREE.TorusGeometry(0.19, 0.004, 4, 44), hem, ringB);
  S.build();

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
    ribbons.forEach((r, i) => { r.rotation.x = 0.25 + st.move * 0.6 + Math.sin(t * 2.6 + i * 1.3) * 0.15; r.rotation.z = Math.sin(t * 1.9 + i) * 0.12; });
    j.neck.rotation.x += -0.1; j.head.rotation.z = Math.sin(t * 0.8) * 0.08;
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
      glow = 1 + w * 1.5;
    } else orbJ.position.z = 0.38;
    orbCore.scale.setScalar(glow * 0.8 + Math.sin(t * 8) * 0.05);
    orbMat.emissiveIntensity = 2 * glow;
    ringA.rotation.set(t * 1.3, t * 0.7, 0);
    ringB.rotation.set(-t * 0.6, 0, t * 1.1);
    hem.emissiveIntensity = 1.6 + Math.sin(t * 2) * 0.4;
    if (st.hit > 0) j.spine.rotation.x += -0.4 * st.hit;
    if (st.dead >= 0) { j.body.position.y *= 1 - st.dead; j.body.rotation.x = st.dead * 0.8; }

    // wisps trailing from the hem
    acc += dt;
    if (st.dead < 0 && acc > 0.06) {
      acc = 0;
      skirt.getWorldPosition(wp);
      particles.glow.spawn({
        x: wp.x + (Math.random() - 0.5) * 0.5, y: wp.y - 0.7, z: wp.z + (Math.random() - 0.5) * 0.5,
        vy: -0.2, life: 0.8, size: 0.28, sizeEnd: 0.05, color: col(0x8030ff, 1.2), colorEnd: col(0x200040, 0.3), alpha: 0.7,
      });
    }
  }

  return { root, kit, joints: j, animate, tip: orbJ, height: 2.1, dispose() { kit.dispose(); } };
}
