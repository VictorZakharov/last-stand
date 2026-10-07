// How hard a pose is to hold (tools/lab): the static moments the arm's own weight and what its hand holds put on the
// shoulder and the elbow, as a share of the most a man's can hold, and the arm's angles as a clinician measures them
// (`measureBody` in anatomy.ts). For reading a pose beside its pictures, never for choosing one. Standing, the ranger's
// bow carried upright with the elbow bent (before #144) held 6.9 N·m at the shoulder and 5.5 at the elbow; the
// neutral carry, the arm hanging, 4.4 and 2.4.
import * as THREE from 'three';
import { measureBody } from '../../../src/entities/models/anatomy';
import type { Joints } from '../../../src/entities/models/rig';

/** A body segment: its mass (kg) and where its centre of mass lies along it from its upper joint (0..1). */
interface Segment {
  mass: number;
  centre: number;
}

/** Dempster's shares of an 85 kg man's mass: the upper arm 2.8 %, the forearm 1.6 %, the hand 0.6 %. */
const UPPER_ARM: Segment = { mass: 2.4, centre: 0.436 };
const FOREARM: Segment = { mass: 1.36, centre: 0.43 };
const HAND: Segment = { mass: 0.51, centre: 0.5 };

/** The most a man's shoulder (raising the arm) and elbow (bending it) can hold, N·m: rough population means. */
const STRONGEST = { shoulder: 50, elbow: 65 };

/**
 * How heavy a hold is, by its share of the most the muscle can give. Under 5 % it can be kept up all day (the
 * guidance for long static work is 2 to 5 %); past 15 % it tires within minutes (Rohmert's endurance curve).
 */
export type Effort = 'light' | 'moderate' | 'heavy';

export function effortOf(share: number): Effort {
  if (share < 0.05) return 'light';
  if (share <= 0.15) return 'moderate';
  return 'heavy';
}

/** The fist's middle, where a held thing's weight acts, in the hand joint's frame (m). */
const FIST = new THREE.Vector3(0, -0.085, 0);

/** What each class holds, kg, by hand: a bow with its riser; a one-handed sword and a shield; a staff. */
export const HELD: Record<string, { L?: number; R?: number }> = {
  ranger: { L: 1.2 },
  warrior: { R: 1.4, L: 4 },
  mage: { R: 2 },
};

const GRAVITY = 9.81;
const DOWN = new THREE.Vector3(0, -1, 0);

/** One arm's load and posture. */
export interface ArmComfort {
  /** the moment about each joint, N·m */
  shoulder: number;
  elbow: number;
  /** each as a share of the most it can hold */
  shoulderShare: number;
  elbowShare: number;
  /** degrees: the arm raised from the side, the plane it rises in (0 out to the side, 90 forward), the elbow's bend,
   *  the forearm's turn, the wrist's bend and its bend to the side */
  raise: number;
  plane: number;
  elbowBend: number;
  pronation: number;
  wrist: number;
  wristSide: number;
}

/** The moment of `loads` (points and their masses) about `pivot`, N·m. */
function momentAbout(pivot: THREE.Vector3, loads: [THREE.Vector3, number][]): number {
  const total = new THREE.Vector3();
  const lever = new THREE.Vector3();
  for (const [point, mass] of loads) {
    lever.subVectors(point, pivot).cross(DOWN).multiplyScalar(mass * GRAVITY);
    total.add(lever);
  }
  return total.length();
}

/** The arm on `side` as it is now (world matrices up to date), holding `held` kg in its fist. */
export function armComfort(joints: Joints, side: 'L' | 'R', held = 0): ArmComfort {
  const at = (joint: THREE.Object3D) => joint.getWorldPosition(new THREE.Vector3());
  const shoulder = at(joints[`shoulder${side}`]);
  const elbow = at(joints[`elbow${side}`]);
  const hand = joints[`hand${side}`];
  const wrist = at(hand);
  const fist = hand.localToWorld(FIST.clone());

  const upperArmCentre = shoulder.clone().lerp(elbow, UPPER_ARM.centre);
  const forearmCentre = elbow.clone().lerp(wrist, FOREARM.centre);
  const handCentre = wrist.clone().lerp(fist, HAND.centre);
  const belowElbow: [THREE.Vector3, number][] = [
    [forearmCentre, FOREARM.mass],
    [handCentre, HAND.mass],
    [fist, held],
  ];
  const shoulderMoment = momentAbout(shoulder, [[upperArmCentre, UPPER_ARM.mass], ...belowElbow]);
  const elbowMoment = momentAbout(elbow, belowElbow);

  const angles = measureBody(joints);
  return {
    shoulder: shoulderMoment,
    elbow: elbowMoment,
    shoulderShare: shoulderMoment / STRONGEST.shoulder,
    elbowShare: elbowMoment / STRONGEST.elbow,
    raise: angles[`shoulder${side}.elevation`],
    plane: angles[`shoulder${side}.plane`],
    elbowBend: angles[`elbow${side}.flexion`],
    pronation: angles[`forearm${side}.pronation`],
    wrist: angles[`wrist${side}.flexion`],
    wristSide: angles[`wrist${side}.radial`],
  };
}

/** One readable line for a picture's notes. */
export function describeArm(comfort: ArmComfort): string {
  const round = Math.round;
  const load = (moment: number, share: number) => {
    return `${moment.toFixed(1)} N·m (${round(share * 100)}%, ${effortOf(share)})`;
  };
  const shoulder = load(comfort.shoulder, comfort.shoulderShare);
  const elbow = load(comfort.elbow, comfort.elbowShare);
  const loads = `shoulder ${shoulder}, elbow ${elbow}`;
  const posture = `raised ${round(comfort.raise)}° (plane ${round(comfort.plane)}°), ` +
    `elbow ${round(comfort.elbowBend)}°, forearm ${round(comfort.pronation)}°, ` +
    `wrist ${round(comfort.wrist)}° / ${round(comfort.wristSide)}°`;
  return `${loads}; ${posture}`;
}
