// The game's frame clock, where three's `Timer` stood: told each frame's time, it gives the time since the frame
// before.

/** A frame clock: `update` once a frame with its time, then `getDelta` for the seconds since the last update. */
export class FrameClock {
  /** the last update's time (ms), none before the first */
  private last: number | null = null;
  /** the seconds between the last two updates */
  private delta = 0;

  /** The clock moved to `timestamp` (ms, as `requestAnimationFrame` gives it; now where none is given). The first
   *  update's delta is 0. */
  update(timestamp: number = performance.now()): this {
    this.delta = this.last === null ? 0 : (timestamp - this.last) / 1000;
    this.last = timestamp;
    return this;
  }

  /** The seconds between the last two updates. */
  getDelta(): number {
    return this.delta;
  }
}
