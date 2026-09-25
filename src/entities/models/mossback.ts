// Mossback: a hulking, hunched forest beast that the wood has half grown over. Its back is a mound of
// moss and old stones sprouting ferns and glowcaps; moss hangs in beards from its jaw, belly and arms.
// A broad bony skull with a heavy brow, amber eyes deep in their sockets and upcurled tusks; gorilla
// arms ending in knuckled fists with hooked claws.
import * as THREE from 'three';
import { createKit } from '../../core/materials';
import { grunge, pbrMaterialMaps } from '../../core/textures';
import { buildHumanoid, joint, resetPose, walkCycle, idle, deathFall, pulse, ramp } from './rig';
import { Sculpt, bend, frond, horn, lathe, limb, organic, rag, stripRig, taperTube } from './shapes';
import type { AnimState, Model } from '../../types';
import { mulberry } from '../../util';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export function buildMossback(): Model {
  const kit = createKit(0x9cff6a);
  const g = pbrMaterialMaps(grunge(), 2, 1);
  const hide = kit.rim({ color: 0x5e4a38, roughness: 0.8, map: g.map, normalMap: g.normalMap, normalScale: new THREE.Vector2(1.8, 1.8) }, 0x8a9a60, 0.3);
  const moss = kit.rim({ color: 0x33561a, roughness: 1, map: g.map, normalMap: g.normalMap, normalScale: new THREE.Vector2(3, 3) }, 0x6a9a3a, 0.15);
  const mossDark = kit.std({ color: 0x2c4a1a, roughness: 1, normalMap: g.normalMap, side: THREE.DoubleSide });
  const stone = kit.std({ color: 0x6a6c64, roughness: 0.85, map: g.map, normalMap: g.normalMap, flatShading: true });
  const bone = kit.std({ color: 0xd8ccae, roughness: 0.45, normalMap: g.normalMap, normalScale: new THREE.Vector2(0.5, 0.5) });
  const claw = kit.std({ color: 0x241a12, roughness: 0.35 });
  const fern = kit.rim({ color: 0x3f7a2a, roughness: 0.7, side: THREE.DoubleSide }, 0x7ab050, 0.2);
  const stem = kit.std({ color: 0x8a8270, roughness: 0.8 });
  const shroom = kit.std({ color: 0x0a221c, emissive: 0x2affc8, emissiveIntensity: 1.4, roughness: 0.6 });
  const eye = kit.glow(0xffb040, 7);

  const j = buildHumanoid({ skin: hide }, {
    hipY: 0.78, hipW: 0.24, thighL: 0.36, shinL: 0.36, thighR: 0.1, shinR: 0.085,
    torsoL: 0.58, chestW: 0.3, chestD: 0.22, waistW: 0.2, shoulderW: 0.34,
    upperL: 0.4, foreL: 0.42, upperR: 0.09, foreR: 0.09, handR: 0.11, neckL: 0.02, headR: 0.12,
  });
  stripRig(j.root);
  const P = j.P, S = new Sculpt('mossback').glow(eye).glow(shroom).glow(fern);
  // the head juts forward from under the hump
  j.neck.position.set(0, P.torsoL * 0.42, 0.18);
  const r = mulberry(29);
  const lim = (len: number, r0: number, r1: number, b = 0, at = 0.35) => organic(limb(len, r0, r1, b, at, 14), r0 * 0.12, 10, len * 20);
  // small lumps need less detail
  const lump = (sx: number, sy: number, sz: number, seed: number, amp = 0.14, f = 1.8) => organic(new THREE.IcosahedronGeometry(1, Math.max(sx, sy, sz) > 0.12 ? 2 : 1), amp, f, seed).scale(sx, sy, sz);
  const cap = (rad: number) => lathe([[0.001, 0.5 * rad], [0.5 * rad, 0.45 * rad], [0.85 * rad, 0.25 * rad], [rad, 0.02], [0.8 * rad, 0], [0.001, 0.05 * rad]], 12);
  const beard = (parent: THREE.Object3D, pos: [number, number, number], n: number, w: number, len: number, seed: number, yaw = 0) => {
    for (let i = 0; i < n; i++) S.add(bend(rag(w, len * (0.7 + r() * 0.6), seed + i, 3), -0.15), mossDark, parent, [pos[0] + (i - (n - 1) / 2) * w * 0.7, pos[1], pos[2]], [0, yaw + (r() - 0.5) * 0.5, 0]);
  };

  // --- legs: short and thick, a mossy knee, broad feet with three claws
  S.pair(lim(P.thighL, 0.13, 0.1, 0.3, 0.3), hide, j.thighL, j.thighR);
  S.pair(lim(P.shinL, 0.1, 0.08, 0.3, 0.25), hide, j.kneeL, j.kneeR);
  S.pair(lump(0.07, 0.06, 0.05, 3), moss, j.kneeL, j.kneeR, [0.02, 0.0, 0.07]);
  S.pair(lump(0.09, 0.055, 0.14, 4, 0.1), hide, j.ankleL, j.ankleR, [0, -0.04, 0.05]);
  for (const x of [-0.05, 0, 0.05]) S.pair(horn(0.08, 0.02, 0.9, V(1, 0, 0), V(0, -0.2, 1)), claw, j.ankleL, j.ankleR, [x, -0.05, 0.15]);

  // --- body: a heavy gut, a barrel chest, and the hump: moss over stones, grown with ferns and glowcaps
  S.add(lump(0.25, 0.14, 0.2, 5), hide, j.hips, [0, 0.02, 0]);
  S.add(lump(0.27, 0.22, 0.23, 6), hide, j.spine, [0, 0.18, 0.02]);
  S.add(lump(0.34, 0.25, 0.26, 7), hide, j.chest, [0, 0.14, 0.02]);
  S.add(lump(0.44, 0.3, 0.36, 8, 0.2, 1.5), moss, j.chest, [0, 0.3, -0.12]);
  S.add(lump(0.3, 0.2, 0.26, 9, 0.2, 1.5), moss, j.spine, [0, 0.2, -0.13]);
  const stones: [number, number, number, number][] = [[0.18, 0.5, -0.2, 0.1], [-0.2, 0.46, -0.24, 0.12], [0.02, 0.56, -0.12, 0.09], [-0.08, 0.36, -0.42, 0.11], [0.24, 0.3, -0.34, 0.08]];
  stones.forEach(([x, y, z, s], i) => S.add(organic(new THREE.DodecahedronGeometry(1, 0), 0.08, 2, 40 + i), stone, j.chest, [x, y, z], [r() * 3, r() * 3, 0], [s, s * 0.8, s]));
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + r() * 0.4;
    S.add(frond(0.36 + r() * 0.16, 6, 0.5, 60 + i), fern, j.chest, [0.03 + Math.sin(a) * 0.05, 0.52, -0.2 + Math.cos(a) * 0.05], [0.7 * Math.cos(a) - 0.3, a, 0.7 * Math.sin(a) * 0.5]);
  }
  for (let i = 0; i < 6; i++) {
    const x = (r() - 0.5) * 0.5, y = 0.12 + r() * 0.3, z = -0.36 - r() * 0.06, s = 0.035 + r() * 0.03;
    S.add(new THREE.CylinderGeometry(s * 0.25, s * 0.35, s * 1.4, 6).translate(0, s * 0.7, 0), stem, j.chest, [x, y, z], [-0.5, 0, x * 1.5]);
    S.add(cap(s).translate(0, s * 1.35, 0), shroom, j.chest, [x, y, z], [-0.5, 0, x * 1.5]);
  }
  // shelf fungus stepping down one flank
  for (let i = 0; i < 3; i++) S.add(cap(0.06 - i * 0.012), shroom, j.chest, [0.33, 0.25 - i * 0.07, -0.08 + i * 0.03], [0, 0, 1.3], [1, 0.4, 1]);
  for (let i = 0; i < 8; i++) {
    const a = r() * Math.PI * 2, e = 0.2 + r() * 0.9;
    S.add(lump(0.09 + r() * 0.06, 0.06 + r() * 0.04, 0.09 + r() * 0.06, 120 + i, 0.2, 2.5), moss, j.chest, [Math.cos(a) * Math.cos(e) * 0.4, 0.3 + Math.sin(e) * 0.26, -0.12 + Math.sin(a) * Math.cos(e) * 0.3]);
  }
  beard(j.spine, [0, 0.06, 0.22], 4, 0.09, 0.22, 70);
  beard(j.chest, [0, 0.22, -0.4], 3, 0.1, 0.3, 80, Math.PI);

  // --- head: a broad bony skull with a heavy brow, sunken amber eyes, a snout; tusks curl up from the jaw
  S.add(lim(0.14, 0.09, 0.1), hide, j.neck, [0, 0.1, -0.04], [Math.PI - 0.6, 0, 0]);
  S.add(lump(0.15, 0.12, 0.16, 10, 0.1), hide, j.head, [0, 0.05, 0.06]);
  S.add(lump(0.14, 0.04, 0.07, 11, 0.12, 3), hide, j.head, [0, 0.105, 0.15], [0.35, 0, 0]);
  S.add(lump(0.08, 0.06, 0.08, 12, 0.1), hide, j.head, [0, 0.04, 0.2]);
  S.pair(new THREE.SphereGeometry(0.016, 8, 6), claw, j.head, null, [0.03, 0.05, 0.27]);
  S.pair(new THREE.SphereGeometry(1, 10, 8), claw, j.head, null, [0.068, 0.078, 0.17], [0, 0, 0], [0.035, 0.024, 0.025]);
  S.pair(new THREE.SphereGeometry(1, 10, 8), eye, j.head, null, [0.068, 0.078, 0.187], [0, 0, 0], [0.018, 0.013, 0.01]);
  S.add(lump(0.12, 0.05, 0.1, 13, 0.12, 2.5), moss, j.head, [0, 0.15, 0.02]);
  S.pair(horn(0.12, 0.02, 0.8, V(0, 0, 1), V(1, 0.3, -0.4)), bone, j.head, null, [0.12, 0.1, 0.03]);
  const jaw = joint(j.head, 0, 0.0, 0.08);
  S.add(lump(0.13, 0.045, 0.13, 14, 0.1), hide, jaw, [0, -0.04, 0.07]);
  S.pair(horn(0.18, 0.028, 1.5, V(1, 0, 0), V(0.25, 1, 0.35), 4), bone, jaw, null, [0.08, -0.02, 0.15]);
  for (let i = -2; i <= 2; i++) S.add(new THREE.ConeGeometry(0.009, 0.03, 4), bone, jaw, [i * 0.022, 0.0, 0.18 - Math.abs(i) * 0.012]);
  beard(jaw, [0, -0.07, 0.08], 3, 0.07, 0.2, 90);

  // --- arms: gorilla arms, forearms heavier than the upper arm, mossy shoulders, knuckled clawed fists
  S.pair(lump(0.16, 0.13, 0.16, 15, 0.2, 1.5), moss, j.shoulderL, j.shoulderR, [0.02, 0.05, -0.02]);
  S.pair(organic(new THREE.DodecahedronGeometry(1, 0), 0.08, 2, 16), stone, j.shoulderL, j.shoulderR, [0.06, 0.16, -0.04], [0.4, 0.3, 0], [0.07, 0.06, 0.07]);
  S.pair(frond(0.24, 6, 0.5, 17), fern, j.shoulderL, j.shoulderR, [0.02, 0.15, -0.06], [-0.5, 0, -0.5]);
  S.pair(lim(P.upperL, 0.1, 0.085, 0.3), hide, j.shoulderL, j.shoulderR);
  S.pair(lim(P.foreL, 0.11, 0.1, 0.4, 0.3), hide, j.elbowL, j.elbowR);
  S.pair(lump(0.09, 0.14, 0.08, 18, 0.2, 2), moss, j.elbowL, j.elbowR, [0.02, -0.1, -0.07]);
  for (const [el, s] of [[j.elbowL, 1], [j.elbowR, -1]] as const) beard(el, [s * 0.02, -0.16, -0.1], 3, 0.06, 0.24, s > 0 ? 100 : 110, Math.PI);
  S.pair(lump(0.12, 0.12, 0.12, 19, 0.12), hide, j.handL, j.handR, [0, -0.09, 0.02]);
  for (let i = 0; i < 4; i++) {
    S.pair(lump(0.03, 0.03, 0.035, 20 + i, 0.1), hide, j.handL, j.handR, [(i - 1.5) * 0.05, -0.17, 0.08]);
    S.pair(taperTube([V(0, 0, 0), V(0, -0.02, 0.03), V(0, -0.06, 0.045)], (t) => 0.013 * (1 - t * 0.85), 8, 5), claw, j.handL, j.handR, [(i - 1.5) * 0.05, -0.17, 0.1]);
  }
  S.build();
  j.head.scale.setScalar(1.2);

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
    j.chest.scale.setScalar(1 + Math.sin(t * 1.6) * 0.012);
    jaw.rotation.x = 0.1 + Math.sin(t * 2.5) * 0.06;
    shroom.emissiveIntensity = 1.2 + Math.sin(t * 1.7) * 0.25;
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
