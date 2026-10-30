// An idle hero sits down on a log or a stone nearby (the owner's words: "if there is a nearby log or not high stone ...
// and character is idle, they need to walk up to this prop and sit on it, should sit on the closest side", "when user
// presses any action, they should stand up first, then perform the action if user is still pressing it (do not
// queue)", "while seated, they should continue looking left/right like now"). After `SIT.after` s idle with a seat
// within `SIT.within` m and no foe about, he walks to where he'd stand to sit (`world/seats.ts`), turns his back to
// it and sits (`models/sit.ts` poses him); any key, a foe coming near or a hit gets him up again first, and only a key
// still held once he's up acts. His look round goes on throughout: sat, he stands idle.
import * as THREE from 'three';
import type { SitHands, SitState } from '../types';
import { G } from '../state';
import { angleDamp } from '../util';
import { SEAT, seatPointed, seatSpot, seatSpotAt, seatStands, type Relaxed, type Seat, type SeatSpot } from '../world/seats';
import { outline } from '../ui/overlay/outline';

export const SIT = {
  /** how long he stands idle before he goes to sit (s), and how far off a seat may be (m, to where he'd sit) */
  after: 6, within: 6,
  /** his walk there (a share of his speed), how near where he'd stand counts as there (m) and how long he may go on
   *  getting no nearer before he gives it up (s, a prop in his way) */
  walk: 0.45, there: 0.1, stuck: 1.2,
  /** how fast he turns his back to the seat (1/s), as fast as a person turns at most (rad/s), and how long it may take
   *  (s). (Eased alone, he spun about at up to 21 rad/s, a snap, and the axe in his hand went 42 cm in a frame) */
  turn: 7, turnFastest: 5, turnMost: 1.2,
  /** the way down and the way up (s), and his hands' getting up as a share of their sitting down, before he stands and
   *  after (`Model.sitHands`: asked to act, the whole slow reverse, the owner's choice: up and doing it in about
   *  2.3 s, a greatsword drawn out of the ground and onto his shoulder; at a third of the time, it was swung over the top 40 cm a frame), and how far
   *  down he still is as they begin again before he stands (`handsFrom`) */
  down: 1.1, up: 0.8, handsUp: [1, 0.7], handsFrom: 0.5,
  /** a foe this near gets him up (m) */
  foes: 14,
  /** how long E asking him to sit waits to be taken, as he comes free (s): taken on its frame alone, a press just
   *  after an attack, his aim still held, was lost */
  asked: 1,
  /** how long the cursor rests on a seat before it's outlined and E sits him on it (s), and how far off it may be (m):
   *  "E sits only when pointed at a sittable object for more than 2 sec", "12m max distance" */
  look: 2, reach: 12,
  /** after one he can't reach or finds no seat, how long before he looks again (s) */
  retry: 3,
};

type Phase = 'walk' | 'turn' | 'down' | 'sat' | 'up';

/** the outline round the seat E would sit him on */
const POINTED = 0xffffff;

/** `facing` turned towards `yaw` over `dt` as he turns to his seat: eased, no faster than `SIT.turnFastest`. */
function turnedTo(facing: number, yaw: number, dt: number): number {
  const eased = angleDamp(facing, yaw, SIT.turn, dt);
  const step = Math.atan2(Math.sin(eased - facing), Math.cos(eased - facing));
  const most = SIT.turnFastest * dt;
  return facing + Math.max(-most, Math.min(most, step));
}

/** What the sit reads of the hero and moves. */
export interface Sitter {
  readonly pos: THREE.Vector3;
  facing: number;
  readonly radius: number;
  /** how long his hands take before he goes down and once he's sat, on a seat or the floor (`Model.sitHands`) */
  sitHands(floor: boolean): SitHands;
}

export class Sitting {
  private phase: Phase | null = null;
  private spot: SeatSpot | null = null;
  private idleFor = 0;
  private retryIn = 0;
  /** asked to sit now (E, `ask`): for this long (s), the first frame free to, he goes to the seat pointed at
   *  (`askedSeat`, where the cursor met it) without his idle's wait */
  private asked = 0;
  private askedSeat: Seat | null = null;
  private readonly askedAt = new THREE.Vector3();
  /** the seat the cursor rests on, where it meets it and for how long (s), and whether it's outlined (`point`) */
  private pointedSeat: Seat | null = null;
  private readonly pointedAt = new THREE.Vector3();
  private pointedFor = 0;
  private lit = false;
  /** walking there: the nearest he has come and for how long he's come no nearer */
  private best = Infinity;
  private noNearer = 0;
  private turnFor = 0;
  /** how far down he is (0 standing, 1 sat), and where he stood as he began to sit */
  private u = 0;
  private readonly from = new THREE.Vector3();
  /** the seat he got up from, kept off it only as far as he has left it (`relaxed`) */
  private leaving: Relaxed | null = null;
  private readonly state: SitState = { w: 0, hip: 0, foot: 0, before: 0, after: 0 };

  /** The pose's share of the sit this frame, or none. */
  get pose(): SitState | null {
    return this.state.w > 0 || this.state.before > 0 ? this.state : null;
  }

  /** Whether he's on his way to sit or up from it (walking there, turning, his body or his hands between their
   *  ends): he doesn't glance round then, as he watches what he does (`Player.lookAtFoe`). The sit poses his arms
   *  from his chest, and a glance turns it: a greataxe held as it rested swung round with his chest, its haft 15 cm
   *  into it on the low stone; only sat does he look round again. */
  get staged(): boolean {
    return this.phase !== null && this.phase !== 'sat';
  }

  /** Whether the sit places him this frame (going down, sat, getting up): nothing else moves him or keeps him off. */
  get placed(): boolean {
    return this.phase === 'turn' || this.phase === 'down' || this.phase === 'sat' || this.phase === 'up';
  }

  /** Whether he's walking to a seat: `walkGoal` is his way. */
  get walking(): boolean {
    return this.phase === 'walk';
  }

  /** The seat's circles he is let nearer, and how near. */
  get relaxed(): Relaxed | null {
    if (this.phase && this.spot) return { circles: this.spot.seat.circles, r: SEAT.near };
    return this.leaving;
  }

  /** The seat the cursor points at, followed a frame (`ray`: the cursor's, none on touch; `peace`: no wave under way):
   *  outlined white once it has rested there `SIT.look`, when E sits him on it. */
  point(me: Sitter, ray: THREE.Ray | null, dt: number, peace: boolean): void {
    const hit = peace && ray && this.phase === null ? seatPointed(ray, G.arena.seats, me.pos, SIT.reach) : null;
    const seat = hit?.seat ?? null;
    this.pointedFor = seat && seat === this.pointedSeat ? this.pointedFor + dt : 0;
    this.pointedSeat = seat;
    if (hit) this.pointedAt.set(hit.x, 0, hit.z);
    const ready = !!seat && this.pointedFor >= SIT.look;
    if (ready) outline(seat!.outline, POINTED, 1);
    else if (this.lit) outline(null);
    this.lit = ready;
  }

  /** Asked to sit now (E; from play: "to speed up the wait of 6 sec", "E sits only when pointed at a sittable object
   *  for more than 2 sec, any distance, at peace time"): on the seat outlined, there along it. Returns whether he
   *  wasn't sitting already (on his way, down or getting up: then it's a key that gets him up, as any other). */
  ask(): boolean {
    if (this.phase !== null) return false;
    if (!this.lit) return true;
    this.asked = SIT.asked;
    this.askedSeat = this.pointedSeat;
    this.askedAt.copy(this.pointedAt);
    return true;
  }

  /** Given up at once, standing (a respawn, a teleport, the hero placed). */
  clear(): void {
    this.asked = 0;
    this.pointedSeat = null;
    if (this.lit) outline(null);
    this.lit = false;
    this.phase = null;
    this.spot = null;
    this.leaving = null;
    this.idleFor = 0;
    this.u = 0;
    this.state.w = 0;
    this.state.before = 0;
    this.state.after = 0;
  }

  /**
   * A frame of it: `free` whether he could stand idle (nothing cast, aimed, held, no foe near), `acted` whether a key
   * or the stick asks anything of him. Returns whether the frame is the sit's: he takes no input while it is.
   */
  update(me: Sitter, dt: number, free: boolean, acted: boolean): boolean {
    this.leave(me);
    const go = free && !acted && (!this.spot || seatStands(this.spot.seat));
    switch (this.phase) {
      case null: this.wait(me, dt, free && !acted); return false;
      case 'walk': return this.walk(me, dt, go);
      case 'turn': return this.turnRound(me, dt, go);
      case 'down': case 'sat': return this.sit(me, dt, go);
      case 'up': return this.rise(me, dt);
    }
  }

  /** His walk's goal toward where he'd stand to sit, at `speed` (m/s, his own), easing in as he comes. */
  walkGoal(me: Sitter, speed: number, goal: THREE.Vector3): void {
    const s = this.spot!;
    const dx = s.fx - me.pos.x, dz = s.fz - me.pos.z, d = Math.hypot(dx, dz) || 1;
    const v = Math.min(speed * SIT.walk, d * 2.5);
    goal.set(dx / d * v, 0, dz / d * v);
  }

  /** Standing idle: long enough, the nearest seat's spot taken to walk to. */
  private wait(me: Sitter, dt: number, idle: boolean): void {
    this.idleFor = idle ? this.idleFor + dt : 0;
    this.retryIn -= dt;
    const asked = this.asked > 0 && idle;
    this.asked = asked ? 0 : Math.max(0, this.asked - dt);
    if (!asked && (this.idleFor < SIT.after || this.retryIn > 0)) return;
    const at = this.askedAt;
    this.spot = asked ? seatSpotAt(this.askedSeat!, at.x, at.z, me.pos, me.radius) : nearestSpot(me);
    if (!this.spot) {
      if (!asked) this.retryIn = SIT.retry;
      return;
    }
    this.phase = 'walk';
    this.best = Infinity;
    this.noNearer = 0;
  }

  private walk(me: Sitter, dt: number, go: boolean): boolean {
    const s = this.spot!;
    const d = Math.hypot(s.fx - me.pos.x, s.fz - me.pos.z);
    if (d < this.best - 0.02) {
      this.best = d;
      this.noNearer = 0;
    } else this.noNearer += dt;
    if (!go || this.noNearer > SIT.stuck) {
      if (go) this.retryIn = SIT.retry;
      this.giveUp();
      return false;
    }
    if (d > SIT.there) return false;
    this.phase = 'turn';
    this.turnFor = 0;
    return true;
  }

  private turnRound(me: Sitter, dt: number, go: boolean): boolean {
    if (!go) {
      this.giveUp();
      return false;
    }
    const s = this.spot!;
    me.facing = turnedTo(me.facing, s.yaw, dt);
    this.turnFor += dt;
    const off = Math.abs(Math.atan2(Math.sin(s.yaw - me.facing), Math.cos(s.yaw - me.facing)));
    if (off < 0.05 || this.turnFor > SIT.turnMost) {
      this.phase = 'down';
      this.u = 0;
      this.from.copy(me.pos);
    }
    return true;
  }

  private sit(me: Sitter, dt: number, go: boolean): boolean {
    if (!go) {
      this.phase = 'up';
      return this.rise(me, dt);
    }
    // (his hands first, standing; then his body; then his hands again, sat: lowered as he went down, a greatsword
    // swept through the log behind him)
    const st = this.state, hands = me.sitHands(!!this.spot!.seat.ground);
    if (st.before < 1) st.before = hands.before > 0 ? Math.min(1, st.before + dt / hands.before) : 1;
    else if (this.u < 1) this.u = Math.min(1, this.u + dt / SIT.down);
    else st.after = hands.after > 0 ? Math.min(1, st.after + dt / hands.after) : 1;
    if (st.after >= 1) this.phase = 'sat';
    this.place(me, dt);
    return true;
  }

  private rise(me: Sitter, dt: number): boolean {
    // (each back in turn, his hands quicker, `handsUp`, and readied again from half way up: in turn, a greatsword
    // swung back onto his shoulder in time went 45 cm a frame, and he took 2.6 s to be up)
    const st = this.state, hands = me.sitHands(!!this.spot!.seat.ground), [before, after] = SIT.handsUp;
    if (st.after > 0) st.after = hands.after > 0 ? Math.max(0, st.after - dt / (hands.after * after)) : 0;
    else {
      if (this.u > 0) this.u = Math.max(0, this.u - dt / SIT.up);
      if (this.u < SIT.handsFrom) st.before = hands.before > 0 ? Math.max(0, st.before - dt / (hands.before * before)) : 0;
    }
    this.place(me, dt);
    // Hands without a separate stage finish halfway up; the body must finish too, or its weapon jumps to standing.
    if (this.u > 0 || st.before > 0) return true;
    // (up: let go of the seat only as he leaves it, from as near as he stands, or its circles would throw him off it)
    this.leaving = { circles: this.spot!.seat.circles, r: SEAT.near };
    this.giveUp();
    return true;
  }

  /** Placed as far down as he is: his hips over the seat, his feet where he stood, his back to it. */
  private place(me: Sitter, dt: number): void {
    const s = this.spot!, w = smooth(this.u);
    // (the hips come back over the seat as he goes down, sooner than they drop: a body sits back onto a seat)
    const back = smooth(Math.min(1, this.u * 1.25));
    me.pos.x = this.from.x + (s.x - this.from.x) * back;
    me.pos.z = this.from.z + (s.z - this.from.z) * back;
    me.facing = turnedTo(me.facing, s.yaw, dt);
    this.state.w = w;
    this.state.hip = s.hip;
    // (his feet where he stood, from where his hips are now)
    this.state.foot = Math.hypot(this.from.x - me.pos.x, this.from.z - me.pos.z);
  }

  /** Off the seat he got up from: kept off its circles only as far as he's gone from them. */
  private leave(me: Sitter): void {
    const l = this.leaving;
    if (!l) return;
    let gap = Infinity;
    for (const o of l.circles) gap = Math.min(gap, Math.hypot(me.pos.x - o.x, me.pos.z - o.z) - o.r);
    l.r = Math.max(l.r, Math.min(me.radius, gap));
    if (l.r >= me.radius - 1e-3) this.leaving = null;
  }

  private giveUp(): void {
    this.phase = null;
    this.spot = null;
    this.idleFor = 0;
    this.u = 0;
    this.state.w = 0;
    this.state.before = 0;
    this.state.after = 0;
  }
}

/** The seat's spot nearest him within `SIT.within`, or none. */
function nearestSpot(me: Sitter): SeatSpot | null {
  let best: SeatSpot | null = null, bd = SIT.within;
  for (const seat of G.arena.seats) {
    const spot = seatSpot(seat, me.pos.x, me.pos.z, me.radius);
    if (!spot) continue;
    const d = Math.hypot(spot.x - me.pos.x, spot.z - me.pos.z);
    if (d < bd) {
      bd = d;
      best = spot;
    }
  }
  return best;
}

/** Whether a foe (not a training dummy) is up and about within `SIT.foes` of (`x`, `z`). */
export function foeNear(x: number, z: number): boolean {
  return G.enemies.some((e) => e.alive && !e.def.dummy && (e.pos.x - x) ** 2 + (e.pos.z - z) ** 2 < SIT.foes ** 2);
}

const smooth = (u: number) => u * u * (3 - 2 * u);
