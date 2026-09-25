// Sporecaller: a stooped fungal shaman. A broad wavy cap studded with glowing warts, gills and a lacy veil
// underneath, a gaunt pale face with hollow eyes and mouth tendrils; layered robes threaded with glowing
// mycelium, shelf fungi growing over the shoulders and back, long knotted fingers, spore sacs on the belt,
// and a gnarled staff whose roots cage a glowing spore pod (the cast origin).
import * as THREE from 'three';
import { createKit } from '../../core/materials';
import { bark, grunge, pbrMaterialMaps, veins } from '../../core/textures';
import { buildHumanoid, joint, resetPose, walkCycle, idle, deathFall, pulse } from './rig';
import { Sculpt, lathe, limb, organic, stripRig, taperTube, tatteredSkirt, skipping } from './shapes';
import type { AnimState, Model } from '../../types';
import { particles, col } from '../../fx/particles';
import { mulberry } from '../../util';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const CAP_R = 0.34, CAP_H = 0.22;
/** height of the cap's dome at radius `r` */
const domeY = (r: number) => CAP_H - Math.pow(r / CAP_R, 2.2) * (CAP_H - 0.03);

/** the cap: a dome whose rim waves and curls under */
function capGeo(): THREE.BufferGeometry {
  if (skipping()) return new THREE.BufferGeometry();
  const prof: [number, number][] = [[CAP_R * 0.86, -0.005], [CAP_R, 0.02]];
  for (let i = 9; i >= 0; i--) { const rr = (i / 10) * CAP_R * 0.97; prof.push([rr, domeY(rr)]); }
  const g = lathe(prof, 40), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), rr = Math.hypot(x, z);
    if (rr > CAP_R * 0.6) p.setY(i, p.getY(i) + Math.sin(Math.atan2(z, x) * 7) * 0.02 * (rr - CAP_R * 0.6) / (CAP_R * 0.4));
  }
  g.computeVertexNormals();
  return g;
}

export function buildSporecaller(): Model {
  const kit = createKit(0xa0ff50);
  const g = pbrMaterialMaps(grunge(), 2, 1);
  const b = pbrMaterialMaps(bark(), 1, 1.2);
  const flesh = kit.rim({ color: 0xb8ac8a, roughness: 0.7, map: g.map, normalMap: g.normalMap, emissive: 0x9cff3a, emissiveMap: veins(51, 4), emissiveIntensity: 0.3 }, 0xc8ffa0, 0.25);
  const robe = kit.rim({ color: 0x3a2e20, roughness: 0.95, map: g.map, normalMap: g.normalMap, side: THREE.DoubleSide }, 0x7a8a50, 0.3);
  const robe2 = kit.std({ color: 0x1e1a12, roughness: 0.95, normalMap: g.normalMap, side: THREE.DoubleSide, emissive: 0x9cff3a, emissiveMap: veins(57, 5), emissiveIntensity: 0.5 });
  const cap = kit.rim({ color: 0x6a2a3a, roughness: 0.5, map: g.map, normalMap: g.normalMap, emissive: 0x3a1020, emissiveIntensity: 0.4 }, 0xff80a0, 0.25);
  const gills = kit.std({ color: 0xd8cfa8, roughness: 0.9, side: THREE.DoubleSide });
  const shelf = kit.rim({ color: 0x8a6a40, roughness: 0.7, map: g.map }, 0xd0b080, 0.25);
  const wood = kit.std({ color: 0x6a5440, roughness: 0.9, map: b.map, normalMap: b.normalMap });
  const dark = kit.std({ color: 0x050805, roughness: 1 });
  const spots = kit.glow(0xc8ff60, 2.5);
  // a sac of light: veined, glowing brightest at its edges
  const pod = kit.rim({ color: 0x2e4a10, roughness: 0.3, emissive: 0x9cff3a, emissiveMap: veins(61, 6), emissiveIntensity: 1.2 }, 0xb8ff50, 0.9);
  const eye = kit.glow(0xc8ff60, 6);

  const j = buildHumanoid({ skin: robe }, {
    hipY: 0.72, thighL: 0.36, shinL: 0.34, chestW: 0.17, chestD: 0.13, waistW: 0.15, torsoL: 0.46,
    upperR: 0.05, foreR: 0.045, headR: 0.1, neckL: 0.12,
  });
  stripRig(j.root);
  const P = j.P, S = new Sculpt('sporecaller').glow(spots).glow(eye);
  const r = mulberry(33);
  const shelfGeo = (rad: number) => lathe([[0.001, 0.3 * rad], [0.6 * rad, 0.26 * rad], [rad, 0.04 * rad], [0.9 * rad, 0], [0.001, 0.02 * rad]], 12);

  // --- legs: hidden under the robes but for bare knotted feet
  S.pair(limb(P.shinL, 0.04, 0.035), flesh, j.kneeL, j.kneeR);
  S.pair(organic(new THREE.SphereGeometry(1, 10, 8), 0.1, 5, 1), flesh, j.ankleL, j.ankleR, [0, -0.02, 0.04], [0, 0, 0], [0.04, 0.025, 0.08]);

  // --- robes: two torn layers from the waist, the inner one threaded with glowing mycelium; a rope belt with spore sacs
  const skirt = joint(j.hips, 0, 0.06, 0);
  S.add(tatteredSkirt(0.17, 0.33, 0.74, 12, 22), robe, skirt);
  S.add(tatteredSkirt(0.15, 0.26, 0.8, 13, 18), robe2, skirt, [0, 0, 0], [0, 0.5, 0]);
  S.add(new THREE.TorusGeometry(0.165, 0.018, 6, 24).rotateX(Math.PI / 2), wood, j.hips, [0, 0.08, 0]);
  for (const [a, s] of [[0.5, 0.04], [-0.7, 0.034], [2.6, 0.03]] as const) {
    S.add(taperTube([V(0, 0, 0), V(0, -0.05, 0.01)], () => 0.005, 4, 4), wood, j.hips, [Math.sin(a) * 0.17, 0.08, Math.cos(a) * 0.17]);
    S.add(organic(new THREE.SphereGeometry(1, 12, 10), 0.12, 6, 20 + a), pod, j.hips, [Math.sin(a) * 0.175, 0.0, Math.cos(a) * 0.175], [0, 0, 0], [s, s * 1.3, s]);
  }

  // --- torso: hunched under a mantle; shelf fungi climb the shoulders and the back
  S.add(organic(new THREE.SphereGeometry(1, 14, 10), 0.06, 4, 2), robe, j.spine, [0, 0.12, 0], [0, 0, 0], [0.15, 0.17, 0.12]);
  S.add(organic(new THREE.SphereGeometry(1, 18, 12), 0.06, 4, 3), robe, j.chest, [0, 0.08, -0.01], [0, 0, 0], [0.18, 0.2, 0.14]);
  S.add(tatteredSkirt(0.1, 0.3, 0.34, 14, 22), robe2, j.chest, [0, 0.3, -0.01], [0, 0, 0], [1, 1, 0.85]);
  for (let i = 0; i < 5; i++) {
    const s = 0.07 - i * 0.008, side = i % 2 ? -1 : 1;
    S.add(shelfGeo(s), shelf, j.chest, [side * (0.07 + r() * 0.08), 0.26 - i * 0.06, -0.15], [0.15, side * 0.4, 0]);
  }
  for (const [sh, s] of [[j.shoulderL, 1], [j.shoulderR, -1]] as const) {
    for (let i = 0; i < 3; i++) S.add(shelfGeo(0.06 - i * 0.012), shelf, sh, [s * (0.06 + i * 0.012), 0.06 - i * 0.05, -0.02 + i * 0.02], [0, 0, -s * (0.15 + i * 0.1)]);
  }

  // --- head: a gaunt pale face under the cap: hollow eyes, tendrils for a mouth
  S.add(limb(0.14, 0.035, 0.045), flesh, j.neck, [0, 0.12, 0], [Math.PI, 0, 0]);
  S.add(organic(new THREE.SphereGeometry(1, 16, 12), 0.06, 5, 4), flesh, j.head, [0, 0.03, 0.01], [0, 0, 0], [0.075, 0.1, 0.075]);
  S.pair(new THREE.SphereGeometry(1, 10, 8), dark, j.head, null, [0.03, 0.05, 0.066], [0, 0, 0], [0.024, 0.02, 0.012]);
  S.pair(new THREE.SphereGeometry(1, 10, 8), eye, j.head, null, [0.03, 0.05, 0.072], [0, 0, 0], [0.012, 0.01, 0.006]);
  for (let i = 0; i < 6; i++) {
    const x = (i - 2.5) * 0.014, len = 0.08 + r() * 0.06;
    S.add(taperTube([V(0, 0, 0), V(x * 0.3, -len * 0.4, 0.015), V(x * 0.6, -len * 0.8, 0.0), V(x, -len, 0.02)], (t) => 0.007 * (1 - t * 0.8), 8, 4), flesh, j.head, [x, -0.02, 0.06]);
  }
  // the cap, its gills, glowing warts, and the veil hanging from the stalk
  const capJ = joint(j.head, 0, 0.1, -0.01);
  S.add(capGeo(), cap, capJ);
  S.add(lathe([[CAP_R * 0.88, 0.0], [0.05, 0.03]], 40), gills, capJ);
  for (let i = 0; i < 44; i++) {
    const a = (i / 44) * Math.PI * 2;
    S.add(new THREE.PlaneGeometry(CAP_R * 0.8, 0.028).translate(CAP_R * 0.47, -0.012, 0), gills, capJ, [0, 0.02, 0], [0, -a, 0]);
  }
  for (let i = 0; i < 16; i++) {
    const a = i * 2.4 + r(), rr = CAP_R * (0.15 + 0.75 * Math.sqrt((i + 0.5) / 16)), s = 0.018 + r() * 0.02, tilt = rr / CAP_R * 1.1;
    S.add(organic(new THREE.SphereGeometry(1, 8, 6), 0.15, 4, i), spots, capJ, [Math.cos(a) * rr, domeY(rr) + 0.004, Math.sin(a) * rr], [Math.sin(a) * tilt, 0, -Math.cos(a) * tilt], [s, s * 0.4, s]);
  }
  S.add(tatteredSkirt(0.05, 0.12, 0.14, 15, 16), gills, capJ, [0, 0.0, 0]);

  // --- arms: bell sleeves, pale knotted hands with long fingers
  S.pair(organic(new THREE.SphereGeometry(1, 12, 8), 0.05, 5, 5), robe, j.shoulderL, j.shoulderR, [0, 0, 0], [0, 0, 0], [0.07, 0.065, 0.07]);
  S.pair(limb(P.upperL, 0.055, 0.05, 0.1), robe, j.shoulderL, j.shoulderR);
  S.pair(lathe([[0.001, -P.foreL - 0.04], [0.09, -P.foreL - 0.02], [0.08, -P.foreL + 0.05], [0.052, -0.05], [0.05, 0.02], [0.001, 0.03]], 16), robe, j.elbowL, j.elbowR);
  S.pair(organic(new THREE.SphereGeometry(1, 10, 8), 0.08, 5, 6), flesh, j.handL, j.handR, [0, -0.03, 0.005], [0, 0, 0], [0.035, 0.045, 0.02]);
  for (let f = 0; f < 3; f++) {
    S.pair(taperTube([V(0, 0, 0), V(0, -0.05, 0.012), V(0, -0.09, 0.03), V(0, -0.11, 0.055)], (t) => 0.009 * (1 - t * 0.6), 10, 5),
      flesh, j.handL, j.handR, [(f - 1) * 0.018, -0.06, 0.005]);
  }

  // --- the staff: a gnarled root whose top splits into prongs round the spore pod
  const staff = joint(j.handR, 0, -0.06, 0.02);
  S.add(taperTube([V(0, -0.4, 0), V(0.02, 0.1, 0.01), V(-0.015, 0.5, -0.01), V(0.01, 0.9, 0.01), V(0, 1.02, 0)], (t) => 0.03 - t * 0.008, 24, 7), wood, staff);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    S.add(taperTube([V(0, 0.98, 0), V(c * 0.08, 1.06, s * 0.08), V(c * 0.1, 1.16, s * 0.1), V(c * 0.04, 1.26, s * 0.04)], (t) => 0.02 * (1 - t * 0.8), 12, 5), wood, staff);
  }
  for (let i = 0; i < 3; i++) S.add(shelfGeo(0.045 - i * 0.008), shelf, staff, [Math.cos(i * 2.2) * 0.03, 0.3 + i * 0.13, Math.sin(i * 2.2) * 0.03], [0, -i * 2.2, 0]);
  const tip = joint(staff, 0, 1.12, 0);
  const podMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07, 3).scale(1, 1.25, 1), pod);
  podMesh.castShadow = false;
  tip.add(podMesh);
  S.build();

  const root = j.root;
  let acc = 0;
  const wp = new THREE.Vector3();

  function animate(st: AnimState): void {
    const { t, dt } = st;
    resetPose(j);
    idle(j, t, 1 - st.move);
    walkCycle(j, st.phase, st.move, { stride: 0.4, knee: 0.7, arm: 0.15, bob: 0.05 });
    j.spine.rotation.x += 0.3; j.neck.rotation.x += 0.1;
    j.head.rotation.z = Math.sin(t * 1.4) * 0.08;
    capJ.rotation.x = Math.sin(t * 1.1) * 0.04; capJ.rotation.z = Math.sin(t * 1.3 + 1) * 0.04;
    // staff held upright out front
    j.shoulderR.rotation.x += -0.5; j.elbowR.rotation.x += -0.9; staff.rotation.x = 1.3;
    j.shoulderL.rotation.x += -0.3; j.elbowL.rotation.x += -0.5;
    skirt.rotation.x = -st.move * 0.2 + Math.sin(t * 2) * 0.03;
    let glow = 1;
    const a = st.action;
    if (a && a.name === 'attack') {
      const w = pulse(a.t, 0, 1);
      j.shoulderR.rotation.x += -1.3 * w; j.elbowR.rotation.x += 0.7 * w;
      j.spine.rotation.x += -0.25 * w;
      j.head.rotation.x += -0.2 * w;
      glow = 1 + w * 1.5;
    }
    podMesh.scale.setScalar(0.9 + glow * 0.1 + Math.sin(t * 6) * 0.05);
    pod.emissiveIntensity = 1.2 * glow;
    spots.emissiveIntensity = 2.2 + Math.sin(t * 1.8) * 0.4;
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
