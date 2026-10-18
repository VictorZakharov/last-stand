// tools/lab keyed: the arm a swing through the eyes keys (`Model.swingKeyed`: the shoulder, the elbow, the grip, the
// weapon's way and its flat as its plane lays them out, viewSwing.ts `swingAt`) against the arm as drawn (lab eyes;
// read off the game by page/keyedNow.ts). Whether the arm the eyes see is the one the swing was designed as: the
// reach's pole, the hand's turn, the wrist's clamp and the fades between can each put a joint elsewhere, and a swing
// tuned by its keys then tunes an arm that isn't drawn. (A wrist keyed at its range's end was clamped, and the grip
// drawn 7 cm off its keys through a cut's wind-up.) The shoulder and the elbow are judged only where the swing lays
// them out (`KeyedArm.armShare`): a swing its hands place (`ViewSwing.holds`, the two-hander's backhand turned about
// the left shoulder) keys the grip, the weapon's way and its flat, and the arm is fitted to them from its own
// shoulder; judged by an arm laid out from the left shoulder, every frame of it read 44 cm off.
import * as THREE from 'three';

/** A joint of the arm a swing keys. */
type Part = 'shoulder' | 'elbow' | 'grip';
const PARTS: readonly Part[] = ['shoulder', 'elbow', 'grip'];

/** The arm as keyed and as drawn on one frame (camera space, m: x right, y up, -z ahead), with the weapon's way and
 *  its flat each has (no keyed flat on a game from before the keyed arm had one), its hand, how much of the drawn arm
 *  is the swing's (`KeyedArm.weight`) and how much of its shoulder and elbow (`KeyedArm.armShare`). */
export interface KeyedFrame {
  hand: 'right' | 'left';
  weight: number;
  armShare: number;
  keyed: Record<Part, THREE.Vector3>;
  drawn: Record<Part, THREE.Vector3>;
  keyedWay: THREE.Vector3;
  drawnWay: THREE.Vector3;
  keyedFlat: THREE.Vector3 | null;
  drawnFlat: THREE.Vector3;
}

/** frames judged: only those whose arm is all the swing's (not taking over from the place before, nor fading); a
 *  shoulder and an elbow, only where that much of them is the swing's */
const WHOLLY = 0.99;
/** how far a drawn joint may be from where its swing keyed it (m), the weapon from its keyed way and its flat from its
 *  keyed one (degrees) */
export const KEYED_NEAR = 0.04;
const KEYED_TURN = 5;
const KEYED_FLAT = 10;

/** How far each joint is drawn from where it was keyed (m). */
function offsOf(frame: KeyedFrame): Record<Part, number> {
  const off = (part: Part) => frame.drawn[part].distanceTo(frame.keyed[part]);
  return { shoulder: off('shoulder'), elbow: off('elbow'), grip: off('grip') };
}

/** How far the weapon is drawn from its keyed way (degrees). */
function turnedOf(frame: KeyedFrame): number {
  return THREE.MathUtils.radToDeg(frame.drawnWay.angleTo(frame.keyedWay));
}

/** How far the weapon's flat is drawn turned from its keyed one about the weapon's length (degrees; 0 where none was
 *  keyed): each taken square to the way drawn, the weapon's own turn off its keyed way read by `turnedOf`. */
function flatTurnedOf(frame: KeyedFrame): number {
  if (!frame.keyedFlat) return 0;
  const way = frame.drawnWay.clone().normalize();
  const square = (flat: THREE.Vector3) => flat.clone().addScaledVector(way, -flat.dot(way));
  const keyed = square(frame.keyedFlat), drawn = square(frame.drawnFlat);
  if (keyed.lengthSq() < 1e-8 || drawn.lengthSq() < 1e-8) return 0;
  return THREE.MathUtils.radToDeg(keyed.angleTo(drawn));
}

/** A frame's keyed arm as words: each joint's miss, the weapon's and its flat's, the way (camera space) the elbow is
 *  off, and where the grip is keyed and the weapon's way (a cut's start matched to where the last one ended reads
 *  them). */
export function describeKeyedFrame(frame: KeyedFrame): string {
  const offs = offsOf(frame);
  const misses = PARTS.map((part) => `the ${part} ${(offs[part] * 100).toFixed(0)} cm`).join(', ');
  const way = frame.drawn.elbow.clone().sub(frame.keyed.elbow);
  const weight = frame.weight < WHOLLY ? `, ${(frame.weight * 100).toFixed(0)}% the swing's` : '';
  const elbow = frame.armShare < WHOLLY ? ` (${(frame.armShare * 100).toFixed(0)}% the swing's)` : '';
  const flat = frame.keyedFlat ? `, its flat ${flatTurnedOf(frame).toFixed(0)}°` : '';
  const weapon = `the weapon ${turnedOf(frame).toFixed(0)}°${flat}`;
  const keyedAt = `the grip keyed at ${triple(frame.keyed.grip)}, the weapon ${triple(frame.keyedWay)}`;
  const off = `${misses}, ${weapon}, the elbow by ${triple(way)}${elbow}${weight}`;
  return `drawn off the keyed ${frame.hand} arm: ${off}; ${keyedAt}`;
}

/** A point or a way as words, to the centimetre. */
export function triple(v: THREE.Vector3): string {
  return `(${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)})`;
}

/** A frame numbered, with its keyed arm (or none). */
export interface KeyedSeen { frame: number; keyed: KeyedFrame | null }

/** Whether a frame of `seen` wholly a swing's keys its grip further than `KEYED_NEAR` from `from` (camera space): an
 *  arm held still where it was there would be drawn off its keys. */
export function keyedAway(seen: readonly KeyedSeen[], from: THREE.Vector3): boolean {
  const away = (keyed: KeyedFrame) => keyed.weight >= WHOLLY && keyed.keyed.grip.distanceTo(from) > KEYED_NEAR;
  return seen.some((now) => now.keyed !== null && away(now.keyed));
}

/** One miss the measure reads off a keyed frame: its name, its unit, how far it may go, how far it went, and on which
 *  frames it's read (those wholly the swing's that key it). */
interface Miss {
  name: string;
  unit: string;
  most: number;
  of: (frame: KeyedFrame) => number;
  keys: (frame: KeyedFrame) => boolean;
}

/** A joint's miss (`offsOf`): the shoulder's and the elbow's only where the arm is wholly the swing's. */
function jointMiss(part: Part): Miss {
  const keys = part === 'grip' ? () => true : (frame: KeyedFrame) => frame.armShare >= WHOLLY;
  return { name: `the ${part}`, unit: 'cm', most: KEYED_NEAR, of: (frame) => offsOf(frame)[part], keys };
}

const MISSES: readonly Miss[] = [
  ...PARTS.map(jointMiss),
  { name: 'the weapon', unit: '°', most: KEYED_TURN, of: turnedOf, keys: () => true },
  { name: 'its flat', unit: '°', most: KEYED_FLAT, of: flatTurnedOf, keys: (frame) => frame.keyedFlat !== null },
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
  const wholly = seen.filter((now) => now.keyed && now.keyed.weight >= WHOLLY);
  if (wholly.length === 0) return { lines: [], problems: [] };
  const words: string[] = [];
  const problems: string[] = [];
  for (const miss of MISSES) {
    const judged = wholly.filter((now) => miss.keys(now.keyed!));
    if (judged.length === 0) continue;
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
  const line = `the arm drawn against its swing's keys (${wholly.length} frames all the swing's): ${words.join(', ')}`;
  return { lines: [line, ...keyJumps(seen)], problems };
}
