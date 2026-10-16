// tools/lab keyed: the arm a swing through the eyes keys (`Model.swingKeyed`: the shoulder, the elbow, the grip and
// the weapon's way its plane lays out, viewSwing.ts `swingAt`) against the arm as drawn (lab eyes). Whether the arm the
// eyes see is the one the swing was designed as: the reach's pole, the hand's turn, the wrist's clamp and the fades
// between can each put a joint elsewhere, and a swing tuned by its keys then tunes an arm that isn't drawn. (A wrist
// keyed at its range's end was clamped, and the grip drawn 7 cm off its keys through a cut's wind-up.)
import * as THREE from 'three';
import { G } from '../../../src/state';
import type { Lab } from './lab';

/** A joint of the arm a swing keys. */
type Part = 'shoulder' | 'elbow' | 'grip';
const PARTS: readonly Part[] = ['shoulder', 'elbow', 'grip'];

/** The arm as keyed and as drawn on one frame (camera space, m: x right, y up, -z ahead), with the weapon's way each
 *  has, its hand, and how much of the drawn arm is the swing's (`KeyedArm.weight`). */
export interface KeyedFrame {
  hand: 'right' | 'left';
  weight: number;
  keyed: Record<Part, THREE.Vector3>;
  drawn: Record<Part, THREE.Vector3>;
  keyedWay: THREE.Vector3;
  drawnWay: THREE.Vector3;
}

/** frames judged: only those whose arm is all the swing's (not taking over from the place before, nor fading) */
const WHOLLY = 0.99;
/** how far a drawn joint may be from where its swing keyed it (m), and the weapon from its keyed way (degrees) */
export const KEYED_NEAR = 0.04;
const KEYED_TURN = 5;

/** This frame's keyed arm against the drawn one, or null when no swing keyed one (or the game has no keyed arms). */
export function keyedNow(lab: Lab): KeyedFrame | null {
  const keyed = lab.model.swingKeyed;
  if (!keyed) return null;
  const side = keyed.hand === 'right' ? 'R' : 'L';
  const weapon = keyed.hand === 'right' ? lab.model.tip : lab.model.offTip;
  const grip = weapon?.parent;
  if (!grip) return null;
  const inEyes = (object: THREE.Object3D) => G.camera.worldToLocal(object.getWorldPosition(new THREE.Vector3()));
  const copy = (at: { x: number; y: number; z: number }) => new THREE.Vector3(at.x, at.y, at.z);
  return {
    hand: keyed.hand,
    weight: keyed.weight,
    keyed: { shoulder: copy(keyed.shoulder), elbow: copy(keyed.elbow), grip: copy(keyed.grip) },
    drawn: {
      shoulder: inEyes(lab.joints[`shoulder${side}`]),
      elbow: inEyes(lab.joints[`elbow${side}`]),
      grip: inEyes(grip),
    },
    keyedWay: copy(keyed.dir),
    drawnWay: wayInEyes(grip),
  };
}

/** The way a grip holds its weapon (its +Y, as `holdInView` turns it), in the eyes' space. */
function wayInEyes(grip: THREE.Object3D): THREE.Vector3 {
  const way = new THREE.Vector3(0, 1, 0).transformDirection(grip.matrixWorld);
  return way.transformDirection(G.camera.matrixWorldInverse);
}

/** How far each joint is drawn from where it was keyed (m). */
function offsOf(frame: KeyedFrame): Record<Part, number> {
  const off = (part: Part) => frame.drawn[part].distanceTo(frame.keyed[part]);
  return { shoulder: off('shoulder'), elbow: off('elbow'), grip: off('grip') };
}

/** How far the weapon is drawn from its keyed way (degrees). */
function turnedOf(frame: KeyedFrame): number {
  return THREE.MathUtils.radToDeg(frame.drawnWay.angleTo(frame.keyedWay));
}

/** A frame's keyed arm as words: each joint's miss and the weapon's, the way (camera space) the elbow is off, and
 *  where the grip is keyed and the weapon's way (a cut's start matched to where the last one ended reads them). */
export function describeKeyedFrame(frame: KeyedFrame): string {
  const offs = offsOf(frame);
  const misses = PARTS.map((part) => `the ${part} ${(offs[part] * 100).toFixed(0)} cm`).join(', ');
  const way = frame.drawn.elbow.clone().sub(frame.keyed.elbow);
  const weight = frame.weight < WHOLLY ? `, ${(frame.weight * 100).toFixed(0)}% the swing's` : '';
  const weapon = `the weapon ${turnedOf(frame).toFixed(0)}°`;
  const keyedAt = `the grip keyed at ${triple(frame.keyed.grip)}, the weapon ${triple(frame.keyedWay)}`;
  const off = `${misses}, ${weapon}, the elbow by ${triple(way)}${weight}`;
  return `drawn off the keyed ${frame.hand} arm: ${off}; ${keyedAt}`;
}

/** A point or a way as words, to the centimetre. */
export function triple(v: THREE.Vector3): string {
  return `(${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)})`;
}

/** A frame numbered, with its keyed arm (or none). */
export interface KeyedSeen { frame: number; keyed: KeyedFrame | null }

/** One miss the measure reads off a keyed frame: its name, its unit, how far it may go, and how far it went. */
interface Miss { name: string; unit: string; most: number; of: (frame: KeyedFrame) => number }

/** A joint's miss (`offsOf`). */
function jointMiss(part: Part): Miss {
  return { name: `the ${part}`, unit: 'cm', most: KEYED_NEAR, of: (frame) => offsOf(frame)[part] };
}

const MISSES: readonly Miss[] = [
  ...PARTS.map(jointMiss),
  { name: 'the weapon', unit: '°', most: KEYED_TURN, of: turnedOf },
];

/** A miss's amount in its unit, as words. */
function amount(miss: Miss, value: number): string {
  return miss.unit === 'cm' ? `${(value * 100).toFixed(0)} cm` : `${value.toFixed(0)}°`;
}

/** a jump in the keys: the keyed arm moving more than this between two frames (m, degrees), and this many times as
 *  far as on the frames either side (a move begun away from where the last one left the arm, which a fade then
 *  takes it across; a blow's fast frames move as far as their neighbours). Said, not failed: what the fade draws is
 *  judged as every frame is (its speed, the arm's ranges). Read it when that fails: from a backhand's end, a
 *  forehand's keys began with the blade 66 degrees off, and the fade between them turned the forearm past its range,
 *  113 m/s. */
const JUMP_AT = 0.05;
const JUMP_TURN = 12;
const JUMP_OVER = 2.5;

/** The keyed arm's step from one frame to the next: how far its grip moved (m) and its weapon turned (degrees); null
 *  where either frame keyed no arm, or another hand's. */
interface KeyStep { moved: number; turned: number }

function keyStep(before: KeyedFrame | null, now: KeyedFrame | null): KeyStep | null {
  if (!before || !now || before.hand !== now.hand) return null;
  const moved = now.keyed.grip.distanceTo(before.keyed.grip);
  const turned = THREE.MathUtils.radToDeg(now.keyedWay.angleTo(before.keyedWay));
  return { moved, turned };
}

/** Where the keyed arm jumps (`JUMP_AT`, `JUMP_TURN`, `JUMP_OVER`), as words. */
function keyJumps(seen: readonly KeyedSeen[]): string[] {
  const steps = seen.map((now, i) => (i === 0 ? null : keyStep(seen[i - 1].keyed, now.keyed)));
  const jumps: string[] = [];
  steps.forEach((step, i) => {
    if (!step) return;
    const near = [steps[i - 1], steps[i + 1]];
    const most = (of: (s: KeyStep) => number) => Math.max(0, ...near.map((s) => (s ? of(s) : 0)));
    const jumpsAt = step.moved > JUMP_AT && step.moved > JUMP_OVER * most((s) => s.moved);
    const jumpsTurn = step.turned > JUMP_TURN && step.turned > JUMP_OVER * most((s) => s.turned);
    if (!jumpsAt && !jumpsTurn) return;
    const by = `the grip by ${(step.moved * 100).toFixed(0)} cm, the weapon by ${step.turned.toFixed(0)}°`;
    jumps.push(`the swing's keys jump on frame ${seen[i].frame} (from frame ${seen[i - 1].frame}'s): ${by}`);
  });
  return jumps;
}

/** The drawn arm against the keyed over the frames whose arm is all the swing's: each joint's worst miss and the
 *  weapon's, with their frames, and a problem for each past what it may miss by (`KEYED_NEAR`, `KEYED_TURN`); and
 *  each jump in the keys, said. Nothing when no frame was keyed. */
export function describeKeyed(seen: readonly KeyedSeen[]): { lines: string[]; problems: string[] } {
  const judged = seen.filter((now) => now.keyed && now.keyed.weight >= WHOLLY);
  if (judged.length === 0) return { lines: [], problems: [] };
  const words: string[] = [];
  const problems: string[] = [];
  for (const miss of MISSES) {
    let worst = judged[0];
    for (const now of judged) {
      if (miss.of(now.keyed!) > miss.of(worst.keyed!)) worst = now;
    }
    const said = `${miss.name} up to ${amount(miss, miss.of(worst.keyed!))} (frame ${worst.frame})`;
    words.push(said);
    const over = judged.filter((now) => miss.of(now.keyed!) > miss.most);
    if (over.length) {
      const past = `past ${amount(miss, miss.most)} on ${over.length} frames`;
      problems.push(`the arm drawn off its swing's keys: ${said}, ${past}`);
    }
  }
  const line = `the arm drawn against its swing's keys (${judged.length} frames all the swing's): ${words.join(', ')}`;
  return { lines: [line, ...keyJumps(seen)], problems };
}
