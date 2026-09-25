// Voidling: a small, fast, wiry demon. Ridged horns curl back from a long skull, a glowing maw full of
// needle teeth, torn bat wings, hooked claws and spurs, a spined back and a whipping barbed tail;
// void light shows through veins in its skin and a split in its belly.
import * as THREE from 'three';
import { createKit } from '../../core/materials';
import { grunge, pbrMaterialMaps, veins } from '../../core/textures';
import type { AnimState, Model } from '../../types';
import { buildHumanoid, joint, resetPose, walkCycle, deathFall, ramp, pulse } from './rig';
import { Sculpt, horn, limb, organic, skipping, stripRig, taperTube } from './shapes';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** a bat wing for the left side (+X): three finger bones and a scalloped membrane between them */
function wing(): { bones: THREE.BufferGeometry[]; membrane: THREE.BufferGeometry } {
  if (skipping()) return { bones: [], membrane: new THREE.BufferGeometry() };
  const tips = [V(0.46, 0.2, -0.1), V(0.5, -0.06, -0.16), V(0.36, -0.3, -0.14), V(0.12, -0.36, -0.06)];
  const knuckle = V(0.16, 0.12, -0.05);
  const bones = [taperTube([V(0, 0, 0), V(0.08, 0.08, -0.02), knuckle], (t) => 0.018 * (1 - t * 0.3), 8, 6)];
  for (const tip of tips.slice(0, 3)) bones.push(taperTube([knuckle, knuckle.clone().lerp(tip, 0.5).add(V(0, 0.03, 0)), tip], (t) => 0.012 * (1 - t * 0.85), 10, 5));
  const pos: number[] = [], tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  const root = V(0, -0.02, 0);
  tri(root, knuckle, tips[0]);
  for (let i = 0; i < tips.length - 1; i++) {
    // the edge between two fingers sags towards the body: a scallop
    const mid = tips[i].clone().lerp(tips[i + 1], 0.5).lerp(knuckle, 0.32);
    const from = i === tips.length - 2 ? root : knuckle;
    tri(knuckle, tips[i], mid); tri(from, mid, tips[i + 1]);
    if (from !== knuckle) tri(root, knuckle, mid);
  }
  const membrane = new THREE.BufferGeometry();
  membrane.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  membrane.setAttribute('uv', new THREE.Float32BufferAttribute(pos.flatMap((v, i) => (i % 3 === 2 ? [] : [v * 2])), 2));
  membrane.computeVertexNormals();
  return { bones, membrane };
}

export function buildImp(): Model {
  const kit = createKit(0xff60ff);
  const g = pbrMaterialMaps(grunge(), 2, 1);
  const skin = kit.rim({
    color: 0x55203a, roughness: 0.5, map: g.map, normalMap: g.normalMap, normalScale: new THREE.Vector2(1.3, 1.3),
    emissive: 0xff3ce0, emissiveMap: veins(21, 5), emissiveIntensity: 0.55,
  }, 0xc04090, 0.45);
  const hide = kit.std({ color: 0x2a0e1c, roughness: 0.6, normalMap: g.normalMap });
  const horny = kit.std({ color: 0x1c1412, roughness: 0.28, metalness: 0.2, normalMap: g.normalMap });
  const claw = kit.std({ color: 0xe4d6b8, roughness: 0.3 });
  const membrane = kit.std({ color: 0x4a1030, roughness: 0.7, side: THREE.DoubleSide, emissive: 0xff2aa0, emissiveMap: veins(5, 5), emissiveIntensity: 0.5 });
  const eye = kit.glow(0xfff040, 8);
  const maw = kit.glow(0xff3cd0, 3.5);

  const j = buildHumanoid({ skin }, {
    hipY: 0.52, thighL: 0.26, shinL: 0.24, thighR: 0.06, shinR: 0.045, torsoL: 0.34, chestW: 0.15, chestD: 0.12, waistW: 0.11,
    shoulderW: 0.16, upperL: 0.2, foreL: 0.2, upperR: 0.04, foreR: 0.033, handR: 0.045, neckL: 0.09, headR: 0.13,
  });
  stripRig(j.root);
  const P = j.P, S = new Sculpt('imp').glow(eye).glow(maw);
  const lim = (len: number, r0: number, r1: number, b = 0, at = 0.35) => organic(limb(len, r0, r1, b, at), r0 * 0.1, 30, len * 50);

  // --- legs: corded thighs, a spur at the hock, long taloned feet
  S.pair(lim(P.thighL, 0.06, 0.04, 0.35, 0.3), skin, j.thighL, j.thighR);
  S.pair(lim(P.shinL, 0.042, 0.028, 0.35, 0.2), skin, j.kneeL, j.kneeR);
  S.pair(horn(0.1, 0.014, 0.6, V(1, 0, 0), V(0, 0.2, -1)), horny, j.ankleL, j.ankleR, [0, 0.02, -0.02]);
  S.pair(organic(new THREE.SphereGeometry(1, 10, 8), 0.1, 4, 2), skin, j.ankleL, j.ankleR, [0, -0.02, 0.04], [0, 0, 0], [0.035, 0.025, 0.08]);
  for (const x of [-0.022, 0, 0.022]) S.pair(taperTube([V(0, 0, 0), V(0, -0.005, 0.04), V(0, -0.03, 0.065)], (t) => 0.011 * (1 - t * 0.8), 8, 5), claw, j.ankleL, j.ankleR, [x, -0.025, 0.1]);

  // --- body: a narrow waist, a deep chest, void light leaking through a split belly, a spined back
  S.add(organic(new THREE.SphereGeometry(1, 14, 10), 0.08, 4, 3), skin, j.hips, [0, 0.01, 0], [0, 0, 0], [0.1, 0.07, 0.08]);
  S.add(organic(new THREE.SphereGeometry(1, 14, 10), 0.08, 4, 4), skin, j.spine, [0, 0.07, 0], [0, 0, 0], [0.085, 0.11, 0.07]);
  S.add(new THREE.SphereGeometry(1, 10, 8), maw, j.spine, [0, 0.06, 0.05], [0, 0, 0], [0.01, 0.05, 0.02]);
  S.add(organic(new THREE.SphereGeometry(1, 18, 12), 0.07, 4, 5), skin, j.chest, [0, 0.06, -0.01], [0, 0, 0], [0.14, 0.15, 0.11]);
  // chitin plates down the front: a keel on the chest, bands over the belly
  S.add(organic(new THREE.SphereGeometry(1, 12, 8), 0.05, 6, 6), hide, j.chest, [0, 0.07, 0.085], [0.15, 0, 0], [0.1, 0.1, 0.035]);
  for (let i = 0; i < 3; i++) S.add(new THREE.SphereGeometry(1, 12, 6), hide, j.spine, [0, 0.13 - i * 0.045, 0.058 - i * 0.004], [0.1, 0, 0], [0.065 - i * 0.006, 0.02, 0.02]);
  S.add(organic(new THREE.SphereGeometry(1, 12, 8), 0.05, 5, 8), hide, j.chest, [0, 0.14, -0.07], [0, 0, 0], [0.12, 0.08, 0.06]);
  for (let i = 0; i < 5; i++) S.add(horn(0.07 + (i < 2 ? 0.03 : 0), 0.016, -0.8, V(1, 0, 0), V(0, 0.5, -1)), horny, j.chest, [0, 0.2 - i * 0.06, -0.1]);
  for (let i = 0; i < 3; i++) S.add(horn(0.05, 0.012, -0.6, V(1, 0, 0), V(0, 0.4, -1)), horny, j.spine, [0, 0.12 - i * 0.05, -0.065]);

  // --- head: long skull, heavy brow, slit eyes, curled ridged horns, swept ears, a jaw that gapes
  S.add(limb(0.12, 0.035, 0.05), skin, j.neck, [0, 0.1, 0], [Math.PI, 0, 0]);
  S.add(organic(new THREE.SphereGeometry(1, 18, 14), 0.06, 5, 9), skin, j.head, [0, 0.1, 0], [0, 0, 0], [0.12, 0.105, 0.13]);
  S.add(organic(new THREE.SphereGeometry(1, 14, 10), 0.08, 6, 10), skin, j.head, [0, 0.07, 0.11], [0.25, 0, 0], [0.075, 0.05, 0.09]);
  S.add(organic(new THREE.SphereGeometry(1, 12, 8), 0.05, 6, 11), hide, j.head, [0, 0.135, 0.085], [0.3, 0, 0], [0.1, 0.03, 0.05]);
  S.pair(new THREE.SphereGeometry(1, 10, 6), eye, j.head, null, [0.052, 0.113, 0.118], [0, -0.5, -0.45], [0.03, 0.012, 0.012]);
  for (let i = -3; i <= 3; i++) if (i) S.add(new THREE.ConeGeometry(0.006, 0.03, 4), claw, j.head, [i * 0.012, 0.04, 0.17 - Math.abs(i) * 0.012], [Math.PI, 0, 0]);
  S.pair(horn(0.3, 0.035, 2.2, V(1, 0.2, 0), V(0.35, 0.8, -0.5), 6), horny, j.head, null, [0.07, 0.18, 0.02]);
  S.pair(horn(0.12, 0.018, 1.2, V(1, 0, 0), V(0.3, 0.3, -1)), horny, j.head, null, [0.1, 0.13, -0.02]);
  S.pair(new THREE.ConeGeometry(0.045, 0.2, 4).translate(0, 0.1, 0), skin, j.head, null, [0.11, 0.1, -0.03], [-0.6, 0, -1.2], [1, 1, 0.4]);
  const jaw = joint(j.head, 0, 0.05, 0.03);
  S.add(organic(new THREE.SphereGeometry(1, 12, 8), 0.06, 6, 12), skin, jaw, [0, -0.02, 0.08], [0.1, 0, 0], [0.06, 0.025, 0.09]);
  S.add(new THREE.SphereGeometry(1, 10, 6), maw, jaw, [0, 0.0, 0.07], [0, 0, 0], [0.045, 0.012, 0.07]);
  for (let i = -3; i <= 3; i++) if (i) S.add(new THREE.ConeGeometry(0.005, 0.025, 4), claw, jaw, [i * 0.011, 0.01, 0.13 - Math.abs(i) * 0.012]);

  // --- arms: wiry, a spur off each elbow, hooked claws
  S.pair(organic(new THREE.SphereGeometry(0.045, 10, 8), 0.005, 40, 13), skin, j.shoulderL, j.shoulderR, [0, 0.005, 0]);
  S.pair(lim(P.upperL, 0.042, 0.03, 0.35), skin, j.shoulderL, j.shoulderR);
  S.pair(lim(P.foreL, 0.032, 0.024, 0.3, 0.25), skin, j.elbowL, j.elbowR);
  S.pair(horn(0.09, 0.013, 0.5, V(1, 0, 0), V(0, 0.4, -1)), horny, j.elbowL, j.elbowR, [0, -0.01, -0.02]);
  S.pair(organic(new THREE.SphereGeometry(1, 10, 8), 0.08, 5, 14), skin, j.handL, j.handR, [0, -0.03, 0], [0, 0, 0], [0.035, 0.04, 0.02]);
  for (let f = 0; f < 3; f++) {
    const c = taperTube([V(0, 0, 0), V(0, -0.05, 0.01), V(0, -0.09, 0.04), V(0, -0.1, 0.075)], (t) => 0.009 * (1 - t * 0.85), 10, 5);
    S.pair(c, claw, j.handL, j.handR, [(f - 1) * 0.02, -0.055, 0.005], [0, 0, (f - 1) * 0.15]);
  }

  // --- wings, folded on the back
  const wingL = joint(j.chest, 0.06, 0.2, -0.09), wingR = joint(j.chest, -0.06, 0.2, -0.09);
  const w = wing();
  for (let i = 0; i < 4; i++) S.pair(w.bones[i] ?? w.membrane, horny, wingL, wingR);
  S.pair(w.membrane, membrane, wingL, wingR);

  // --- tail: tapering segments, a glowing barb at the end
  const tail: THREE.Group[] = [];
  let parent: THREE.Object3D = j.hips;
  for (let i = 0; i < 7; i++) {
    const tj = joint(parent, 0, 0, i === 0 ? -0.07 : -0.1);
    const r0 = 0.034 * (1 - i * 0.1);
    S.add(limb(0.105, r0, r0 * 0.9), skin, tj, [0, 0, 0], [Math.PI / 2, 0, 0]);
    if (i % 2 === 0 && i < 6) S.add(new THREE.ConeGeometry(0.01, 0.035, 4), skin, tj, [0, r0 * 0.9, -0.04], [-0.5, 0, 0]);
    tail.push(tj); parent = tj;
  }
  S.add(new THREE.OctahedronGeometry(0.04, 0), horny, parent, [0, 0, -0.1], [Math.PI / 2, 0, 0], [0.6, 1.8, 0.35]);
  S.add(new THREE.OctahedronGeometry(0.02, 0), maw, parent, [0, 0, -0.1], [Math.PI / 2, 0, 0], [0.5, 1.8, 0.5]);
  S.build();

  const root = j.root;

  function animate(st: AnimState): void {
    const { t } = st;
    resetPose(j);
    walkCycle(j, st.phase, st.move, { stride: 0.85, knee: 1.3, arm: 0.6, bob: 0.12 });
    // crouched, head low and forward, claws ready
    j.spine.rotation.x += 0.35 + st.move * 0.2; j.neck.rotation.x += -0.55; j.head.rotation.x += -0.15;
    j.thighL.rotation.x += -0.25; j.thighR.rotation.x += -0.25; j.kneeL.rotation.x += 0.45; j.kneeR.rotation.x += 0.45;
    j.ankleL.rotation.x += -0.2; j.ankleR.rotation.x += -0.2; j.body.position.y -= 0.03;
    j.shoulderL.rotation.z += 0.3; j.shoulderR.rotation.z += -0.3;
    j.elbowL.rotation.x += -0.8; j.elbowR.rotation.x += -0.8;
    j.body.position.y += Math.abs(Math.sin(st.phase)) * 0.08 * st.move;
    j.head.rotation.y = Math.sin(t * 0.9) * 0.25 * (1 - st.move);
    jaw.rotation.x = 0.1 + Math.max(0, Math.sin(t * 1.7)) * 0.25;
    for (let i = 0; i < tail.length; i++) {
      tail[i].rotation.y = Math.sin(t * 6 - i * 0.7) * 0.22;
      tail[i].rotation.x = i === 0 ? -0.6 : 0.16 + Math.sin(t * 4 - i) * 0.07;
    }
    // wings half folded, twitching; they spread as it runs and when it strikes
    let spread = 0.15 + st.move * 0.35 + Math.sin(t * 2.3) * 0.05;
    const a = st.action;
    if (a && a.name === 'attack') {
      const k = a.t;
      const wind = ramp(k, 0, 0.5) * (1 - ramp(k, 0.55, 0.7));
      const strike = ramp(k, 0.55, 0.7) * (1 - ramp(k, 0.8, 1));
      j.shoulderR.rotation.x += -2.2 * wind + 0.6 * strike; j.shoulderR.rotation.z += -0.4 * wind;
      j.shoulderL.rotation.x += -1.0 * strike;
      j.spine.rotation.x += -0.3 * wind + 0.5 * strike;
      j.body.position.z += strike * 0.25;
      jaw.rotation.x += 0.5 * pulse(k, 0.3, 0.85);
      spread += 0.7 * wind;
    }
    const flap = Math.sin(t * (st.move > 0.5 ? 9 : 3)) * (0.08 + st.move * 0.15);
    wingL.rotation.set(0.2, -0.9 + spread, 0.3 + flap); wingR.rotation.set(0.2, 0.9 - spread, -0.3 - flap);
    if (st.hit > 0) { j.spine.rotation.x += -0.5 * st.hit; jaw.rotation.x += 0.4 * st.hit; }
    if (st.dead >= 0) deathFall(j, st.dead, 1);
  }

  return { root, kit, joints: j, animate, height: 1.1, dispose() { kit.dispose(); } };
}
