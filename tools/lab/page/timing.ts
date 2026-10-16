// What the page's work costs (tools/lab): every call of a method timed by the browser's own clock (the page's
// `performance.now` is the lab's, which stands still within a frame), for a measure of a cost: the coat's drape a
// frame, against main's; the fallen's bodies a frame (`crowd`).

/** A method's calls timed: how many, and their time (ms) in total, at the median and at the 90th percentile. */
export interface CallTimes {
  calls: number;
  total: number;
  median: number;
  p90: number;
}

/** A timing under way: `lap` says what its calls took since the last lap (ms; a frame's, read after each frame), and
 *  `stop` puts the method back and says what its calls took. */
export interface Timing {
  lap(): number;
  stop(): CallTimes;
}

/** the value at share `share` (0..1) of `sorted` (ascending) */
export function quantile(sorted: number[], share: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))];
}

/**
 * Times every call of `owner[method]` (a prototype's, to time every instance) until `stop`. A call made inside
 * another timed call of it counts once, the outer.
 */
export function timeCalls<T extends object>(owner: T, method: keyof T & string): Timing {
  const original = owner[method] as unknown as (...args: unknown[]) => unknown;
  if (typeof original !== 'function') throw new Error(`lab: timing: ${method} is not a method`);
  const now = window.__labClock.realNow;
  const times: number[] = [];
  let sinceLap = 0;
  let depth = 0;
  const timed = function (this: unknown, ...args: unknown[]): unknown {
    if (depth > 0) return original.apply(this, args);
    depth++;
    const start = now();
    try {
      return original.apply(this, args);
    } finally {
      const took = now() - start;
      times.push(took);
      sinceLap += took;
      depth--;
    }
  };
  (owner as Record<string, unknown>)[method] = timed;
  return {
    lap(): number {
      const lapped = sinceLap;
      sinceLap = 0;
      return lapped;
    },
    stop(): CallTimes {
      (owner as Record<string, unknown>)[method] = original;
      const sorted = [...times].sort((a, b) => a - b);
      const total = times.reduce((sum, time) => sum + time, 0);
      return { calls: times.length, total, median: quantile(sorted, 0.5), p90: quantile(sorted, 0.9) };
    },
  };
}
