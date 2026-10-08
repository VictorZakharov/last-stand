// Whether a body could move as the hero's does: the push its motion needs from the ground, against his planted soles.
// The centre of mass is found from the pose (each segment's share of the mass and where its centre lies, after de
// Leva, 1996, for a body of `Build.bodyKg`) with what it wears and carries (`gearWeight.ts`), and each mass's
// acceleration from where it goes over five frames. With a foot down the push must come from within the soles
// touching the ground (the zero moment point of all the masses: from outside them the body tips, the way it lies),
// and the feet's grip must hold it; in the air nothing pushes, so the centre keeps its way and falls as anything
// does. A push beyond any feet's grip that the game's own movement asks (the body turned round at a run in a few
// frames) is counted apart, as nothing the legs could do about it.
import * as THREE from 'three';
import type { Joints } from '../../../src/entities/models/rig';
import type { FootShape } from '../../../src/entities/models/ik';
import { groundHeight } from '../../../src/world/ground';
import { solePoints } from './soles';

/** gravity (m/s²) */
const GRAVITY = 9.81;
/** how hard feet grip the ground: the push along it at most this share of the push up it (shoes on stone) */
const GRIP = 0.8;
/** a sole's point this near its ground touches it (m) */
const CONTACT = 0.02;
/** half a sole's width, across it (m) */
const SOLE_HALF_WIDTH = 0.045;
/** how far outside the soles the push may come before the body tips: the model leaves out the limbs' own swing (m) */
const TIP_MARGIN = 0.03;
/** in the air, a change of the centre's way or of its fall by more than this is a push from nothing (m/s²) */
const AIR_PUSH = 3;
const AIR_HELD = 4;

/** The joints a segment's centre is placed between. */
type BodyJoint = 'neck' | 'head' | 'chest' | 'spine' | 'hips'
  | `${'shoulder' | 'elbow' | 'hand' | 'thigh' | 'knee' | 'ankle'}${'L' | 'R'}`;

/** The body's segments by name: what worn gear is weighed on. */
export type SegmentName = 'head' | 'thorax' | 'abdomen' | 'pelvis'
  | `${'upperArm' | 'forearm' | 'hand' | 'thigh' | 'shank' | 'foot'}${'L' | 'R'}`;

/** A segment of the body: its share of the mass, and its centre `along` the way from joint `from` to `to` (past 1:
 *  beyond `to`, as the head's is above the top of the neck). */
interface Segment {
  name: SegmentName;
  mass: number;
  from: BodyJoint;
  to: BodyJoint;
  along: number;
}

/** Something carried (a weapon, a shield, a quiver): its weight and its centre in the world now. */
export interface Load {
  kg: number;
  at: THREE.Vector3;
}

/** What the body weighs and how: its own weight, what is worn on each segment (kg, its centre the segment's) and what
 *  is carried. */
export interface Build {
  bodyKg: number;
  worn: Partial<Record<SegmentName, number>>;
  carried: Load[];
}

/** A side's arm and leg (de Leva's adult male shares, and the centres from the near end). */
function limbs(side: 'L' | 'R'): Segment[] {
  return [
    { name: `upperArm${side}`, mass: 0.0271, from: `shoulder${side}`, to: `elbow${side}`, along: 0.5772 },
    { name: `forearm${side}`, mass: 0.0162, from: `elbow${side}`, to: `hand${side}`, along: 0.4574 },
    // (the hand's centre is about 8 cm past the wrist, a third of the forearm's length)
    { name: `hand${side}`, mass: 0.0061, from: `elbow${side}`, to: `hand${side}`, along: 1.3 },
    { name: `thigh${side}`, mass: 0.1416, from: `thigh${side}`, to: `knee${side}`, along: 0.4095 },
    { name: `shank${side}`, mass: 0.0433, from: `knee${side}`, to: `ankle${side}`, along: 0.4459 },
    // (the foot's centre lies by the ankle, near enough for 1.4% of the mass)
    { name: `foot${side}`, mass: 0.0137, from: `knee${side}`, to: `ankle${side}`, along: 1 },
  ];
}

/** the body's segments: the head and neck, the trunk's three parts, and the limbs (their shares sum to 1) */
const SEGMENTS: Segment[] = [
  { name: 'head', mass: 0.0694, from: 'neck', to: 'head', along: 2 },
  { name: 'thorax', mass: 0.1596, from: 'chest', to: 'neck', along: 0.5 },
  { name: 'abdomen', mass: 0.1633, from: 'spine', to: 'chest', along: 0.5 },
  { name: 'pelvis', mass: 0.1117, from: 'hips', to: 'spine', along: 0.5 },
  ...limbs('L'),
  ...limbs('R'),
];

/** The parts of the body whose motion moves its centre of mass: the trunk with the head, the legs, the arms and
 *  what it carries. */
export type Part = 'trunk' | 'legs' | 'arms' | 'gear';
const PARTS: Part[] = ['trunk', 'legs', 'arms', 'gear'];

/** The part a segment belongs to. */
function partOf(name: SegmentName): Part {
  if (name === 'head' || name === 'thorax' || name === 'abdomen' || name === 'pelvis') return 'trunk';
  if (/^(upperArm|forearm|hand)/.test(name)) return 'arms';
  return 'legs';
}

/** The centre of mass, and each part's share of how far it lies from where the game has the body (its mass over the
 *  whole's, times its own centre's offset): the centre is the body's place plus the parts' shares. */
interface Weighed {
  centre: THREE.Vector3;
  parts: Record<Part, THREE.Vector3>;
  /** each segment's and each load's centre, its weight (kg) and its part, in one order frame after frame */
  points: THREE.Vector3[];
  masses: number[];
  pointParts: Part[];
}

const _from = new THREE.Vector3();
const _to = new THREE.Vector3();

/** The centre of mass in the world of the body as it is posed now, with what it wears and carries, and each part's
 *  share of it from `body`, where the game has the body. */
export function weigh(joints: Joints, build: Build, body: THREE.Vector3): Weighed {
  const parts = Object.fromEntries(PARTS.map((part) => [part, new THREE.Vector3()])) as Record<Part, THREE.Vector3>;
  const points: THREE.Vector3[] = [];
  const masses: number[] = [];
  const pointParts: Part[] = [];
  const add = (at: THREE.Vector3, kg: number, part: Part) => {
    points.push(at.clone());
    masses.push(kg);
    pointParts.push(part);
    parts[part].addScaledVector(at.sub(body), kg);
  };
  for (const segment of SEGMENTS) {
    joints[segment.from].getWorldPosition(_from);
    joints[segment.to].getWorldPosition(_to);
    const kg = segment.mass * build.bodyKg + (build.worn[segment.name] ?? 0);
    add(_from.lerp(_to, segment.along), kg, partOf(segment.name));
  }
  for (const load of build.carried) add(_from.copy(load.at), load.kg, 'gear');
  const total = masses.reduce((sum, kg) => sum + kg, 0);
  const centre = body.clone();
  for (const part of PARTS) centre.add(parts[part].divideScalar(total));
  return { centre, parts, points, masses, pointParts };
}

/** A foot as the balance sees it: whether the leg IK has it planted, its ankle and its shape. */
export interface BalanceFoot {
  planted: boolean;
  ankle: THREE.Object3D;
  shape: FootShape;
}

/** One frame of a body to judge. */
export interface BalanceSample {
  /** the centre of mass (m) */
  centre: THREE.Vector3;
  /** where the game has the body (the player's position): how it moves is the game's own movement */
  body: THREE.Vector3;
  /** the outline on the ground (x, z) of the planted soles' parts that touch it: empty in the air */
  support: THREE.Vector2[];
  /** the height of the ground they touch */
  ground: number;
  /** the way the body goes, if it moves (x, z, of unit length) */
  way: THREE.Vector2 | null;
  /** each part's share of the centre's offset from the body, and each mass's centre, weight and part (`Weighed`) */
  parts: Record<Part, THREE.Vector3>;
  points: THREE.Vector3[];
  masses: number[];
  pointParts: Part[];
}

/** This frame of a body: its centre of mass, where the game has it, the soles it stands on and the way it goes. */
export function sampleOf(joints: Joints, build: Build, body: THREE.Vector3, feet: BalanceFoot[],
  way: THREE.Vector2 | null): BalanceSample {
  const touching: THREE.Vector2[] = [];
  let groundSum = 0;
  let groundCount = 0;
  for (const foot of feet) {
    if (!foot.planted) continue;
    for (const point of touchingPoints(foot)) {
      const across = acrossSole(foot.ankle);
      touching.push(new THREE.Vector2(point.x + across.x, point.z + across.y));
      touching.push(new THREE.Vector2(point.x - across.x, point.z - across.y));
      groundSum += groundHeight(point.x, point.z);
      groundCount++;
    }
  }
  const weighed = weigh(joints, build, body);
  return {
    ...weighed,
    body: body.clone(),
    support: convexHull(touching),
    ground: groundCount ? groundSum / groundCount : groundHeight(body.x, body.z),
    way: way ? way.clone() : null,
  };
}

/** A planted sole's points that touch the ground (heel to toe: rolled onto its toes, only those), or its lowest. */
function touchingPoints(foot: BalanceFoot): THREE.Vector3[] {
  const points = solePoints(foot.ankle, foot.shape);
  const heightOf = (point: THREE.Vector3) => point.y - groundHeight(point.x, point.z);
  const touching = points.filter((point) => heightOf(point) < CONTACT);
  if (touching.length) return touching;
  const lowest = points.reduce((best, point) => (heightOf(point) < heightOf(best) ? point : best));
  return [lowest];
}

/** Half a sole's width across it, on the ground (x, z). */
function acrossSole(ankle: THREE.Object3D): THREE.Vector2 {
  const side = new THREE.Vector3(1, 0, 0).transformDirection(ankle.matrixWorld);
  const flat = new THREE.Vector2(side.x, side.z);
  const length = flat.length();
  return length > 1e-6 ? flat.multiplyScalar(SOLE_HALF_WIDTH / length) : flat.set(SOLE_HALF_WIDTH, 0);
}

/** The convex outline of `points`, anticlockwise (Andrew's monotone chain). */
function convexHull(points: THREE.Vector2[]): THREE.Vector2[] {
  if (points.length < 3) return points;
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const turn = (o: THREE.Vector2, a: THREE.Vector2, b: THREE.Vector2) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: THREE.Vector2[] = [];
  for (const point of sorted) {
    while (lower.length >= 2 && turn(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop();
    lower.push(point);
  }
  const upper: THREE.Vector2[] = [];
  for (const point of [...sorted].reverse()) {
    while (upper.length >= 2 && turn(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop();
    upper.push(point);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/** How far `point` lies outside the outline `hull` (0 inside), and the outline's nearest point. */
function outsideOf(point: THREE.Vector2, hull: THREE.Vector2[]): { by: number; nearest: THREE.Vector2 } {
  if (hull.length >= 3 && insideOf(point, hull)) return { by: 0, nearest: point.clone() };
  let best = { by: Infinity, nearest: point.clone() };
  for (let i = 0; i < hull.length; i++) {
    const nearest = nearestOnSegment(point, hull[i], hull[(i + 1) % hull.length]);
    const by = nearest.distanceTo(point);
    if (by < best.by) best = { by, nearest };
  }
  return best;
}

function insideOf(point: THREE.Vector2, hull: THREE.Vector2[]): boolean {
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    if ((b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x) < 0) return false;
  }
  return true;
}

function nearestOnSegment(point: THREE.Vector2, a: THREE.Vector2, b: THREE.Vector2): THREE.Vector2 {
  const run = b.clone().sub(a);
  const length = run.lengthSq();
  const t = length > 1e-12 ? THREE.MathUtils.clamp(point.clone().sub(a).dot(run) / length, 0, 1) : 0;
  return a.clone().addScaledVector(run, t);
}

/**
 * What a body couldn't do:
 * - `tips`: the push its motion needs comes from outside the soles on the ground, so it would fall that way;
 * - `grip`: the push along the ground is more than the feet's grip could give;
 * - `game`: the game's own movement asks more than any feet's grip (not the legs' to mend);
 * - `pulled`: it falls faster than nothing holding it would, with a foot on the ground;
 * - `pushed`: in the air, its way changes with nothing to push on;
 * - `held`: in the air, it doesn't fall as anything does: held up (hung from a string) or pulled down.
 */
export type Unlike = 'tips' | 'grip' | 'game' | 'pulled' | 'pushed' | 'held';

/** A frame a body couldn't move as the hero's did: what, by how much (m or m/s²), and which way, if it says. */
export interface Fall {
  frame: number;
  unlike: Unlike;
  by: number;
  toward: string;
  /** what moved the centre so: the game's own movement and each part, the largest first (m/s²), and for a tip, how
   *  far the weight itself lay off the soles (m) */
  causes: string;
}

/** the names of what moves the centre, as a fall's causes say them */
const CAUSE_NAMES: Record<Part | 'game', string> = {
  game: 'the game\'s movement',
  trunk: 'the trunk',
  legs: 'the legs',
  arms: 'the arms',
  gear: 'the gear',
};
/** a cause less than this is left unsaid (m/s²) */
const CAUSE_LEAST = 1;

/** Each part's and the game's share of the centre's acceleration at `frame`, along the ground or up it, the largest
 *  first (m/s²). */
function causesAt(samples: BalanceSample[], frame: number, seconds: number, upright: boolean): string {
  const series: [Part | 'game', THREE.Vector3[]][] = [
    ['game', samples.map((sample) => sample.body)],
    ...PARTS.map((part): [Part, THREE.Vector3[]] => [part, samples.map((sample) => sample.parts[part])]),
  ];
  const shares = series.flatMap(([name, points]) => {
    const push = accelerationAt(points, frame, seconds);
    const by = push ? (upright ? Math.abs(push.y) : Math.hypot(push.x, push.z)) : 0;
    return by >= CAUSE_LEAST ? [{ name, by }] : [];
  });
  shares.sort((a, b) => b.by - a.by);
  const said = shares.map((share) => `${CAUSE_NAMES[share.name]} ${share.by.toFixed(1)}`);
  return said.length ? `${said.join(', ')} (m/s²)` : '';
}

/** The centre's acceleration at frame `at` from where it was two frames each side (m/s²), or nothing near the ends. */
function accelerationAt(points: THREE.Vector3[], at: number, seconds: number): THREE.Vector3 | null {
  if (at < 2 || at + 2 >= points.length) return null;
  const span = 2 * seconds;
  return points[at + 2].clone().addScaledVector(points[at], -2).add(points[at - 2]).divideScalar(span * span);
}

/** Where on the ground the push must come from at `frame` for every mass to move as it does (the zero moment point
 *  of the masses: each one's own acceleration at its own height, so a foot stopped by the ground under it moves the
 *  point hardly at all), the push up the ground (m/s² over the whole mass), and how far the game's movement and each
 *  part moved the point off under the centre of mass (m). */
interface PushPoint {
  at: THREE.Vector2;
  lift: number;
  moved: Record<Part | 'game', number>;
}

function pushPointAt(samples: BalanceSample[], frame: number, seconds: number): PushPoint | null {
  const sample = samples[frame];
  const root = accelerationAt(samples.map((each) => each.body), frame, seconds);
  if (!root) return null;
  const total = sample.masses.reduce((sum, kg) => sum + kg, 0);
  let up = 0;
  const turning = new THREE.Vector2();
  const shifts = Object.fromEntries(PARTS.map((part) => [part, new THREE.Vector2()])) as Record<Part, THREE.Vector2>;
  let low = 0;
  for (let i = 0; i < sample.points.length; i++) {
    const own = accelerationAt(samples.map((each) => each.points[i]), frame, seconds);
    if (!own) return null;
    const kg = sample.masses[i];
    const point = sample.points[i];
    const height = point.y - sample.ground;
    up += kg * (GRAVITY + own.y);
    turning.x += kg * ((GRAVITY + own.y) * point.x - height * own.x);
    turning.y += kg * ((GRAVITY + own.y) * point.z - height * own.z);
    // (its own motion off the body's: how it moves the point off under the centre)
    const offX = point.x - sample.centre.x;
    const offZ = point.z - sample.centre.z;
    const relative = own.clone().sub(root);
    shifts[sample.pointParts[i]].x += kg * (relative.y * offX - height * relative.x);
    shifts[sample.pointParts[i]].y += kg * (relative.y * offZ - height * relative.z);
    low += kg * height;
  }
  if (up <= 1e-6) {
    return { at: new THREE.Vector2(sample.centre.x, sample.centre.z), lift: up / total, moved: noMoves() };
  }
  const moved = noMoves();
  for (const part of PARTS) moved[part] = shifts[part].length() / up;
  moved.game = (Math.hypot(root.x, root.z) * low) / up;
  return { at: turning.divideScalar(up), lift: up / total, moved };
}

function noMoves(): Record<Part | 'game', number> {
  return { game: 0, trunk: 0, legs: 0, arms: 0, gear: 0 };
}

/** What moved a tip's push point off the soles: the weight itself off them, and the game's movement and each part,
 *  the largest first (cm). */
function tipCauses(weightOff: number, moved: Record<Part | 'game', number>): string {
  const shares = (Object.entries(moved) as [Part | 'game', number][]).filter(([, by]) => by >= 0.01);
  shares.sort((a, b) => b[1] - a[1]);
  const said = shares.map(([name, by]) => `${CAUSE_NAMES[name]} ${(by * 100).toFixed(0)}`);
  if (weightOff > 0.01) said.unshift(`its weight ${(weightOff * 100).toFixed(0)} cm off the soles`);
  return said.length ? `${said.join(', ')} (cm)` : '';
}

/** Which way a fall goes against the way the body goes: behind, ahead or to a side (or just off the feet, standing). */
function towardOf(offset: THREE.Vector2, way: THREE.Vector2 | null): string {
  if (!way || offset.lengthSq() < 1e-12) return 'off the feet';
  const along = offset.clone().normalize().dot(way);
  if (along < -0.7) return 'backwards';
  if (along > 0.7) return 'forwards';
  return 'sideways';
}

/** Every frame of `samples` (taken `seconds` apart) a body couldn't move as the hero's did. */
export function judgeBalance(samples: BalanceSample[], seconds: number): Fall[] {
  const falls: Fall[] = [];
  const centres = samples.map((sample) => sample.centre);
  const bodies = samples.map((sample) => sample.body);
  samples.forEach((sample, frame) => {
    const centre = accelerationAt(centres, frame, seconds);
    const body = accelerationAt(bodies, frame, seconds);
    if (!centre || !body) return;
    const along = Math.hypot(centre.x, centre.z);
    if (!sample.support.length) {
      // (only well in the air: around a landing the five frames straddle the ground's push)
      const inAir = [-2, -1, 1, 2].every((step) => !samples[frame + step].support.length);
      if (!inAir) return;
      if (along > AIR_PUSH) {
        const causes = causesAt(samples, frame, seconds, false);
        falls.push({ frame, unlike: 'pushed', by: along, toward: '', causes });
      }
      const held = centre.y + GRAVITY;
      const toward = held > 0 ? 'held up' : 'pulled down';
      if (Math.abs(held) > AIR_HELD) {
        const causes = causesAt(samples, frame, seconds, true);
        falls.push({ frame, unlike: 'held', by: Math.abs(held), toward, causes });
      }
      return;
    }
    const lift = GRAVITY + centre.y;
    if (lift < -AIR_HELD) {
      falls.push({ frame, unlike: 'pulled', by: -lift, toward: '', causes: causesAt(samples, frame, seconds, true) });
      return;
    }
    if (along > GRIP * Math.max(lift, 0)) {
      const asked = Math.hypot(body.x, body.z) > GRIP * GRAVITY;
      const causes = causesAt(samples, frame, seconds, false);
      falls.push({ frame, unlike: asked ? 'game' : 'grip', by: along, toward: '', causes });
      return;
    }
    // (where the push must come from for every mass to move so)
    const push = pushPointAt(samples, frame, seconds);
    if (!push) return;
    const outside = outsideOf(push.at, sample.support);
    if (outside.by > TIP_MARGIN) {
      const toward = towardOf(push.at.clone().sub(outside.nearest), sample.way);
      const weight = outsideOf(new THREE.Vector2(sample.centre.x, sample.centre.z), sample.support).by;
      falls.push({ frame, unlike: 'tips', by: outside.by, toward, causes: tipCauses(weight, push.moved) });
    }
  });
  return falls;
}
