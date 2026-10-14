// A body gone limp: a fallen foe's rig as points joined by its bones (verlet, after Jakobsen's), thrown by the blow
// that killed it and falling under gravity onto the floor, onto and against the props and against the arena's wall.
// Each frame the rig's joints are posed from the points, so whatever the body wears falls with it. Every foe but the
// training dummy is built on the shared rig (models/rig.ts), so one body serves them all.
import * as THREE from 'three';
import { G } from '../state';
import { groundHeight } from '../world/ground';
import type { Joints } from './models/rig';
import type { Obstacle } from '../types';

/** Something moving the fallen while it lasts (a storm's whirl, a beam's push): adds the acceleration it gives a point
 *  at `p` moving at `v` into `out` (m/s²), and says whether it reached it. */
export interface Field { accel(p: THREE.Vector3, v: THREE.Vector3, out: THREE.Vector3): boolean }

/** the rig's joints the points are at, in this order (the head's is its middle, above its joint) */
const POINTS = ['hips', 'thighL', 'thighR', 'kneeL', 'kneeR', 'ankleL', 'ankleR', 'chest', 'neck', 'head',
  'shoulderL', 'shoulderR', 'elbowL', 'elbowR', 'handL', 'handR'] as const;
type Point = typeof POINTS[number];
/** the points' joints in order, for what measures the body (tools/lab `death`) */
export const RAGDOLL_POINTS: readonly Point[] = POINTS;
const N = POINTS.length;
const I = Object.fromEntries(POINTS.map((name, i) => [name, i])) as Record<Point, number>;

/** the joints posed from the points, parents first */
const POSED = ['hips', 'spine', 'chest', 'neck', 'head', 'thighL', 'kneeL', 'ankleL', 'thighR', 'kneeR', 'ankleR',
  'shoulderL', 'elbowL', 'handL', 'shoulderR', 'elbowR', 'handR'] as const;
type Posed = typeof POSED[number];

/** the step (s): fixed, so a fall comes out the same at any frame rate; at most this many a frame (a stall drops time) */
const STEP = 1 / 120, MOST_STEPS = 6;
/** gravity (m/s²): over the Earth's, as foes a head taller than a man falling at 9.8 read as floating */
export const GRAVITY = 15;
/** passes over the joins a step */
const PASSES = 4;
/** the floor's grip: the speed it takes from a point sliding on it a second, as a share of gravity (Coulomb's), and a
 *  little more by its speed (rolling); how much of its speed into the floor a point keeps, bouncing off it */
const GRIP = 0.55, ROLL = 1.5, BOUNCE = 0.22;
/** the air's drag, the share of the speed it takes a second */
const DRAG = 0.12;
/** a body is still once no point has moved faster than this (m/s) for this long (s) */
const STILL = 0.15, STILL_FOR = 0.3;
/** a point running into a step's riser this far under the step's top is held back by it (m): less is stepped over */
const RISER = 0.06;

/** How each point is weighted (inverse mass: the trunk's heavier, so the limbs flail round it) and its size, as a share
 *  of the rig's proportions (models/rig.ts `Proportions`). */
const LIGHT = 1, TRUNK = 0.4, HEAD = 0.7;

/** Bones: joins kept at their length. */
const BONES: [Point, Point][] = [
  ['hips', 'thighL'], ['hips', 'thighR'], ['thighL', 'thighR'], ['thighL', 'kneeL'], ['kneeL', 'ankleL'],
  ['thighR', 'kneeR'], ['kneeR', 'ankleR'], ['hips', 'chest'], ['chest', 'neck'], ['neck', 'head'],
  ['chest', 'shoulderL'], ['chest', 'shoulderR'], ['shoulderL', 'shoulderR'], ['neck', 'shoulderL'],
  ['neck', 'shoulderR'], ['shoulderL', 'elbowL'], ['elbowL', 'handL'], ['shoulderR', 'elbowR'], ['elbowR', 'handR'],
];
/** Braces: joins kept within shares of their length at the fall, so the trunk bends and twists only so far, and the
 *  head on its neck. */
const BRACES: [Point, Point, number, number][] = [
  ['thighL', 'chest', 0.85, 1.05], ['thighR', 'chest', 0.85, 1.05],
  ['shoulderL', 'hips', 0.85, 1.05], ['shoulderR', 'hips', 0.85, 1.05],
  ['thighL', 'shoulderR', 0.85, 1.08], ['thighR', 'shoulderL', 0.85, 1.08],
  ['head', 'shoulderL', 0.8, 1.1], ['head', 'shoulderR', 0.8, 1.1], ['head', 'chest', 0.85, 1.02],
];
/** Limbs folding no further than a body's (the hip to the ankle, the shoulder to the hand: their least reach as a
 *  share of the limb's whole length), and the knees kept apart (a share of the hips' width). */
const FOLDS: [Point, Point, Point, number][] = [
  ['thighL', 'kneeL', 'ankleL', 0.35], ['thighR', 'kneeR', 'ankleR', 0.35],
  ['shoulderL', 'elbowL', 'handL', 0.3], ['shoulderR', 'elbowR', 'handR', 0.3],
];
const KNEES_APART = 0.6;
/** a hip folds the thigh up to the trunk no closer than this angle between them (rad) */
const HIP_FOLD = 0.9;

interface Join { a: number; b: number; min: number; max: number }

/** The bones' points by name, for what measures the body (tools/lab `death`: how far each is stretched). */
export const RAGDOLL_BONES: readonly (readonly [Point, Point])[] = BONES;

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _v = new THREE.Vector3(), _acc = new THREE.Vector3(), _p = new THREE.Vector3();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Quaternion();
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();

/** The rotation of a frame whose up is `up` and whose left (+x, the rig's) is `left` as near as square to it. */
function frameOf(up: THREE.Vector3, left: THREE.Vector3, out: THREE.Quaternion): THREE.Quaternion {
  _y.copy(up).normalize();
  _x.copy(left).addScaledVector(_y, -left.dot(_y));
  if (_x.lengthSq() < 1e-10) _x.set(1, 0, 0).addScaledVector(_y, -_y.x);
  _x.normalize();
  _z.crossVectors(_x, _y);
  return out.setFromRotationMatrix(_m.makeBasis(_x, _y, _z));
}

export interface RagdollOpts {
  /** frozen stiff: every point held where it is against every other, the body falling as one piece */
  stiff?: boolean;
}

/** A fallen body's points, joins and pose. */
export class Ragdoll {
  /** the points: where each is and where it was a step ago (verlet), its inverse mass and size (m) */
  private readonly p = new Float64Array(N * 3);
  private readonly q = new Float64Array(N * 3);
  private readonly w = new Float64Array(N);
  private readonly r = new Float64Array(N);
  /** each point's height on the body as it fell, the feet 0 and the top 1 (where a blow lands) */
  readonly heights = new Float64Array(N);
  private readonly joins: Join[] = [];
  /** the hinges' least reach, each limb's whole length (FOLDS) */
  private readonly folds: { a: number; mid: number; b: number; min: number }[] = [];
  private kneesApart = 0;
  private hipFold: { thigh: number; min: number }[] = [];
  /** the joints' turn in the world as it fell, the trunk's frames then and each limb's way then */
  private readonly q0 = new Map<Posed, THREE.Quaternion>();
  private readonly hips0Inv = new THREE.Quaternion();
  private readonly chest0Inv = new THREE.Quaternion();
  private readonly way0 = new Map<Posed, THREE.Vector3>();
  /** each posed joint's parent among the posed (none for the hips, whose parent is the body) */
  private readonly parentOf = new Map<Posed, Posed | undefined>();
  /** the joints' turn in the world this frame, the trunk's turns since the fall, a limb's and the root's */
  private readonly world = new Map<Posed, THREE.Quaternion>();
  private readonly dHips = new THREE.Quaternion();
  private readonly dChest = new THREE.Quaternion();
  /** where the spine's joint and the chest's were from the hips at the fall (the world's axes) */
  private readonly spineFromHips = new THREE.Vector3();
  private readonly chestFromSpine = new THREE.Vector3();
  private readonly turn = new THREE.Quaternion();
  private readonly rootTurn = new THREE.Quaternion();
  private left = 0;
  private stillFor = 0;
  /** asleep: still, and stepped no more until something moves it */
  asleep = false;
  /** the hardest landing since it was last read (m/s into the floor) */
  impact = 0;
  /** the props near enough to be met this frame */
  private near: Obstacle[] = [];

  constructor(private readonly j: Joints, opts: RagdollOpts = {}) {
    j.root.updateWorldMatrix(true, true);
    const P = j.P, scale = j.hips.getWorldScale(_p).x;
    const size: Record<Point, number> = {
      hips: P.hipW * 0.6, thighL: P.thighR, thighR: P.thighR, kneeL: P.shinR * 1.1, kneeR: P.shinR * 1.1,
      ankleL: P.shinR * 1.2, ankleR: P.shinR * 1.2, chest: P.chestD, neck: P.headR * 0.5, head: P.headR,
      shoulderL: P.upperR * 1.2, shoulderR: P.upperR * 1.2, elbowL: P.foreR, elbowR: P.foreR, handL: P.handR,
      handR: P.handR,
    };
    const weight: Record<Point, number> = {
      hips: TRUNK, thighL: TRUNK, thighR: TRUNK, chest: TRUNK, neck: TRUNK, shoulderL: TRUNK, shoulderR: TRUNK,
      head: HEAD, kneeL: LIGHT, kneeR: LIGHT, ankleL: LIGHT, ankleR: LIGHT, elbowL: LIGHT, elbowR: LIGHT,
      handL: LIGHT, handR: LIGHT,
    };
    for (const name of POINTS) {
      const i = I[name];
      const at = j[name].getWorldPosition(_p);
      if (name === 'head') at.add(_a.set(0, P.headR * scale, 0).applyQuaternion(j.head.getWorldQuaternion(_q)));
      this.set(i, at);
      this.q.set(this.p.subarray(i * 3, i * 3 + 3), i * 3);
      this.w[i] = weight[name];
      this.r[i] = Math.max(0.03, size[name] * scale);
    }
    for (const name of POSED) {
      this.q0.set(name, j[name].getWorldQuaternion(new THREE.Quaternion()));
      this.world.set(name, new THREE.Quaternion());
      this.parentOf.set(name, POSED.find((other) => j[other] === j[name].parent));
    }
    this.trunkFrames(this.hips0Inv, this.chest0Inv);
    this.hips0Inv.invert();
    this.chest0Inv.invert();
    const spine = j.spine.getWorldPosition(new THREE.Vector3());
    this.spineFromHips.copy(spine).sub(this.point(I.hips, _a));
    this.chestFromSpine.copy(this.point(I.chest, _a)).sub(spine);
    const ways: [Posed, Point, Point][] = [
      ['neck', 'neck', 'head'], ['thighL', 'thighL', 'kneeL'], ['kneeL', 'kneeL', 'ankleL'],
      ['thighR', 'thighR', 'kneeR'], ['kneeR', 'kneeR', 'ankleR'], ['shoulderL', 'shoulderL', 'elbowL'],
      ['elbowL', 'elbowL', 'handL'], ['shoulderR', 'shoulderR', 'elbowR'], ['elbowR', 'elbowR', 'handR'],
    ];
    for (const [joint, from, to] of ways) this.way0.set(joint, this.between(I[from], I[to], new THREE.Vector3()));
    this.joinUp(opts.stiff ?? false);
    let low = Infinity, high = -Infinity;
    for (let i = 0; i < N; i++) { low = Math.min(low, this.p[i * 3 + 1] - this.r[i]); high = Math.max(high, this.p[i * 3 + 1] + this.r[i]); }
    for (let i = 0; i < N; i++) this.heights[i] = (this.p[i * 3 + 1] - low) / Math.max(0.1, high - low);
  }

  /** The joins: the bones, the braces, the limbs' folds; frozen stiff, every point to every other. */
  private joinUp(stiff: boolean): void {
    const length = (a: number, b: number) => this.between(a, b, _a).length();
    const fixed = (a: number, b: number) => { const d = length(a, b); this.joins.push({ a, b, min: d, max: d }); };
    if (stiff) {
      for (let a = 0; a < N; a++) for (let b = a + 1; b < N; b++) fixed(a, b);
      return;
    }
    for (const [a, b] of BONES) fixed(I[a], I[b]);
    for (const [a, b, lo, hi] of BRACES) {
      const d = length(I[a], I[b]);
      this.joins.push({ a: I[a], b: I[b], min: d * lo, max: d * hi });
    }
    for (const [a, mid, b, share] of FOLDS) {
      const whole = length(I[a], I[mid]) + length(I[mid], I[b]);
      this.folds.push({ a: I[a], mid: I[mid], b: I[b], min: whole * share });
    }
    this.kneesApart = length(I.thighL, I.thighR) * KNEES_APART;
    const trunk = length(I.hips, I.chest);
    for (const [thigh, knee] of [['thighL', 'kneeL'], ['thighR', 'kneeR']] as const) {
      const leg = length(I[thigh], I[knee]);
      this.hipFold.push({ thigh: I[knee], min: Math.sqrt(trunk * trunk + leg * leg - 2 * trunk * leg * Math.cos(HIP_FOLD)) });
    }
  }

  private set(i: number, v: THREE.Vector3): void { this.p[i * 3] = v.x; this.p[i * 3 + 1] = v.y; this.p[i * 3 + 2] = v.z; }
  /** where point `i` is */
  point(i: number, out: THREE.Vector3): THREE.Vector3 { return out.set(this.p[i * 3], this.p[i * 3 + 1], this.p[i * 3 + 2]); }
  /** point `i`'s velocity (m/s) */
  velocity(i: number, out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.p[i * 3] - this.q[i * 3], this.p[i * 3 + 1] - this.q[i * 3 + 1], this.p[i * 3 + 2] - this.q[i * 3 + 2]).divideScalar(STEP);
  }
  private between(a: number, b: number, out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.p[b * 3] - this.p[a * 3], this.p[b * 3 + 1] - this.p[a * 3 + 1], this.p[b * 3 + 2] - this.p[a * 3 + 2]);
  }
  get count(): number { return N; }
  /** where the hips are, which the body is placed by */
  hips(out: THREE.Vector3): THREE.Vector3 { return this.point(I.hips, out); }
  /** the size of point `i` (m) */
  radius(i: number): number { return this.r[i]; }

  /** Speed added to point `i` (m/s), waking the body. */
  push(i: number, vx: number, vy: number, vz: number): void {
    this.q[i * 3] -= vx * STEP; this.q[i * 3 + 1] -= vy * STEP; this.q[i * 3 + 2] -= vz * STEP;
    this.asleep = false;
    this.stillFor = 0;
  }

  /** Speed added to the whole body, each point by its height's nearness to `at` (0 the feet, 1 the top): a blow
   *  lands hardest where it strikes, so a body struck high topples over its feet. */
  throw(vx: number, vy: number, vz: number, at: number): void {
    for (let i = 0; i < N; i++) {
      const k = 0.4 + 0.6 * Math.exp(-(((this.heights[i] - at) / 0.35) ** 2));
      this.push(i, vx * k, vy * k, vz * k);
    }
  }

  /** The body moved on by `dt` s, under gravity and `fields`. */
  step(dt: number, fields: Iterable<Field>): void {
    if (this.asleep) {
      // (woken by a field reaching its hips)
      for (const f of fields) if (f.accel(this.point(I.hips, _a), _b.set(0, 0, 0), _c.set(0, 0, 0))) { this.asleep = false; break; }
      if (this.asleep) return;
    }
    this.nearProps(dt);
    this.left = Math.min(this.left + dt, STEP * MOST_STEPS);
    let fastest = 0;
    while (this.left >= STEP) {
      this.left -= STEP;
      fastest = Math.max(fastest, this.move(fields));
      for (let pass = 0; pass < PASSES; pass++) {
        this.keepJoins();
        for (let i = 0; i < N; i++) this.collide(i);
      }
    }
    this.stillFor = fastest < STILL ? this.stillFor + dt : 0;
    if (this.stillFor >= STILL_FOR) this.asleep = true;
  }

  /** Each point moved on by its velocity, gravity and the fields; returns the fastest point's speed. */
  private move(fields: Iterable<Field>): number {
    const p = this.p, q = this.q, keep = 1 - DRAG * STEP;
    let fastest = 0;
    for (let i = 0; i < N; i++) {
      const k = i * 3;
      this.point(i, _p);
      this.velocity(i, _v);
      _acc.set(0, -GRAVITY, 0);
      for (const f of fields) f.accel(_p, _v, _acc);
      fastest = Math.max(fastest, _v.length());
      _acc.multiplyScalar(STEP * STEP);
      q[k] = p[k]; q[k + 1] = p[k + 1]; q[k + 2] = p[k + 2];
      p[k] += _v.x * STEP * keep + _acc.x;
      p[k + 1] += _v.y * STEP * keep + _acc.y;
      p[k + 2] += _v.z * STEP * keep + _acc.z;
    }
    return fastest;
  }

  /** The joins kept: each pair within its lengths, the limbs folding no further than a body's, the knees apart and
   *  bending forward only. */
  private keepJoins(): void {
    for (const jn of this.joins) this.within(jn.a, jn.b, jn.min, jn.max);
    for (const f of this.folds) this.within(f.a, f.b, f.min, Infinity);
    if (!this.folds.length) return;
    this.within(I.kneeL, I.kneeR, this.kneesApart, Infinity);
    for (const h of this.hipFold) this.within(I.chest, h.thigh, h.min, Infinity);
    this.hinge(I.thighL, I.kneeL, I.ankleL);
    this.hinge(I.thighR, I.kneeR, I.ankleR);
  }

  /** Points `a` and `b` moved apart or together, by their weights, to within `min` and `max` of each other. */
  private within(a: number, b: number, min: number, max: number): void {
    const p = this.p, ka = a * 3, kb = b * 3;
    const dx = p[kb] - p[ka], dy = p[kb + 1] - p[ka + 1], dz = p[kb + 2] - p[ka + 2];
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d < 1e-6 || (d >= min && d <= max)) return;
    const goal = d < min ? min : max, wa = this.w[a], wb = this.w[b], share = (d - goal) / (d * (wa + wb));
    p[ka] += dx * share * wa; p[ka + 1] += dy * share * wa; p[ka + 2] += dz * share * wa;
    p[kb] -= dx * share * wb; p[kb + 1] -= dy * share * wb; p[kb + 2] -= dz * share * wb;
  }

  /** A knee bends forward only: put back in front of the line from its hip to its ankle when it has gone behind it
   *  (forward is the pelvis's, from its points). */
  private hinge(hip: number, knee: number, ankle: number): void {
    this.between(I.thighR, I.thighL, _a);
    this.between(I.hips, I.chest, _b);
    const forward = _c.crossVectors(_a, _b).normalize();
    this.between(hip, ankle, _a);
    const len = _a.length();
    if (len < 1e-4) return;
    _a.divideScalar(len);
    this.between(hip, knee, _b);
    const off = _d.copy(_b).addScaledVector(_a, -_b.dot(_a));
    const behind = -off.dot(forward);
    if (behind <= 0.005) return;
    const k = knee * 3, fix = behind * 0.5;
    this.p[k] += forward.x * fix; this.p[k + 1] += forward.y * fix; this.p[k + 2] += forward.z * fix;
  }

  /** The props near enough to the body to be met this frame. */
  private nearProps(dt: number): void {
    this.point(I.hips, _a);
    this.velocity(I.hips, _b);
    const reach = 2.5 + _b.length() * dt;
    this.near = G.arena.obstacles.filter((o) => Math.hypot(o.x - _a.x, o.z - _a.z) < reach + o.r);
  }

  /** Point `i` kept out of the floor (bouncing and sliding on it), out of the props standing above it and in the arena. */
  private collide(i: number): void {
    const p = this.p, q = this.q, k = i * 3, r = this.r[i];
    const floor = groundHeight(p[k], p[k + 2]);
    if (p[k + 1] < floor + r) {
      const was = groundHeight(q[k], q[k + 2]);
      // (into a step's riser from the level below: held back by it, not lifted up the step)
      if (floor > was + 1e-3 && p[k + 1] < floor + r - RISER) { p[k] = q[k]; p[k + 2] = q[k + 2]; }
      else this.land(i, floor + r);
    }
    for (const o of this.near) {
      const dx = p[k] - o.x, dz = p[k + 2] - o.z, min = o.r + r, d2 = dx * dx + dz * dz;
      if (d2 >= min * min) continue;
      const top = groundHeight(o.x, o.z) + o.h;
      if (p[k + 1] - r >= top) continue;
      // (coming down onto it: it lies on top; else it's pushed out of its side)
      if (q[k + 1] - r >= top - 0.05) { this.land(i, top + r); continue; }
      const d = Math.sqrt(d2) || 1e-3;
      p[k] = o.x + (dx / d) * min;
      p[k + 2] = o.z + (dz / d) * min;
    }
    const R = G.arena.radius - r, out = Math.hypot(p[k], p[k + 2]);
    if (out > R) { p[k] *= R / out; p[k + 2] *= R / out; }
  }

  /** Point `i` set on a surface at `y`: bouncing off it a little and sliding on it, slowed by its grip. */
  private land(i: number, y: number): void {
    const p = this.p, q = this.q, k = i * 3;
    const down = p[k + 1] - q[k + 1];
    this.impact = Math.max(this.impact, -down / STEP);
    p[k + 1] = y;
    q[k + 1] = y + Math.min(0, down) * BOUNCE;
    const dx = p[k] - q[k], dz = p[k + 2] - q[k + 2], slide = Math.hypot(dx, dz);
    if (slide < 1e-9) return;
    const left = Math.max(0, slide - GRIP * GRAVITY * STEP * STEP) * (1 - ROLL * STEP);
    q[k] = p[k] - dx * (left / slide);
    q[k + 2] = p[k + 2] - dz * (left / slide);
  }

  /** The pelvis's frame (up its trunk, left across its hips) and the chest's (up its neck, left across its
   *  shoulders), from the points. */
  private trunkFrames(hips: THREE.Quaternion, chest: THREE.Quaternion): void {
    frameOf(this.between(I.hips, I.chest, _a), this.between(I.thighR, I.thighL, _b), hips);
    frameOf(this.between(I.chest, I.neck, _a), this.between(I.shoulderR, I.shoulderL, _b), chest);
  }

  /** The rig posed from the points: the trunk by its frames, each limb swung from its way at the fall onto its way
   *  now (carrying its parent's turn, so it twists with it), the hands and feet with their forearms and shins, and
   *  the body placed so its hips are on their point. */
  pose(): void {
    const j = this.j, W = this.world, Q0 = this.q0;
    const dHips = this.dHips, dChest = this.dChest;
    this.trunkFrames(dHips, dChest);
    dHips.multiply(this.hips0Inv);
    dChest.multiply(this.chest0Inv);
    W.get('hips')!.copy(dHips).multiply(Q0.get('hips')!);
    // (the spine swung from the pelvis's turn so the chest's joint lands on its point: turned halfway to the chest's,
    // the chest stood off its point by half the trunk's bend, and the head and arms with it)
    const spineAt = _c.copy(this.spineFromHips).applyQuaternion(dHips).add(this.point(I.hips, _p));
    const was = _a.copy(this.chestFromSpine).applyQuaternion(dHips).normalize();
    const now = this.point(I.chest, _b).sub(spineAt).normalize();
    this.turn.setFromUnitVectors(was, now).multiply(dHips);
    W.get('spine')!.copy(this.turn).multiply(Q0.get('spine')!);
    W.get('chest')!.copy(dChest).multiply(Q0.get('chest')!);
    this.limb(dChest, ['neck', 'neck', 'head'], null, 'head');
    this.limb(dHips, ['thighL', 'thighL', 'kneeL'], ['kneeL', 'kneeL', 'ankleL'], 'ankleL');
    this.limb(dHips, ['thighR', 'thighR', 'kneeR'], ['kneeR', 'kneeR', 'ankleR'], 'ankleR');
    this.limb(dChest, ['shoulderL', 'shoulderL', 'elbowL'], ['elbowL', 'elbowL', 'handL'], 'handL');
    this.limb(dChest, ['shoulderR', 'shoulderR', 'elbowR'], ['elbowR', 'elbowR', 'handR'], 'handR');
    // the body unturned, placed so the hips land on their point
    j.body.quaternion.identity();
    j.body.position.set(0, 0, 0);
    j.root.updateWorldMatrix(true, false);
    j.body.position.copy(j.root.worldToLocal(this.point(I.hips, _a))).sub(j.hips.position);
    const rootTurn = j.root.getWorldQuaternion(this.rootTurn);
    for (const name of POSED) {
      const joint = j[name], parent = this.parentOf.get(name);
      const parentTurn = parent ? W.get(parent)! : joint.parent === j.body ? rootTurn : joint.parent!.getWorldQuaternion(_q);
      joint.quaternion.copy(_s.copy(parentTurn).invert()).multiply(W.get(name)!);
    }
  }

  /** A limb's joints (`upper`, then `lower`) turned in the world: each swung from its way at the fall (turned on by
   *  its parent's turn since) onto its way now, the next carrying that on, and its `end` (the hand, the foot, the
   *  head) turned with the last. */
  private limb(parentTurn: THREE.Quaternion, upper: Link, lower: Link | null, end: Posed): void {
    const turn = this.turn.copy(parentTurn);
    this.swing(turn, upper);
    if (lower) this.swing(turn, lower);
    this.world.get(end)!.copy(turn).multiply(this.q0.get(end)!);
  }

  /** `turn` carried on through a link: swung from the link's way at the fall, as `turn` has it now, onto its way now. */
  private swing(turn: THREE.Quaternion, [joint, from, to]: Link): void {
    const was = _a.copy(this.way0.get(joint)!).applyQuaternion(turn).normalize();
    const now = this.between(I[from], I[to], _b).normalize();
    turn.premultiply(_s.setFromUnitVectors(was, now));
    this.world.get(joint)!.copy(turn).multiply(this.q0.get(joint)!);
  }
}

/** A limb's joint and the points its way runs between. */
type Link = [Posed, Point, Point];
