// tools/lab swing: a swing through the eyes keyed from a pose (src/entities/viewSwing.ts). A pose is decided as a
// person holds it, the grip's place and the weapon's way as the eyes see them, and this gives the swing's key that
// holds it and what of it an arm swung in that swing's plane can't hold: the grip off the plane, the weapon's way off
// it, a wrist bent past its range, a grip past the arm's reach. Each key of the swing, or one given, is placed too: the
// grip, the weapon, the elbow and the wrist, and a two-hander's lower grip with how far it is from the other shoulder.
// (Keyed by its numbers alone, by trying them in a cast and reading the frames, a two-handed forehand took an hour of
// tries and its wind-up still put the lower grip 12 cm past the left arm's reach.) The canary keys the swing's blow
// from where its own key places it, which must come back as that key, and a grip moved 10 cm off the plane, which
// must be read 10 cm off.
import * as THREE from 'three';
import type { Lab, Fixture, Report } from './lab';
import { armsLens } from './inFrame';
import { triple } from './keyed';
import {
  swingKeyAt, swingKeyFor, swingShoulder, type ArmBones, type SwingKey, type SwingKeyFit, type ViewSwing,
} from '../../../src/entities/viewSwing';
import { SWINGS_NAMED } from '../../../src/entities/models/warriorEyes';

export interface SwingOptions {
  fixture: Fixture;
  /** the swing, by its name in `warriorSwings` (oneFore, oneBack, twoRest, twoFore, twoBack) */
  swing: string;
  /** poses to key: the grip's place and the weapon's way in the view (camera space: m, x right, y up, -z ahead), three
   *  numbers a pose each */
  at: number[] | null;
  dir: number[] | null;
  /** keys to place: their numbers after their shares (the striking part's way, the reach, the bend, the drop, the
   *  roll), five a key */
  key: number[] | null;
  /** the left hand's swing, the right's mirrored (`swingAt`'s `mirror`: a dual wielder's off hand) */
  left: boolean;
  canary: boolean;
}

/** how near a key keyed back from its own place must come (degrees, m), and how far the canary's grip is moved */
const ROUND_TRIP_TURN = 0.5, ROUND_TRIP_REACH = 0.005, CANARY_OFF = 0.1;

/** What one key puts where in the view (camera space). */
interface Placed { grip: THREE.Vector3; dir: THREE.Vector3; elbow: THREE.Vector3; wrist: THREE.Vector3 }

/** `lab swing`: the key of a swing that holds a pose, and where its keys (or one given) put the arm. */
export async function swing(lab: Lab, options: SwingOptions): Promise<Report> {
  await lab.setup({ view: 'first', ...options.fixture });
  const swing = SWINGS_NAMED[options.swing];
  if (!swing) throw new Error(`lab: swing: no swing ${options.swing} (${Object.keys(SWINGS_NAMED).join(', ')})`);
  const mirror = options.left;
  const keyed = { swing, bones: bonesOf(lab, mirror), mirror };
  const lines = [planeWords(options.swing, keyed)];
  const problems: string[] = [];
  for (let i = 0; options.at && options.dir && i < options.at.length; i += 3) {
    const at = new THREE.Vector3().fromArray(options.at, i);
    const dir = new THREE.Vector3().fromArray(options.dir, i).normalize();
    const fit = swingKeyFor(swing, keyed.bones, at, dir, mirror);
    lines.push(`the grip at ${triple(at)}, the weapon along ${triple(dir)}: ${fitWords(fit)}`);
    lines.push(`  that key: ${placedWords(lab, keyed, placeKey(keyed, fit.key))}`);
  }
  for (let i = 0; options.key && i < options.key.length; i += 5) {
    const key = keyFrom(options.key.slice(i, i + 5));
    lines.push(`the key ${keyWords(key)}: ${placedWords(lab, keyed, placeKey(keyed, key))}`);
  }
  if (!options.at && !options.key) lines.push(...eachKey(lab, keyed));
  if (options.canary) problems.push(...canaryMissed(keyed));
  return { text: lines.join('\n'), problems };
}

/** A swing, the bones of the arm it keys, and whether that's the left, its places mirrored. */
interface Keyed { swing: ViewSwing; bones: ArmBones; mirror: boolean }

/** The held weapon's arm as a swing lays it out, the right's or the left's (`Model.swingBones`). */
function bonesOf(lab: Lab, left: boolean): ArmBones {
  const bones = lab.model.swingBones?.(left);
  if (!bones || bones.strike === 0) {
    const hand = left ? ' in his left hand (--gear dual)' : '';
    throw new Error(`lab: swing: the hero holds no weapon a swing keys${hand} (--class warrior)`);
  }
  return bones;
}

/** A key's numbers after its share as its values. */
function keyFrom(numbers: number[]): SwingKey {
  if (numbers.length !== 5) {
    throw new Error('lab: swing --key: five numbers: the way, the reach, the bend, the drop, the roll');
  }
  const [way, reach, bend, drop, roll] = numbers;
  return { way, reach, bend, drop, roll };
}

/** Where `key` puts the arm in its swing's plane. */
function placeKey({ swing, bones, mirror }: Keyed, key: SwingKey): Placed {
  const placed = {
    grip: new THREE.Vector3(), dir: new THREE.Vector3(), elbow: new THREE.Vector3(), wrist: new THREE.Vector3(),
  };
  swingKeyAt(swing, key, bones, placed.grip, placed.dir, new THREE.Vector3(), placed.elbow, placed.wrist, mirror);
  const shoulder = swingShoulder(swing, new THREE.Vector3(), mirror);
  placed.elbow.add(shoulder);
  placed.wrist.add(shoulder);
  return placed;
}

/** Each key of a swing placed, a line each. */
function eachKey(lab: Lab, keyed: Keyed): string[] {
  const lines: string[] = [];
  const keys = keyed.swing.keys;
  for (let i = 0; i + 5 < keys.length; i += 6) {
    const [share, ...numbers] = keys.slice(i, i + 6);
    const key = keyFrom(numbers);
    lines.push(`  ${share}: ${keyWords(key)}: ${placedWords(lab, keyed, placeKey(keyed, key))}`);
  }
  return lines;
}

/** A swing's plane as words: its shoulder, the way it crosses the view, and its bones. */
function planeWords(name: string, { swing, bones, mirror }: Keyed): string {
  const shoulder = swingShoulder(swing, new THREE.Vector3(), mirror);
  const arm = `the arm ${bones.upper.toFixed(2)} + ${bones.fore.toFixed(2)} + ${bones.hand.toFixed(2)} m`;
  const hand = mirror ? ', the left hand\'s, mirrored' : '';
  return `${name}: its shoulder ${triple(shoulder)}, crossing the view at ${swing.plane[3]}°${hand}; ${arm}, `
    + `the striking part ${bones.strike.toFixed(2)} m from the grip; the fist's slant ${swing.slant}°`;
}

/** A key's numbers as words. */
function keyWords(key: SwingKey): string {
  const numbers = [key.way, key.reach, key.bend, key.drop, key.roll].map((value) => round(value, 2));
  return numbers.join(', ');
}

const round = (value: number, places: number) => Number(value.toFixed(places));

/** A fit as words: its key, and what of the pose it can't hold. */
function fitWords(fit: SwingKeyFit): string {
  const misses = [
    ...(Math.abs(fit.gripOff) > 0.005 ? [`the grip ${(Math.abs(fit.gripOff) * 100).toFixed(1)} cm off the plane`] : []),
    ...(Math.abs(fit.weaponOff) > 0.5 ? [`the weapon's way ${Math.abs(fit.weaponOff).toFixed(1)}° off it`] : []),
    ...(fit.bend !== fit.key.bend ? [`the wrist would bend ${fit.bend.toFixed(1)}° (held at ${fit.key.bend}°)`] : []),
    ...(fit.weaponMiss > 0.5 ? [`the weapon ${fit.weaponMiss.toFixed(1)}° off its way`] : []),
    ...(fit.key.reach >= fit.most - 0.001 ? [`the grip past the arm's reach, ${fit.most.toFixed(2)} m`] : []),
  ];
  const held = misses.length ? `; not held: ${misses.join(', ')}` : '; held as it is';
  return `the key ${keyWords(fit.key)}${held}`;
}

/** Where a key puts the arm as words: the grip (in the frame or not), the weapon, the elbow, the wrist, and a
 *  two-hander's lower grip and its distance from the other shoulder (the swing's mirrored). */
function placedWords(lab: Lab, { swing }: Keyed, placed: Placed): string {
  const words = [
    `the grip ${triple(placed.grip)}${seen(placed.grip) ? '' : ' (out of the frame)'}`,
    `the weapon ${triple(placed.dir)}`,
    `the elbow ${triple(placed.elbow)}`,
    `the wrist ${triple(placed.wrist)}`,
  ];
  const up = upHandleOf(lab);
  if (up !== null) {
    const lower = placed.grip.clone().addScaledVector(placed.dir, -up);
    const shoulder = swingShoulder(swing, new THREE.Vector3(), true);
    words.push(`the lower grip ${triple(lower)}, ${lower.distanceTo(shoulder).toFixed(2)} m `
      + `from the other shoulder (an arm reaches ${reachOf(lab).toFixed(2)})`);
  }
  return words.join(', ');
}

/** How far an arm reaches from its shoulder to the middle of its fist (m, as `lab eyes` says: a two-hander's lower
 *  grip further than a few cm past it is let go of, models/warrior.ts). */
function reachOf(lab: Lab): number {
  const P = lab.joints.P;
  return (P.upperL + P.foreL + P.handR) * lab.model.root.scale.x;
}

/** How far a two-hander's upper grip is up the handle from its lower one (m; null for a one-hander). */
function upHandleOf(lab: Lab): number | null {
  const lower = lab.model.offGrip;
  return lower ? -lower.position.y * lab.model.root.scale.x : null;
}

/** Whether a point in the eyes' frame is in the frame the arms are drawn in. */
function seen(point: THREE.Vector3): boolean {
  if (point.z >= 0) return false;
  const ndc = point.clone().applyMatrix4(armsLens().projectionMatrix);
  return Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1;
}

/** The canary: the swing's blow keyed back from where its own key puts it, and a grip moved off the plane. */
function canaryMissed(keyed: Keyed): string[] {
  const { swing, bones, mirror } = keyed;
  const missed: string[] = [];
  // (the key at the blow, or the first)
  const at = Math.max(0, swing.keys.findIndex((value, index) => index % 6 === 0 && value === swing.hit));
  const key = keyFrom(swing.keys.slice(at + 1, at + 6));
  key.drop = 0;
  key.roll = 0;
  const placed = placeKey(keyed, key);
  const back = swingKeyFor(swing, bones, placed.grip, placed.dir, mirror).key;
  const turned = Math.max(Math.abs(back.way - key.way), Math.abs(back.bend - key.bend));
  if (turned > ROUND_TRIP_TURN || Math.abs(back.reach - key.reach) > ROUND_TRIP_REACH) {
    missed.push(`canary: the key ${keyWords(key)} placed and keyed back came out ${keyWords(back)}`);
  }
  const moved = placed.grip.clone().add(normalOf(keyed, placed));
  const off = swingKeyFor(swing, bones, moved, placed.dir, mirror);
  if (Math.abs(Math.abs(off.gripOff) - CANARY_OFF) > 0.002) {
    const read = (off.gripOff * 100).toFixed(1);
    missed.push(`canary: a grip moved ${CANARY_OFF * 100} cm off the plane read ${read} cm off`);
  }
  return missed;
}

/** `CANARY_OFF` along the plane's normal at a placed key: square to the grip's way from the shoulder and the
 *  weapon's. */
function normalOf({ swing, bones, mirror }: Keyed, placed: Placed): THREE.Vector3 {
  const shoulder = swingShoulder(swing, new THREE.Vector3(), mirror);
  const toGrip = placed.grip.clone().sub(shoulder);
  const striking = placed.grip.clone().addScaledVector(placed.dir, bones.strike).sub(shoulder);
  return toGrip.cross(striking).normalize().multiplyScalar(CANARY_OFF);
}
