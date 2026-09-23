// The Warrior: plate armour over a crimson tabard, a crested great helm, a
// broad sword and a round shield, with a cloth cape. Fully procedural.
import * as THREE from 'three';
import { createKit } from '../../core/materials';
import { grunge, pbrMaterialMaps } from '../../core/textures';
import { buildHumanoid, part, joint, resetPose, walkCycle, idle, deathFall, pulse, ramp, reachArm } from './rig';
import { clamp, lerp } from '../../util';
import { SkeletonCape } from './cape';
import type { CapeFabricPalette } from '../../vendor/cape/physics/CapeAppearance';
import type { AnimState, Gear, Model } from '../../types';

const ZERO = new THREE.Vector3();
/** a held weapon: its tip along the grip, and where the left hand holds it (two-handers) */
interface Weapon { group: THREE.Group; len: number; off: number | null }
/** the grip turns the weapon's +Y forward and a little up out of the bent arm */
const GRIP = Math.PI / 2 + 0.7;
/** straightens the weapon along the arm, for swings that trace the damage arc */
const ALONG_ARM = Math.PI - GRIP;
/** arm length (upper + fore + hand), before the model's 1.1 scale */
const ARM = 0.63;
const _grip = new THREE.Vector3(), _pole = new THREE.Vector3(1, -0.7, -0.6);
const SHIELD_SIDE = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0));
const SHIELD_FRONT = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
const SIDE_POS = new THREE.Vector3(0.07, -0.02, 0), FRONT_POS = new THREE.Vector3(0, -0.1, 0);

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
  const wood = kit.std({ color: 0x3a2616, roughness: 0.7, normalMap: g.normalMap });
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

  // --- weapons in the right hand, built along the grip's +Y (blade up); setGear shows the equipped one.
  // The grip turns +Y to point forward, slightly up, out of the bent arm.
  const grip = joint(j.handR, 0, -0.06, 0.01);
  grip.rotation.x = GRIP;
  const weapons = new Map<string, Weapon>();
  const add = (name: string, len: number, off: number | null, build: (g: THREE.Group) => void) => {
    const g = new THREE.Group();
    grip.add(g);
    build(g);
    g.visible = false;
    weapons.set(name, { group: g, len, off });
  };
  const blade = (g: THREE.Group, w: number, len: number, at: number) => {
    // diamond section (a 4-sided cylinder has its corners on the axes), flat across X
    part(new THREE.CylinderGeometry(w * 0.7, w, len, 4).scale(1, 1, 0.26), plate, g, 0, at + len / 2, 0);
    part(new THREE.ConeGeometry(w * 0.7, w * 2.7, 4).scale(1, 1, 0.26), plate, g, 0, at + len + w * 1.35, 0);
    part(new THREE.BoxGeometry(0.01, len * 0.8, w * 0.62), edge, g, 0, at + len * 0.45, 0).castShadow = false;
  };
  const haft = (g: THREE.Group, from: number, to: number, r = 0.022) => part(new THREE.CylinderGeometry(r, r * 1.1, to - from, 8), wood, g, 0, (from + to) / 2, 0);
  // an axe blade: a wedge of a disc standing in the haft's plane, centred on +X (or -X)
  const axeHead = (g: THREE.Group, r: number, at: number, side: number) =>
    part(new THREE.CylinderGeometry(r, r, 0.026, 18, 1, false, side * Math.PI / 2 - 0.8, 1.6).rotateX(Math.PI / 2), plate, g, side * 0.02, at, 0);

  add('Sword', 1.12, null, (g) => {
    part(new THREE.CylinderGeometry(0.022, 0.024, 0.2, 8), leather, g);
    part(new THREE.SphereGeometry(0.04, 10, 8), brass, g, 0, -0.12, 0);
    part(new THREE.BoxGeometry(0.26, 0.035, 0.05), brass, g, 0, 0.11, 0);
    blade(g, 0.048, 0.92, 0.13);
  });
  add('Axe', 0.74, null, (g) => {
    haft(g, -0.14, 0.72);
    axeHead(g, 0.2, 0.6, 1);
    part(new THREE.BoxGeometry(0.1, 0.05, 0.04), dark, g, -0.06, 0.6, 0);
    part(new THREE.CylinderGeometry(0.03, 0.03, 0.08, 8), brass, g, 0, 0.6, 0);
  });
  add('Mace', 0.72, null, (g) => {
    haft(g, -0.14, 0.62, 0.024);
    part(new THREE.SphereGeometry(0.085, 12, 10), dark, g, 0, 0.64, 0);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      part(new THREE.BoxGeometry(0.02, 0.16, 0.07), plate, g, Math.cos(a) * 0.075, 0.64, Math.sin(a) * 0.075).rotation.y = -a;
    }
  });
  add('Greatsword', 1.62, -0.24, (g) => {
    part(new THREE.CylinderGeometry(0.024, 0.026, 0.44, 8), leather, g, 0, -0.1, 0);
    part(new THREE.SphereGeometry(0.05, 10, 8), brass, g, 0, -0.35, 0);
    part(new THREE.BoxGeometry(0.44, 0.045, 0.06), brass, g, 0, 0.14, 0);
    for (const s of [1, -1]) part(new THREE.SphereGeometry(0.032, 8, 6), brass, g, s * 0.22, 0.14, 0);
    blade(g, 0.064, 1.3, 0.16);
  });
  add('Greataxe', 1.12, -0.3, (g) => {
    haft(g, -0.42, 1.1, 0.026);
    for (const s of [1, -1]) axeHead(g, 0.27, 0.9, s);
    part(new THREE.CylinderGeometry(0.036, 0.036, 0.1, 8), brass, g, 0, 0.9, 0);
    part(new THREE.ConeGeometry(0.03, 0.12, 6), plate, g, 0, 1.14, 0);
  });
  add('Maul', 1.1, -0.28, (g) => {
    haft(g, -0.38, 0.92, 0.027);
    part(new THREE.BoxGeometry(0.4, 0.22, 0.22), plate, g, 0, 1.0, 0);
    for (const s of [1, -1]) part(new THREE.BoxGeometry(0.03, 0.24, 0.24), brass, g, s * 0.14, 1.0, 0);
    part(new THREE.CylinderGeometry(0.035, 0.035, 0.1, 8), brass, g, 0, 0.84, 0);
  });
  const tip = joint(grip, 0, 1.12, 0);
  // where the left hand holds a two-handed weapon
  const offGrip = joint(grip, 0, -0.24, 0);
  let held: Weapon | null = null;

  // dual-wielding: a one-hander in the left fist too, the mirror image of the right grip (the
  // copies share geometry and materials)
  const gripL = joint(j.handL, 0, -0.06, 0.01);
  gripL.rotation.x = GRIP;
  gripL.scale.x = -1;
  const offWeapons = new Map<string, Weapon>();
  for (const [name, w] of weapons) {
    if (w.off != null) continue;   // two-handers
    const g = w.group.clone();
    gripL.add(g);
    offWeapons.set(name, { ...w, group: g });
  }
  let offHeld: Weapon | null = null;

  // --- round shield on the left fist. At rest it hangs at the side facing outwards; raised (or
  // charging) it swings round in front of the fist, facing out of the hand. Its face is local +Z.
  const shield = joint(j.handL, 0, -0.1, 0);
  shield.visible = false;
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

  // right-arm swings and chops yaw last, so the straight arm sweeps around the vertical axis
  // (with no yaw this order poses exactly like the default)
  j.shoulderR.rotation.order = 'YXZ';
  j.shoulderL.rotation.order = 'YXZ';

  // swings alternate forehand / backhand; a new swing starts when the action restarts. With a
  // weapon in each hand they alternate hands instead: the backhand side is the left hand's forehand
  let side = 1, lastK = 1, lastName = '';

  function setGear(gear: Gear): void {
    for (const w of weapons.values()) w.group.visible = false;
    held = gear.weapon ? weapons.get(gear.weapon) ?? weapons.get('Sword')! : null;
    if (held) held.group.visible = true;
    if (held?.off != null) offGrip.position.y = held.off;
    shield.visible = gear.shield;
    for (const w of offWeapons.values()) w.group.visible = false;
    offHeld = gear.offWeapon ? offWeapons.get(gear.offWeapon) ?? offWeapons.get('Sword')! : null;
    if (offHeld) offHeld.group.visible = true;
    tipOn(false);
  }

  /** The tip the skills read (trail, cast point): the left weapon's during a left-hand swing. */
  function tipOn(left: boolean): void {
    const at = left && offHeld ? gripL : grip;
    if (tip.parent !== at) at.add(tip);
    tip.position.y = (left && offHeld ? offHeld : held)?.len ?? 0;
  }

  function animate(st: AnimState): void {
    const { t, dt } = st;
    resetPose(j);
    const move = st.move;
    const dir = st.moveDir ?? 1;
    const two = held?.off != null;

    // base stance: weapon forward at the hip (a two-hander held across the body), shield up in front
    idle(j, t, 1 - move * 0.6);
    walkCycle(j, st.phase, move, { stride: 0.55, knee: 1.0, arm: 0.2, bob: 0.08, dir });
    if (two) { j.shoulderR.rotation.x += -0.5; j.shoulderR.rotation.z += 0.2; j.elbowR.rotation.x += -1.0; }
    else { j.shoulderR.rotation.x += -0.3; j.shoulderR.rotation.z += -0.1; j.elbowR.rotation.x += -0.8; }
    // shield carried low at the side, the arm held a little out so it clears the leg; a second
    // weapon held like the first, mirrored
    if (shield.visible) { j.shoulderL.rotation.z += 0.2; j.elbowL.rotation.x += -0.35; }
    else if (offHeld) { j.shoulderL.rotation.x += -0.3; j.shoulderL.rotation.z += 0.1; j.elbowL.rotation.x += -0.8; }
    let guard = 0;   // 0: shield at the side, 1: in front
    j.spine.rotation.x += move * 0.14 * dir;
    j.body.rotation.z += (st.lean || 0) * 0.12;
    j.kneeL.rotation.x += 0.1 * (1 - move); j.kneeR.rotation.x += 0.1 * (1 - move);

    const a = st.action;
    if (a && (a.name !== lastName || a.t < lastK - 0.2) && a.name === 'swing') side = -side;
    lastName = a?.name ?? ''; lastK = a?.t ?? 1;
    const left = !!offHeld && a?.name === 'swing' && side < 0;
    tipOn(left);
    // the swinging arm: the left one mirrors the right (the same pitch, the yaw and roll turned over)
    const R = left ? j.shoulderL.rotation : j.shoulderR.rotation;
    if (a) {
      const k = a.t;
      if (a.name === 'swing') {
        // the straight arm and weapon sweep the damage arc: raised out to the starting side, then the
        // tip crosses it from 0.55 to 0.85 of the cast, in step with the trail (skills/cleave swingArc)
        const w = ramp(k, 0, 0.3) * (1 - ramp(k, 0.9, 1));
        const theta = side * 1.2 * (2 * ramp(k, 0.55, 0.85) - 1);
        // a two-hander turns more with the body and keeps the grip in front of the chest, in the left hand's reach
        const body = two ? 0.75 : 0.45;
        j.spine.rotation.y += 0.3 * body * theta * w;
        j.chest.rotation.y += 0.7 * body * theta * w;
        R.x = lerp(R.x, -1.25, w); R.z = lerp(R.z, 0, w); R.y = ((1 - body) * theta + (two ? 0.45 : 0)) * w;
        const elbow = left ? j.elbowL : j.elbowR;
        elbow.rotation.x = lerp(elbow.rotation.x, two ? -0.5 : -0.1, w);
        (left ? j.handL : j.handR).rotation.x += ALONG_ARM * w;
        // the leg opposite the swinging arm steps in
        (left ? j.thighR : j.thighL).rotation.x += -0.3 * w; (left ? j.kneeL : j.kneeR).rotation.x += 0.3 * w;
      } else if (a.name === 'chop') {
        // Power Strike: the weapon rises overhead and trembles while the charge builds, then comes down
        // in a vertical arc at 0.9 of the cast (the skill's fireAt)
        const w = ramp(k, 0, 0.12) * (1 - ramp(k, 0.97, 1));
        const lift = ramp(k, 0, 0.3), blow = ramp(k, 0.9, 0.97);
        const pitch = lerp(lerp(-1.3, -2.95, lift), -0.8, blow) + (1 - blow) * lift * Math.sin(t * 45) * 0.02;
        // a two-hander is raised over the middle of the head, within the left hand's reach
        R.x = lerp(R.x, pitch, w); R.z = lerp(R.z, 0, w); R.y = (two ? 0.7 : 0.25) * w;
        j.elbowR.rotation.x = lerp(j.elbowR.rotation.x, two ? -0.55 : -0.1, w);
        j.handR.rotation.x += ALONG_ARM * w;
        j.spine.rotation.x += (-0.25 * lift * (1 - blow) + 0.45 * blow) * w;
        j.body.position.y += -0.16 * blow * w;
        j.kneeL.rotation.x += 0.55 * blow * w; j.kneeR.rotation.x += 0.4 * blow * w;
        j.thighL.rotation.x += -0.45 * blow * w;
      } else if (a.name === 'spin') {
        // Steel Tempest: spin with the weapon held out
        j.body.rotation.y += t * 15;
        R.x += -0.1; R.z += -1.35; j.elbowR.rotation.x += 0.7;
        j.shoulderL.rotation.x += 0.2; j.shoulderL.rotation.z += 0.9; j.elbowL.rotation.x += 0.5;
        j.spine.rotation.x += 0.12;
        j.kneeL.rotation.x += 0.35; j.kneeR.rotation.x += 0.35; j.thighL.rotation.x += -0.2; j.thighR.rotation.x += -0.2;
        j.body.position.y += -0.06;
      } else if (a.name === 'block') {
        // Raise Shield: side-on behind the shield, left foot forward and low, the shield drawn in tight
        // before the chest and chin, the weapon cocked over it; a blocked blow jolts it all back
        const w = k, stance = w * (1 - move * 0.7), jolt = st.blockHit ?? 0;
        guard = w;
        j.chest.rotation.y += -0.35 * w; j.spine.rotation.y += -0.15 * w;
        j.spine.rotation.x += (0.18 - 0.2 * jolt) * w; j.neck.rotation.x += (-0.2 + 0.1 * jolt) * w;
        // the forearm points forward so the shield (facing out of the fist) faces the foe; the yaw
        // undoes the chest's turn
        const L = j.shoulderL.rotation;
        L.x = lerp(L.x, -0.35 + 0.25 * jolt, w); L.z = lerp(L.z, -0.3, w); L.y = 0.5 * w;
        j.elbowL.rotation.set(lerp(j.elbowL.rotation.x, -1.35 + 0.35 * jolt, w), 0, 0);
        R.x = lerp(R.x, -1.7, w); R.z = lerp(R.z, -0.35, w); R.y = 0.2 * w;
        j.elbowR.rotation.x = lerp(j.elbowR.rotation.x, -1.2, w);
        j.handR.rotation.x += 0.5 * w;
        j.thighL.rotation.x += -0.4 * stance; j.kneeL.rotation.x += 0.5 * stance;
        j.thighR.rotation.x += 0.35 * stance; j.kneeR.rotation.x += 0.45 * stance;
        j.body.position.y += (-0.1 * stance - 0.03 * jolt);
        j.body.position.z += -0.06 * jolt * w;
      } else if (a.name === 'charge') {
        // shoulder into the charge, weapon back
        const w = Math.min(1, k * 6) * (1 - ramp(k, 0.85, 1));
        guard = shield.visible ? w : 0;
        j.spine.rotation.x += 0.45 * w; j.neck.rotation.x += -0.3 * w;
        j.chest.rotation.y += -0.3 * w;
        const L = j.shoulderL.rotation;
        if (shield.visible) { L.x = lerp(L.x, -0.5, w); L.z = lerp(L.z, -0.2, w); L.y = 0.4 * w; j.elbowL.rotation.x = lerp(j.elbowL.rotation.x, -1.2, w); }
        else { L.x += -0.7 * w; j.elbowL.rotation.x += 0.3 * w; }
        R.x += 0.6 * w; j.elbowR.rotation.x += 0.4 * w;
      } else if (a.name === 'buff') {
        // war cry: chest out, arms flung wide, head back
        const w = pulse(k, 0, 1);
        j.shoulderL.rotation.z += 0.9 * w; R.z += -0.9 * w;
        j.shoulderL.rotation.x += 0.3 * w; R.x += 0.3 * w;
        j.spine.rotation.x += -0.2 * w; j.neck.rotation.x += -0.35 * w;
      } else if (a.name === 'stagger') {
        // guard broken: thrown back with the arms flung open, then hunched and reeling until it passes
        const hit = 1 - ramp(k, 0, 0.3), reel = ramp(k, 0.1, 0.3) * (1 - ramp(k, 0.8, 1));
        const sway = Math.sin(t * 7) * reel;
        j.spine.rotation.x += -0.45 * hit + 0.3 * reel; j.neck.rotation.x += -0.35 * hit + 0.15 * reel;
        j.spine.rotation.z += 0.12 * sway; j.neck.rotation.z += -0.1 * sway;
        j.shoulderL.rotation.set(-0.2 * reel, 0, 0.9 * hit + 0.35 * reel); j.elbowL.rotation.set(-0.3 - 0.4 * reel, 0, 0);
        R.x += 0.4 * hit + 0.5 * reel; R.z += -0.6 * hit - 0.2 * reel; j.elbowR.rotation.x += 0.4 * hit;
        j.body.position.y += -0.05 * reel;
        j.kneeL.rotation.x += 0.35 * hit + 0.2 * reel; j.kneeR.rotation.x += 0.15 * hit + 0.2 * reel;
        j.thighR.rotation.x += 0.35 * hit;
      } else if (a.name === 'cast') {
        const w = pulse(k, 0, 1);
        R.x += -1.2 * w; j.chest.rotation.y += 0.3 * w;
      }
    }
    if (st.hit > 0) { j.spine.rotation.x += -0.2 * st.hit; j.neck.rotation.x += -0.15 * st.hit; }
    if (st.dead >= 0) deathFall(j, st.dead, -1);

    shield.quaternion.slerpQuaternions(SHIELD_SIDE, SHIELD_FRONT, guard);
    shield.position.lerpVectors(SIDE_POS, FRONT_POS, guard);

    // a two-hander: the left hand follows the grip wherever the right arm takes the weapon
    if (two) {
      root.updateMatrixWorld(true);
      offGrip.getWorldPosition(_grip);
      j.chest.worldToLocal(_grip);
      reachArm(j.shoulderL, j.elbowL, j.P.upperL, j.P.foreL + j.P.handR, _grip, _pole);
    }

    // tabard flaps swing with the legs and trail with speed
    const legs = -(j.thighL.rotation.x + j.thighR.rotation.x) * 0.5;
    for (const f of flaps) {
      const push = clamp(f.front > 0 ? legs : -legs, -0.1, 0.8);
      f.flap.rotation.x = f.front * -(push * 0.7 + 0.04) + move * 0.3 * (f.front > 0 ? 0 : 1) + Math.sin(t * 3 + f.front) * 0.02;
    }

    if (dt > 0) cape.update(dt, st.velocity ?? ZERO);
    cape.setVisible(st.dead < 0.6);

    // the visor slit pulses faintly; the blade's fuller glows while a skill charges
    ember.emissiveIntensity = 4 + Math.sin(t * 5) * 0.5;
    edge.emissiveIntensity = (st.charge || 0) * 1.5;
  }

  return {
    root, kit, joints: j, animate, tip, palm, height: 2.05, setGear,
    get swing() { return side; },
    get reach() { return (ARM + (held?.len ?? 0)) * root.scale.x; },
    worldObjects: [cape.mesh],
    reset: () => cape.reset(),
    dispose() {
      kit.dispose();
      cape.dispose();
      root.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    },
  };
}
