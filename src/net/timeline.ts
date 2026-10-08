// A partner's reports played out on a timeline of its own. Every message carries its sender's clock, and what it
// reports (where its hero or the foes are, what they did) is shown a little behind the freshest report: far enough
// behind that the next report is nearly always in by the time it's needed, however irregularly the link brings them
// (a high ping is mostly fine; what shows is its jitter, a WebSocket's TCP holding every message up behind a late
// one). Positions are read between reports, events played when their time comes, so a foe's blow lands as its swing
// shows and a partner's shot leaves as its body turns to it. Shown on arrival instead, every copy jumped forward and
// stalled with each burst of reports, a jitter of 60 ms turning into speeds off by 1 to 1.4 m/s.

/** how long the link's lateness is judged over, ms (by time: a partner sending more messages, the host's fight every
 *  frame, judged over as many messages as another's, read it from a second's worth) */
const WINDOW = 8000;
/** the share of messages the play-out waits for (the latest of the rest are carried on along their way a moment) */
const WAIT_FOR = 0.98;
/** the least and most it plays behind the freshest report, beyond the reports' own spacing, ms */
const MARGIN_LEAST = 15;
const MARGIN_MOST = 250;
/** how quickly how far behind it plays may grow (the link got worse: quickly) and shrink (slowly), ms a second */
const GROW = 40;
const SHRINK = 10;
/** how quickly the quickest message's delay is forgotten, ms a second (each message as quick brings it back): a route
 *  that got longer is followed, slowly */
const FORGET = 2;
/** off its place by this, its clock runs 5% fast or slow to get back onto it (at most `CATCH_MOST`), ms; within
 *  `STEADY`, at its own rate: eased on at a fixed share of its rate whenever its place wobbled (the quickest message
 *  leaving its window, the lateness waited for changing), a copy ran 6 to 10% fast or slow, 0.5 m/s at a run */
const CATCH_UP = 4000;
const STEADY = 30;
const CATCH_MOST = 0.05;
/** how far past the newest report it may play, ms: a longer stall holds it there (held at once, a copy stopped dead
 *  in under 1% of frames, and that alone put its speed off its own by 0.6 m/s at a run) */
const PAST_NEWEST = 150;
/** further off its place than this, it jumps there (a long stall, a reconnect), ms */
const JUMP = 600;

/** One partner's clock: the sender's time to show, a little behind its freshest report. */
export class Timeline {
  /** the latest messages: when each arrived here and its sender time less that (the larger, the quicker it came) */
  private heardAt: number[] = [];
  private gaps: number[] = [];
  /** the quickest message's gap, forgotten slowly */
  private freshest = -Infinity;
  private newest = -Infinity;
  private playing = NaN;
  private last = NaN;
  /** how far behind the freshest report it plays, ms */
  behind = NaN;
  /** its clock's rate in the last frame (1: in step with ours), and whether a stall held it at the newest report */
  rate = 1;
  held = false;

  /** @param spacing how far apart in time the partner's reports of where things are come, ms */
  constructor(private readonly spacing: number) {}

  /** A message stamped `sent` (the sender's clock, ms) arrived now. */
  heard(sent: number, now = performance.now()): void {
    const gap = sent - now;
    this.heardAt.push(now);
    this.gaps.push(gap);
    this.freshest = Math.max(this.freshest, gap);
    this.newest = Math.max(this.newest, sent);
    while (this.heardAt.length > 1 && now - this.heardAt[0] > WINDOW) {
      this.heardAt.shift();
      this.gaps.shift();
    }
  }

  /** Whether anything has been heard yet. */
  get started(): boolean {
    return this.gaps.length > 0;
  }

  /** The sender's time to show now, ms: moving on with the clock, eased onto its place behind the freshest report. */
  advance(now = performance.now()): number {
    if (!this.gaps.length) return NaN;
    const step = Number.isNaN(this.last) ? 0 : now - this.last;
    this.last = now;
    this.freshest -= FORGET * step / 1000;
    this.behind = this.behindNow(step);
    const place = now + this.freshest - this.behind;
    const was = this.playing;
    if (Number.isNaN(this.playing) || Math.abs(place - this.playing) > JUMP) this.playing = place;
    else {
      const off = place - this.playing;
      const rate = Math.abs(off) < STEADY ? 1 : 1 + Math.max(-CATCH_MOST, Math.min(CATCH_MOST, off / CATCH_UP));
      this.playing += step * rate;
    }
    this.held = this.playing > this.newest + PAST_NEWEST;
    if (this.held) this.playing = this.newest + PAST_NEWEST;
    this.rate = step > 0 && !Number.isNaN(was) ? (this.playing - was) / step : 1;
    return this.playing;
  }

  /** How far behind the freshest report to play: the reports' spacing and the lateness most messages come within,
   *  grown quickly and shrunk slowly towards it. */
  private behindNow(step: number): number {
    const lateness = this.gaps.map((gap) => this.freshest - gap).sort((a, b) => a - b);
    const late = lateness[Math.min(lateness.length - 1, Math.floor(lateness.length * WAIT_FOR))];
    const wanted = this.spacing + Math.min(MARGIN_MOST, Math.max(MARGIN_LEAST, late));
    if (Number.isNaN(this.behind)) return wanted;
    const change = wanted - this.behind;
    return this.behind + Math.max(-SHRINK * step / 1000, Math.min(GROW * step / 1000, change));
  }
}

/** Where something is, the way it's going and the way it faces, at a moment of its sender's clock. */
export interface Pose {
  x: number;
  z: number;
  vx: number;
  vz: number;
  f: number;
}

interface Sample<T> extends Pose {
  t: number;
  data: T;
}

/** how many reports a track keeps */
const KEPT = 24;
/** past its last report, how long a track carries on along its way before it holds still, ms (where the next report
 *  has it instead is eased onto: `Smoother`) */
const CARRY_ON = 150;
/** two reports further apart than this were a jump (a respawn, a teleport): nothing is drawn between them, m */
const LEAP = 3;

const turnBetween = (a: number, b: number): number => Math.atan2(Math.sin(b - a), Math.cos(b - a));

/**
 * Something's reports of where it is (and whatever else it reports with them), read at any moment between them: a
 * cubic through each report's position and velocity (where a report carries none, the one its neighbours give), past
 * the last one carried on along its way a moment, then held.
 */
export class Track<T = undefined> {
  private samples: Sample<T>[] = [];
  /** the report the last read was carried on from, past it (none: the read was between reports) */
  carriedFrom = NaN;

  /** A report at `t` (the sender's clock, ms). `velocity` false: worked out from its neighbours. */
  add(t: number, pose: Pose, data: T, velocity = true): void {
    const list = this.samples;
    const last = list[list.length - 1];
    if (last && t <= last.t) return;
    const sample: Sample<T> = { t, ...pose, data };
    if (!velocity && last) {
      const dt = (t - last.t) / 1000;
      sample.vx = (sample.x - last.x) / dt;
      sample.vz = (sample.z - last.z) / dt;
      const before = list[list.length - 2];
      if (before) {
        const span = (t - before.t) / 1000;
        last.vx = (sample.x - before.x) / span;
        last.vz = (sample.z - before.z) / span;
      }
    }
    list.push(sample);
    if (list.length > KEPT) list.shift();
  }

  get empty(): boolean {
    return this.samples.length === 0;
  }

  /** The latest report's own data at or before `t` (the first one's before any). */
  dataAt(t: number): T | undefined {
    let found = this.samples[0];
    for (const sample of this.samples) {
      if (sample.t > t) break;
      found = sample;
    }
    return found?.data;
  }

  /** Where it was at `t` (the sender's clock, ms), into `out`. Returns false with no reports. */
  at(t: number, out: Pose): boolean {
    const list = this.samples;
    this.carriedFrom = NaN;
    if (!list.length) return false;
    let next = 0;
    while (next < list.length && list[next].t <= t) next++;
    if (next === 0) return copyPose(list[0], out);
    if (next === list.length) {
      this.carriedFrom = list[list.length - 1].t;
      return carryOn(list[list.length - 1], t, out);
    }
    const a = list[next - 1];
    const b = list[next];
    if (Math.hypot(b.x - a.x, b.z - a.z) > LEAP) return copyPose(a, out);
    between(a, b, t, out);
    return true;
  }
}

function copyPose(from: Pose, out: Pose): true {
  out.x = from.x;
  out.z = from.z;
  out.vx = from.vx;
  out.vz = from.vz;
  out.f = from.f;
  return true;
}

function carryOn(last: Sample<unknown>, t: number, out: Pose): true {
  const time = Math.min(CARRY_ON, t - last.t) / 1000;
  copyPose(last, out);
  out.x += last.vx * time;
  out.z += last.vz * time;
  if (t - last.t > CARRY_ON) {
    out.vx = 0;
    out.vz = 0;
  }
  return true;
}

/** Between reports `a` and `b` at `t`: a cubic Hermite through their positions and velocities. */
function between(a: Sample<unknown>, b: Sample<unknown>, t: number, out: Pose): void {
  const span = (b.t - a.t) / 1000;
  const s = (t - a.t) / (b.t - a.t);
  const s2 = s * s;
  const s3 = s2 * s;
  const h00 = 2 * s3 - 3 * s2 + 1;
  const h10 = s3 - 2 * s2 + s;
  const h01 = -2 * s3 + 3 * s2;
  const h11 = s3 - s2;
  out.x = h00 * a.x + h10 * span * a.vx + h01 * b.x + h11 * span * b.vx;
  out.z = h00 * a.z + h10 * span * a.vz + h01 * b.z + h11 * span * b.vz;
  const d00 = (6 * s2 - 6 * s) / span;
  const d10 = 3 * s2 - 4 * s + 1;
  const d01 = (-6 * s2 + 6 * s) / span;
  const d11 = 3 * s2 - 2 * s;
  out.vx = d00 * a.x + d10 * a.vx + d01 * b.x + d11 * b.vx;
  out.vz = d00 * a.z + d10 * a.vz + d01 * b.z + d11 * b.vz;
  out.f = a.f + turnBetween(a.f, b.f) * s;
}

/** a late report moving a copy further than this jumped it (a respawn, a teleport): taken at once, m */
const NUDGE_MOST = 1.5;
/** how quickly a copy eases onto where a late report has it, s (its time constant) */
const EASE = 0.1;

/**
 * A copy's shown place, kept on its track's but never moved by a late report in one frame: carried on past its last
 * report a moment (a stall), the track is pulled onto the next one as it comes, and the copy eases onto it instead of
 * jumping there (30 cm in a frame at a reversal). Only that: told apart by a jump in its place alone, a sharp start's
 * own bend was eased too, and the copy shook.
 */
export class Smoother {
  private offX = 0;
  private offZ = 0;
  private last: Pose | null = null;
  private carriedFrom = NaN;

  /** `pose` (`track`'s, read this frame) as shown, `dt` s after the last, into `out`. */
  follow(pose: Pose, track: Track<unknown>, dt: number, out: Pose): Pose {
    const last = this.last;
    const pulled = !Number.isNaN(this.carriedFrom) && track.carriedFrom !== this.carriedFrom;
    if (last && pulled) {
      const dx = last.x + last.vx * dt - pose.x;
      const dz = last.z + last.vz * dt - pose.z;
      if (Math.hypot(dx, dz) >= NUDGE_MOST) this.offX = this.offZ = 0;
      else {
        this.offX += dx;
        this.offZ += dz;
      }
    }
    this.carriedFrom = track.carriedFrom;
    this.last = { ...pose };
    const keep = Math.exp(-dt / EASE);
    this.offX *= keep;
    this.offZ *= keep;
    copyPose(pose, out);
    out.x += this.offX;
    out.z += this.offZ;
    return out;
  }
}

/** Events stamped with their sender's clock, handed out in order once their time comes. */
export class Playout<T> {
  private items: { t: number; item: T }[] = [];

  push(t: number, item: T): void {
    this.items.push({ t, item });
  }

  /** The events whose time is at or before `t`, in the order they came. */
  due(t: number): T[] {
    let count = 0;
    while (count < this.items.length && this.items[count].t <= t) count++;
    return this.items.splice(0, count).map((entry) => entry.item);
  }

  clear(): void {
    this.items = [];
  }
}
