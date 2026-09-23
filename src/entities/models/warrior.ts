// The Warrior: plate armour over a crimson tabard, a crested great helm, a
// broad sword and a round shield, with a cloth cape. Fully procedural.
import * as THREE from 'three';
import { createKit } from '../../core/materials';
import { grunge, pbrMaterialMaps } from '../../core/textures';
import { buildHumanoid, part, joint, resetPose, walkCycle, idle, deathFall, pulse, ramp } from './rig';
import { clamp } from '../../util';
import { SkeletonCape } from './cape';
import type { CapeFabricPalette } from '../../vendor/cape/physics/CapeAppearance';
import type { AnimState, Model } from '../../types';

const ZERO = new THREE.Vector3();

/** Crimson cape with a dark iron trim, matching the tabard. */
const WARRIOR_CAPE_PALETTE: CapeFabricPalette = Object.freeze({
  fabric: [104, 18, 22] as const,
  trim: [52, 50, 56] as const,
  sheenColor: 0x8a2028,
  attachmentColor: 0x2a2a30,
  materialName: 'Heavy crimson warrior cape',
});

export function buildWarrior(): Model {
  const kit = createKit(0xffa040);
  const g = pbrMaterialMaps(grunge(), 3, 0.7);
  const plate = kit.std({ color: 0x6d737e, metalness: 0.9, roughness: 0.48, roughnessMap: g.roughnessMap, normalMap: g.normalMap, normalScale: g.normalScale });
  const dark = kit.std({ color: 0x33363e, metalness: 0.85, roughness: 0.45, roughnessMap: g.roughnessMap });
  const brass = kit.std({ color: 0xb8893e, metalness: 1, roughness: 0.34 });
  const cloth = kit.std({ color: 0x6a1016, roughness: 0.85, roughnessMap: g.roughnessMap, normalMap: g.normalMap, side: THREE.DoubleSide });
  const leather = kit.std({ color: 0x2e2018, roughness: 0.7, normalMap: g.normalMap });
  const mail = kit.std({ color: 0x4a4e58, metalness: 0.8, roughness: 0.55, normalMap: g.normalMap, normalScale: new THREE.Vector2(2, 2) });
  const face = kit.std({ color: 0x050506, roughness: 1 });
  const ember = kit.glow(0xff8a3a, 4);
  // the fuller only glows while a skill charges
  const edge = kit.glow(0xffb070, 0);

  const j = buildHumanoid({ skin: face, torso: mail, legs: mail, feet: plate, arms: mail, hands: dark }, {
    chestW: 0.25, chestD: 0.16, waistW: 0.18, shoulderW: 0.28, upperR: 0.068, foreR: 0.058, handR: 0.058,
    thighR: 0.1, shinR: 0.078, headR: 0.125,
  });

  // --- breastplate with a raised keel, gorget and belt
  part(new THREE.SphereGeometry(1, 20, 14).scale(0.27, 0.23, 0.18), plate, j.chest, 0, 0.07, 0.012);
  part(new THREE.BoxGeometry(0.03, 0.3, 0.03).rotateX(-0.2), brass, j.chest, 0, 0.07, 0.175);
  part(new THREE.CylinderGeometry(0.13, 0.2, 0.12, 16), plate, j.chest, 0, 0.27, -0.005);
  part(new THREE.TorusGeometry(0.19, 0.012, 6, 24).rotateX(Math.PI / 2), brass, j.chest, 0, 0.24, 0);
  part(new THREE.TorusGeometry(0.19, 0.035, 8, 24).rotateX(Math.PI / 2).scale(1, 1, 0.88), leather, j.spine, 0, 0.02, 0);
  part(new THREE.BoxGeometry(0.1, 0.08, 0.03), brass, j.spine, 0, 0.02, 0.17);

  // --- tabard: a front and a back flap hinged at the belt, plus plate tassets at the hips
  const flaps: { flap: THREE.Group; front: number }[] = [];
  const flapGeo = new THREE.BoxGeometry(0.22, 0.58, 0.018).translate(0, -0.29, 0);
  for (const front of [1, -1]) {
    const hinge = joint(j.hips, 0, 0.03, front * 0.16);
    part(flapGeo, cloth, hinge);
    part(new THREE.BoxGeometry(0.23, 0.025, 0.024), brass, hinge, 0, -0.57, 0);
    flaps.push({ flap: hinge, front });
  }
  for (const s of [1, -1]) {
    const tasset = part(new THREE.SphereGeometry(0.15, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2.2).scale(0.85, 1.2, 1), plate, j.hips, s * 0.15, -0.02, 0);
    tasset.rotation.z = s * 0.35;
  }

  // --- pauldrons: two overlapping lames with a brass rim
  for (const [s, sh] of [[1, j.shoulderL], [-1, j.shoulderR]] as const) {
    const p = joint(sh, s * 0.03, 0.04, 0);
    part(new THREE.SphereGeometry(0.15, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.2, 0.6, 1.1), plate, p);
    part(new THREE.SphereGeometry(0.165, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2.6).scale(1.2, 0.5, 1.1), dark, p, 0, -0.05, 0);
    part(new THREE.TorusGeometry(0.163, 0.012, 6, 24).rotateX(Math.PI / 2).scale(1.2, 1, 1.1), brass, p, 0, 0.0, 0);
  }
  // vambraces, gauntlet cuffs, knee cops and greaves
  for (const el of [j.elbowL, j.elbowR]) {
    part(new THREE.CylinderGeometry(0.068, 0.06, 0.2, 12), plate, el, 0, -0.13, 0);
    part(new THREE.CylinderGeometry(0.074, 0.074, 0.04, 12), brass, el, 0, -0.23, 0);
    part(new THREE.SphereGeometry(0.07, 10, 8), dark, el);
  }
  for (const kn of [j.kneeL, j.kneeR]) {
    part(new THREE.SphereGeometry(0.09, 12, 8).scale(1, 0.9, 1.1), plate, kn, 0, 0, 0.02);
    part(new THREE.CylinderGeometry(0.088, 0.075, 0.34, 12), plate, kn, 0, -0.2, 0.005);
  }

  // --- great helm: a dome, a visor with a glowing slit, cheek plates and a crimson crest
  const helm = joint(j.head, 0, 0.08, 0);
  part(new THREE.SphereGeometry(0.155, 22, 14).scale(1, 1.08, 1.05), plate, helm);
  part(new THREE.CylinderGeometry(0.152, 0.13, 0.16, 20, 1, true), plate, helm, 0, -0.08, 0);
  part(new THREE.SphereGeometry(0.13, 12, 8), face, helm, 0, -0.03, 0);
  // visor: the front part of a slightly larger sphere (+Z sits at phi = PI/2)
  part(new THREE.SphereGeometry(0.16, 20, 10, Math.PI * 0.18, Math.PI * 0.64, Math.PI * 0.3, Math.PI * 0.45).scale(1, 1.05, 1.12), dark, helm, 0, -0.01, 0);
  const slit = part(new THREE.BoxGeometry(0.17, 0.014, 0.02), ember, helm, 0, 0.01, 0.168);
  slit.castShadow = false;
  part(new THREE.BoxGeometry(0.012, 0.12, 0.02), brass, helm, 0, -0.03, 0.172);
  part(new THREE.TorusGeometry(0.155, 0.01, 6, 24).rotateX(Math.PI / 2), brass, helm, 0, -0.005, 0);
  for (let i = 0; i < 7; i++) {
    const a = -0.5 + i * 0.34;
    const fin = part(new THREE.BoxGeometry(0.035, 0.17 - Math.abs(i - 2) * 0.012, 0.07), cloth, helm, 0, Math.cos(a) * 0.18 + 0.03, Math.sin(a) * 0.19);
    fin.rotation.x = -a;
  }

  // --- sword (right hand): the blade runs along the hand's +Z, perpendicular to the forearm
  const sword = joint(j.handR, 0, -0.06, 0.01);
  sword.rotation.x = Math.PI / 2 + 0.7;   // with the bent arm the blade points forward, slightly up
  part(new THREE.CylinderGeometry(0.022, 0.024, 0.2, 8), leather, sword, 0, 0, 0);
  part(new THREE.SphereGeometry(0.04, 10, 8), brass, sword, 0, -0.12, 0);
  part(new THREE.BoxGeometry(0.26, 0.035, 0.05), brass, sword, 0, 0.11, 0);
  for (const s of [1, -1]) part(new THREE.SphereGeometry(0.026, 8, 6), brass, sword, s * 0.13, 0.11, 0);
  // diamond-section blade (a 4-sided cylinder has its corners on the axes), flat across X
  part(new THREE.CylinderGeometry(0.034, 0.048, 0.92, 4).scale(1, 1, 0.26), plate, sword, 0, 0.59, 0);
  part(new THREE.ConeGeometry(0.034, 0.13, 4).scale(1, 1, 0.26), plate, sword, 0, 1.115, 0);
  const fuller = part(new THREE.BoxGeometry(0.01, 0.74, 0.03), edge, sword, 0, 0.55, 0);
  fuller.castShadow = false;
  const tip = joint(sword, 0, 1.12, 0);

  // --- round shield held out in front of the left fist: its face (local +Z) points out of the hand
  const shield = joint(j.handL, 0, -0.1, 0);
  shield.rotation.x = Math.PI / 2;
  part(new THREE.CylinderGeometry(0.33, 0.33, 0.035, 28).rotateX(Math.PI / 2), dark, shield);
  part(new THREE.CylinderGeometry(0.3, 0.3, 0.02, 28).rotateX(Math.PI / 2), cloth, shield, 0, 0, 0.012);
  part(new THREE.TorusGeometry(0.325, 0.022, 8, 32), brass, shield, 0, 0, 0.012);
  part(new THREE.SphereGeometry(0.085, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2), plate, shield, 0, 0, 0.02);
  // four brass bars radiating from the boss (a bar's length runs along its local Y)
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4;
    part(new THREE.BoxGeometry(0.04, 0.2, 0.015), brass, shield, Math.cos(a) * 0.19, Math.sin(a) * 0.19, 0.024).rotation.z = a - Math.PI / 2;
  }
  const palm = joint(shield, 0, 0, 0.1);

  const root = j.root;
  root.scale.setScalar(1.1);

  // --- cape pinned under the pauldrons, colliding with the armoured body
  const cape = new SkeletonCape({
    anchor: j.chest, root,
    left: [0.14, 0.3, -0.19], right: [-0.14, 0.3, -0.19],
    palette: WARRIOR_CAPE_PALETTE,
    settings: { length: 1.2, width: 0.72 },
    capsules: [
      { name: 'shoulders', a: j.shoulderL, offA: [0.03, 0.04, 0], b: j.shoulderR, offB: [-0.03, 0.04, 0], radius: 0.16, clearance: 0.008 },
      { name: 'gorget', a: j.chest, offA: [0, 0.27, 0], radius: 0.2, clearance: 0.006, faceSampleSpacing: 0.03 },
      { name: 'upper torso', a: j.chest, offA: [0, 0.22, 0], offB: [0, -0.02, 0], radius: 0.29, depthRadius: 0.2, clearance: 0.006, faceSampleSpacing: 0.07 },
      { name: 'hips', a: j.hips, offA: [0, 0.02, 0], offB: [0, -0.2, 0], radius: 0.26, depthRadius: 0.22, clearance: 0.008, faceSampleSpacing: 0.08 },
      { name: 'left arm', a: j.shoulderL, offA: [0, -0.02, 0], b: j.elbowL, radius: 0.085, clearance: 0.006 },
      { name: 'right arm', a: j.shoulderR, offA: [0, -0.02, 0], b: j.elbowR, radius: 0.085, clearance: 0.006 },
      { name: 'left thigh', a: j.thighL, offA: [0, -0.1, 0], b: j.kneeL, radius: 0.13 },
      { name: 'left shin', a: j.kneeL, b: j.ankleL, radius: 0.1 },
      { name: 'left boot', a: j.ankleL, offA: [0, -0.03, 0.02], offB: [0, -0.03, 0.14], radius: 0.09 },
      { name: 'right thigh', a: j.thighR, offA: [0, -0.1, 0], b: j.kneeR, radius: 0.13 },
      { name: 'right shin', a: j.kneeR, b: j.ankleR, radius: 0.1 },
      { name: 'right boot', a: j.ankleR, offA: [0, -0.03, 0.02], offB: [0, -0.03, 0.14], radius: 0.09 },
    ],
  });

  // swings alternate forehand / backhand; a new swing starts when the action restarts
  let side = 1, lastK = 1, lastName = '';

  function animate(st: AnimState): void {
    const { t, dt } = st;
    resetPose(j);
    const move = st.move;
    const dir = st.moveDir ?? 1;

    // base stance: sword forward at the hip, shield up in front
    idle(j, t, 1 - move * 0.6);
    walkCycle(j, st.phase, move, { stride: 0.55, knee: 1.0, arm: 0.2, bob: 0.08, dir });
    j.shoulderR.rotation.x += -0.3; j.shoulderR.rotation.z += -0.1; j.elbowR.rotation.x += -0.8;
    j.shoulderL.rotation.x += -0.45; j.shoulderL.rotation.z += 0.12; j.elbowL.rotation.x += -1.1; j.elbowL.rotation.y += 0.5;
    j.spine.rotation.x += move * 0.14 * dir;
    j.body.rotation.z += (st.lean || 0) * 0.12;
    j.kneeL.rotation.x += 0.1 * (1 - move); j.kneeR.rotation.x += 0.1 * (1 - move);

    const a = st.action;
    if (a && (a.name !== lastName || a.t < lastK - 0.2) && a.name === 'swing') side = -side;
    lastName = a?.name ?? ''; lastK = a?.t ?? 1;
    if (a) {
      const k = a.t;
      if (a.name === 'swing') {
        // wind up across the body, cut through, recover
        const prep = ramp(k, 0, 0.4), cut = ramp(k, 0.4, 0.62), back = 1 - ramp(k, 0.72, 1);
        const s = side;
        j.chest.rotation.y += s * (0.7 * prep - 1.5 * cut) * back;
        j.spine.rotation.y += s * (0.25 * prep - 0.5 * cut) * back;
        j.shoulderR.rotation.x += (-1.25 * prep) * back;
        j.shoulderR.rotation.z += (s > 0 ? -0.9 * prep + 1.6 * cut : 0.7 * prep - 1.3 * cut) * back;
        j.elbowR.rotation.x += (0.55 * prep) * back;
        j.handR.rotation.z += s * (0.6 * prep - 1.2 * cut) * back;
        j.handR.rotation.x += 0.9 * prep * back;   // blade level for the cut
        j.shoulderL.rotation.x += 0.2 * prep * back;
        j.thighL.rotation.x += -0.25 * cut * back; j.kneeR.rotation.x += 0.25 * cut * back;
      } else if (a.name === 'channel') {
        // spin with the blade held out
        j.body.rotation.y += t * 15;
        j.shoulderR.rotation.x += -0.1; j.shoulderR.rotation.z += -1.35; j.elbowR.rotation.x += 0.7;
        j.shoulderL.rotation.x += 0.2; j.shoulderL.rotation.z += 0.9; j.elbowL.rotation.x += 0.5;
        j.spine.rotation.x += 0.12;
        j.kneeL.rotation.x += 0.35; j.kneeR.rotation.x += 0.35; j.thighL.rotation.x += -0.2; j.thighR.rotation.x += -0.2;
        j.body.position.y += -0.06;
      } else if (a.name === 'charge') {
        // shoulder into the shield, sword back
        const w = Math.min(1, k * 6) * (1 - ramp(k, 0.85, 1));
        j.spine.rotation.x += 0.45 * w; j.neck.rotation.x += -0.3 * w;
        j.shoulderL.rotation.x += -0.7 * w; j.elbowL.rotation.x += 0.3 * w;
        j.shoulderR.rotation.x += 0.6 * w; j.elbowR.rotation.x += 0.4 * w;
      } else if (a.name === 'slam') {
        // two-handed overhead drive into the ground
        const up = ramp(k, 0, 0.45) * (1 - ramp(k, 0.5, 0.66));
        const down = ramp(k, 0.5, 0.66) * (1 - ramp(k, 0.82, 1));
        j.shoulderR.rotation.x += -2.9 * up - 1.1 * down; j.elbowR.rotation.x += 0.3 * up + 0.6 * down;
        j.shoulderL.rotation.x += -1.2 * up - 0.3 * down;
        j.body.position.y += -0.2 * down; j.kneeL.rotation.x += 0.7 * down; j.kneeR.rotation.x += 0.5 * down;
        j.thighL.rotation.x += -0.5 * down; j.thighR.rotation.x += -0.2 * down;
        j.spine.rotation.x += 0.5 * down - 0.2 * up;
      } else if (a.name === 'buff') {
        // war cry: chest out, arms flung wide, head back
        const w = pulse(k, 0, 1);
        j.shoulderL.rotation.z += 0.9 * w; j.shoulderR.rotation.z += -0.9 * w;
        j.shoulderL.rotation.x += 0.3 * w; j.shoulderR.rotation.x += 0.3 * w;
        j.spine.rotation.x += -0.2 * w; j.neck.rotation.x += -0.35 * w;
      } else if (a.name === 'cast') {
        const w = pulse(k, 0, 1);
        j.shoulderR.rotation.x += -1.2 * w; j.chest.rotation.y += 0.3 * w;
      }
    }
    if (st.hit > 0) { j.spine.rotation.x += -0.2 * st.hit; j.neck.rotation.x += -0.15 * st.hit; }
    if (st.dead >= 0) deathFall(j, st.dead, -1);

    // tabard flaps swing with the legs and trail with speed
    const legs = -(j.thighL.rotation.x + j.thighR.rotation.x) * 0.5;
    for (const f of flaps) {
      const push = clamp(f.front > 0 ? legs : -legs, -0.1, 0.8);
      f.flap.rotation.x = f.front * -(push * 0.7 + 0.04) + move * 0.3 * (f.front > 0 ? 0 : 1) + Math.sin(t * 3 + f.front) * 0.02;
    }

    if (dt > 0) cape.update(dt, st.velocity ?? ZERO);
    cape.setVisible(st.dead < 0.6);

    // the visor slit and blade pulse faintly, brighter while an action runs
    ember.emissiveIntensity = 4 + Math.sin(t * 5) * 0.5;
    edge.emissiveIntensity = (st.charge || 0) * 1.5;
  }

  return {
    root, kit, joints: j, animate, tip, palm, height: 2.05,
    worldObjects: [cape.mesh],
    reset: () => cape.reset(),
    dispose() {
      kit.dispose();
      cape.dispose();
      root.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    },
  };
}
