// What posing the hero costs a frame (tools/lab): his model's `animate` timed by the browser's own clock, frame by
// frame, as a scenario runs. The lab's frames run on its own clock, so a pose that took 300 ms a frame went by
// unseen: two-handed Power Strike read a breakable prop's top by three's raycaster, every triangle of the prop, for
// each point its stop tried, and met by the owner's blow a pillar or a log held the game at 4 fps.

import type { Model } from '../../../src/types';
import { timeCalls, type CallTimes, type Timing } from './timing';

/** a frame's pose may take this long (ms, by the browser's clock): the lab's median is about 1.5, and main's slowest
 *  frame read up to 10 by the noise of a machine shared with other work (the pillar's raycasts took 571) */
export const POSE_MOST = 20;
/** the canary's spin (ms): one frame's pose made this much slower must read as too slow */
const CANARY_SPIN = 40;

/** A scenario's poses timed frame by frame: the slowest, where, and how many were over `POSE_MOST`. */
export class PoseCost {
  private readonly timing: Timing;
  private readonly unplant: () => void;
  private slowest = 0;
  private slowestAt = '';
  private over = 0;
  private frames = 0;
  private times: CallTimes | null = null;

  /** Times `model.animate` from now on; with `plantAt`, the canary: that call of it made `CANARY_SPIN` ms slower. */
  constructor(model: Model, plantAt?: number) {
    this.unplant = plantAt === undefined ? () => {} : plantSpin(model, plantAt);
    this.timing = timeCalls(model, 'animate');
  }

  /** The frame just run, `at` naming it. */
  observe(at: string): void {
    const took = this.timing.lap();
    this.frames++;
    if (took > POSE_MOST) this.over++;
    if (took <= this.slowest) return;
    this.slowest = took;
    this.slowestAt = at;
  }

  /** Puts `animate` back as it was. */
  stop(): void {
    this.times = this.timing.stop();
    this.unplant();
  }

  /** whether a frame's pose took longer than `POSE_MOST` */
  tooSlow(): boolean {
    return this.over > 0;
  }

  /** the slowest frame's pose, in words */
  describe(): string {
    const over = this.over ? `, over ${POSE_MOST} ms on ${this.over} of ${this.frames} frames` : '';
    const times = this.times;
    const typical = times ? `, ${times.median.toFixed(2)} at the median, ${times.p90.toFixed(2)} at p90` : '';
    return `the pose at most ${this.slowest.toFixed(1)} ms a frame (frame ${this.slowestAt})${typical}${over}`;
  }
}

/** The canary: `model.animate`'s call number `call` (from 0) made `CANARY_SPIN` ms slower. Returns its undoing. */
function plantSpin(model: Model, call: number): () => void {
  const original = model.animate;
  const now = window.__labClock.realNow;
  let calls = 0;
  model.animate = (state) => {
    original(state);
    if (calls++ !== call) return;
    const until = now() + CANARY_SPIN;
    while (now() < until) {
      // (spun, as a slow pose holds the main thread)
    }
  };
  return () => {
    model.animate = original;
  };
}
