// A hero's casual look round as he stands idle: now and then his eyes go to one side, the head follows them there,
// holds a moment and comes back (the neck and the upper trunk carry a little of a bigger turn). The times between
// glances, how far and how long each is held are drawn from a seeded random stream of his own, so the lab sees the
// same glances every run and no hero glances in a loop. Cosmetic: a co-op partner's copy glances on its own clock, and
// nothing of it is sent. Applied by `LookAt` (ik.ts) on top of the pose, when nothing else is looked at.
import * as THREE from 'three';
import type { Joints } from './rig';
import { mulberry } from '../../util';

/** The glances' tuning. A person's casual glance turns the head 25 to 60 degrees in about half a second to a second,
 *  the eyes first (their saccade a tenth of a second), and the eyes come back to the middle of their sockets as the
 *  head gets there. */
export const GLANCE = {
  /** how far the gaze turns (rad), and how long it's held there (s): turned 25 to 35 degrees from the chest, a glance
   *  barely read from the lobby's camera */
  far: [0.75, 1.15], hold: [0.9, 2.2],
  /** the wait between glances (s), and before the first once he stands idle */
  wait: [2.5, 7], first: [1.5, 4.5],
  /** how often a glance is carried on across to the other side before it comes back */
  across: 0.25,
  /** critically damped springs' rates (1/s): the head's turn, the eyes' (they lead), and the way back as he moves or
   *  casts (a spring, so even that sets off from rest); the head's turn follows its aim eased in by a spring `lead`
   *  times as fast (a spring set off by a step starts at its full pull: the head's move a frame jumped 0.65 degrees
   *  as a glance swung across to the other side) */
  head: 5, eyes: 16, back: 11, lead: 2,
  /** how far the eyes turn in their sockets (rad), and the share of the gaze they keep once the head is there (at 17
   *  degrees on top of the head's turn the mage's far iris sat in the corner of his lids, a strained look aside) */
  eyeMost: 0.26, eyeKeep: 0.1,
  /** the chest's share of a turn: `chest` of it times the turn over the turn and `chestFrom` (rad), so a small glance
   *  is the neck's alone and a bigger one carries the upper trunk round a little */
  chest: 0.38, chestFrom: 0.3,
  /** how far the gaze tips down or up with a glance (rad) */
  tip: 0.06,
};

/** A critically damped spring towards `target`, stepped `dt` exactly (its closed form: stable at any frame's
 *  length). */
interface Spring { x: number; v: number }
function spring(s: Spring, target: number, rate: number, dt: number): void {
  const x = s.x - target, e = Math.exp(-rate * dt), k = s.v + rate * x;
  s.x = target + (x + k * dt) * e;
  s.v = (s.v - rate * k * dt) * e;
}

const between = (r: () => number, [a, b]: number[]): number => a + (b - a) * r();
const _before = new THREE.Quaternion(), _after = new THREE.Quaternion();

/** a string to a seed (FNV-1a) */
const seedOf = (name: string): number => {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619);
  return h >>> 0;
};

/** One hero's glances. */
export class Glance {
  private readonly random: () => number;
  /** what he does now: waiting for the next glance, looking aside (held for `left` s), or back ahead */
  private phase: 'wait' | 'look' = 'wait';
  private left = 0;
  /** the gaze he turns to (rad: + his left; and its tip) */
  private aim = 0;
  private tipAim = 0;
  /** the head's turn and tip (the whole of it, shared out below), the aims they follow eased in, and where the eyes
   *  look */
  private readonly turn: Spring = { x: 0, v: 0 };
  private readonly tip: Spring = { x: 0, v: 0 };
  private readonly turnTo: Spring = { x: 0, v: 0 };
  private readonly tipTo: Spring = { x: 0, v: 0 };
  private readonly gaze: Spring = { x: 0, v: 0 };
  private readonly eyes: THREE.Object3D[] = [];
  /** idle last frame: a glance's wait starts afresh once he stands idle again */
  private wasIdle = false;

  constructor(private readonly j: Joints, seed: string) {
    this.random = mulberry(seedOf(seed));
    // (the eyeballs, models/head.ts: they turn in their sockets about their own middles)
    j.head.traverse((o) => { if (o.name === 'eye') this.eyes.push(o); });
  }

  reset(): void {
    this.phase = 'wait';
    this.left = 0;
    this.aim = this.tipAim = 0;
    for (const s of [this.turn, this.tip, this.turnTo, this.tipTo, this.gaze]) s.x = s.v = 0;
    this.wasIdle = false;
    for (const e of this.eyes) e.rotation.y = 0;
  }

  /** Steps the glances `dt` and turns the joints by them; `idle`: standing, nothing cast, aimed or looked at. */
  update(dt: number, idle: boolean): void {
    if (!idle) {
      this.phase = 'wait';
      this.aim = this.tipAim = 0;
      this.wasIdle = false;
    } else {
      if (!this.wasIdle) this.left = between(this.random, GLANCE.first);
      this.wasIdle = true;
      this.left -= dt;
      if (this.left <= 0) this.next();
    }
    const rate = idle ? GLANCE.head : GLANCE.back, lead = rate * GLANCE.lead;
    spring(this.gaze, this.aim, idle ? GLANCE.eyes : GLANCE.back * 1.6, dt);
    spring(this.turnTo, this.aim * (1 - GLANCE.eyeKeep), lead, dt);
    spring(this.tipTo, this.tipAim, lead, dt);
    spring(this.turn, this.turnTo.x, rate, dt);
    spring(this.tip, this.tipTo.x, rate, dt);
    this.apply();
  }

  /** The next step of the glances: a glance aside, carried across, or back ahead to wait for the next. */
  private next(): void {
    const r = this.random;
    if (this.phase === 'wait') {
      this.phase = 'look';
      this.aim = (r() < 0.5 ? -1 : 1) * between(r, GLANCE.far);
      this.tipAim = (r() * 2 - 1) * GLANCE.tip;
      this.left = between(r, GLANCE.hold);
    } else if (Math.abs(this.aim) > 0.6 && r() < GLANCE.across) {
      // (from one side across to the other, held there a little less)
      this.aim = -Math.sign(this.aim) * between(r, GLANCE.far);
      this.tipAim = (r() * 2 - 1) * GLANCE.tip;
      this.left = between(r, GLANCE.hold) * 0.7;
    } else {
      this.phase = 'wait';
      this.aim = this.tipAim = 0;
      this.left = between(r, GLANCE.wait);
    }
  }

  /** where the eyes look in their sockets: the gaze less the head's turn, as far as they turn */
  private eyeTurn(): number {
    const m = GLANCE.eyeMost;
    return Math.max(-m, Math.min(m, this.gaze.x - this.turn.x));
  }

  /** The turn shared out: the chest a little of a bigger turn, the rest the neck 40 and the head 60. The arms stay
   *  where the pose put them as the chest turns under them (carried round, the mage's staff swung across his face). */
  private apply(): void {
    const j = this.j, y = this.turn.x, p = this.tip.x;
    const chest = (GLANCE.chest * y * Math.abs(y)) / (Math.abs(y) + GLANCE.chestFrom), rest = y - chest;
    _before.setFromEuler(j.chest.rotation);
    j.chest.rotation.y += chest;
    _after.setFromEuler(j.chest.rotation).invert().multiply(_before);
    j.shoulderL.quaternion.premultiply(_after);
    j.shoulderR.quaternion.premultiply(_after);
    j.neck.rotation.y += rest * 0.4;
    j.head.rotation.y += rest * 0.6;
    j.neck.rotation.x += p * 0.4;
    j.head.rotation.x += p * 0.6;
    const eye = this.eyeTurn();
    for (const e of this.eyes) e.rotation.y = eye;
  }
}
