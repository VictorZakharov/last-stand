// What the hero weighs, gear and all, for the balance (`balance.ts`): a man's body as the rig is built (ANSUR II's
// men are 85 kg on average; the heroes are lean), what each class wears on its segments as the gear it has equipped
// shows it (plate and mail are most of a fifth of the body again), and what it carries, each weighed where its meshes
// are this frame: the weapon or bow in a fist, a shield on its arm, the quiver on the back.
import * as THREE from 'three';
import type { Lab } from './lab';
import type { Build, Load, SegmentName } from './balance';
import { isShown, isUnder } from './geometry';

/** the hero's own weight (kg) */
const BODY_KG = 80;

/** what is held, by what it is (kg): a recurve bow, a one-handed weapon, a two-hander, a staff, a shield */
const HELD_KG = { bow: 1.0, oneHanded: 1.3, twoHanded: 2.6, staff: 2.0, shield: 4.5 };
/** a quiver of arrows on the back (kg) */
const QUIVER_KG = 1.3;

type Worn = Partial<Record<SegmentName, number>>;

/** what every hero wears on his feet: boots (kg each) */
const BOOTS: Worn = { footL: 1.2, footR: 1.2 };

/** what each class wears with a chest item on, segment by segment (kg), and without (the clothes under it) */
const CHEST: Record<string, { on: Worn; off: Worn }> = {
  // (breast and back plates over a gambeson, pauldrons, a mail skirt, tassets and knee cops: about 18 kg)
  warrior: {
    on: {
      thorax: 8, abdomen: 1.5, pelvis: 3, upperArmL: 1.5, upperArmR: 1.5,
      thighL: 1, thighR: 1, shankL: 0.5, shankR: 0.5,
    },
    off: { thorax: 1, abdomen: 0.5, pelvis: 0.5 },
  },
  // (a wool robe with a cowl and bell sleeves, about 3 kg)
  mage: {
    on: { thorax: 1, abdomen: 0.5, pelvis: 0.5, upperArmL: 0.25, upperArmR: 0.25, thighL: 0.25, thighR: 0.25 },
    off: { thorax: 0.4, abdomen: 0.2, pelvis: 0.3 },
  },
  // (a wool coat belted over trousers, about 2 kg)
  ranger: {
    on: { thorax: 0.7, abdomen: 0.3, pelvis: 0.4, upperArmL: 0.15, upperArmR: 0.15, thighL: 0.15, thighR: 0.15 },
    off: { thorax: 0.4, abdomen: 0.2, pelvis: 0.3 },
  },
};

/** a helmet or hat on the head, by class (kg) */
const HEAD_KG: Record<string, number> = { warrior: 2.5, mage: 0.4, ranger: 0.3 };
/** gloves and bracers on each forearm and hand, by class (kg) */
const HANDS_KG: Record<string, number> = { warrior: 0.8, mage: 0.2, ranger: 0.3 };

/** The hero's build now: his weight, what he wears with the gear equipped, and what he carries where it is. */
export function buildOf(lab: Lab): Build {
  return { bodyKg: BODY_KG, worn: wornBy(lab), carried: carriedBy(lab) };
}

/** What the hero wears, segment by segment (kg). */
function wornBy(lab: Lab): Worn {
  const gear = lab.player.gear;
  const id = lab.player.cls.id;
  const worn: Worn = { ...BOOTS };
  const add = (more: Worn) => {
    for (const [name, kg] of Object.entries(more) as [SegmentName, number][]) worn[name] = (worn[name] ?? 0) + kg;
  };
  const chest = CHEST[id];
  if (chest) add(gear.chest ? chest.on : chest.off);
  if (gear.helm) add({ head: HEAD_KG[id] ?? 0 });
  const hands = HANDS_KG[id] ?? 0;
  if (gear.hands) add({ forearmL: hands / 2, forearmR: hands / 2, handL: hands / 2, handR: hands / 2 });
  return worn;
}

/** What the hero carries, each at its meshes' centre this frame. */
function carriedBy(lab: Lab): Load[] {
  const loads: Load[] = [];
  const hands = [lab.joints.handL, lab.joints.handR];
  hands.forEach((hand, side) => {
    const kg = heldKg(lab, side);
    const at = kg > 0 ? heldCentre(hand) : null;
    if (at) loads.push({ kg, at });
  });
  const quiver = lab.player.cls.quiver ? lab.model.root.getObjectByName('quiver') : undefined;
  const quiverAt = quiver ? meshCentre(quiver, () => true) : null;
  if (quiverAt) loads.push({ kg: QUIVER_KG, at: quiverAt });
  return loads;
}

/** The weight in a hand (`side` 0 the left), by what the class holds there with the gear equipped (kg). */
function heldKg(lab: Lab, side: number): number {
  const gear = lab.player.gear;
  const cls = lab.player.cls;
  // (a bow is held in the left fist, the right drawing the string)
  if (cls.quiver) return side === 0 ? HELD_KG.bow : 0;
  if (side === 1) {
    if (!gear.weapon) return 0;
    if (cls.id === 'mage') return HELD_KG.staff;
    return gear.twoHanded ? HELD_KG.twoHanded : HELD_KG.oneHanded;
  }
  if (gear.shield) return HELD_KG.shield;
  return gear.offWeapon ? HELD_KG.oneHanded : 0;
}

/** The centre of what a hand holds: its shown meshes but the hand's own (and its fingers'), or nothing. */
function heldCentre(hand: THREE.Object3D): THREE.Vector3 | null {
  const own = ownHand(hand);
  return meshCentre(hand, (mesh) => !mesh.userData.own && (own === hand || !isUnder(mesh, own)));
}

/** A hand's own meshes, as it is turned in its grip: the group of them under the joint (the hand itself if none). */
function ownHand(hand: THREE.Object3D): THREE.Object3D {
  const isOwn = (child: THREE.Object3D) => (child as THREE.Mesh).isMesh && child.userData.own;
  return hand.children.find((child) => (child as THREE.Group).isGroup && child.children.some(isOwn)) ?? hand;
}

/** The centre of the shown meshes under `object` that `keep` keeps, by their boxes in the world, or nothing. */
function meshCentre(object: THREE.Object3D, keep: (mesh: THREE.Mesh) => boolean): THREE.Vector3 | null {
  const box = new THREE.Box3();
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !isShown(mesh) || !keep(mesh)) return;
    box.expandByObject(mesh);
  });
  return box.isEmpty() ? null : box.getCenter(new THREE.Vector3());
}
