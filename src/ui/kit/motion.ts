// The kit's animations (#973): the page's CSS transitions and keyframes stepped each frame by the panels that had
// them, on the page's own clock as CSS runs them, and their easing curves. Reduced motion stills them, as each
// stylesheet's `prefers-reduced-motion` rule did.

const still = typeof matchMedia !== 'undefined' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

/** Whether the player asked for reduced motion: each animation goes straight to where it ends. */
export const reducedMotion = (): boolean => !!still?.matches;

/** how far the kit's animations are put ahead of the page's clock (s): `finishMotion` */
let ahead = 0;

/** The page's clock (s), as its CSS animations run on. */
export const now = (): number => performance.now() / 1000 + ahead;

/** Every animation begun so far brought to its end at the next frame, as the page's `animation.finish()` does (the
 *  lab's pictures: none is longer than a minute). */
export function finishMotion(): void {
  ahead += 60;
}

/** How far along an animation of `time` (s) begun at `at` it is now, 0 to 1. */
export const along = (at: number, time: number): number => Math.max(0, Math.min(1, (now() - at) / time));

/** CSS's `cubic-bezier(x1, y1, x2, y2)`: a time's share to its progress. */
export function bezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const at = (a: number, b: number, s: number) => 3 * a * s * (1 - s) ** 2 + 3 * b * s * s * (1 - s) + s ** 3;
  return (t) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    // (the curve's parameter for the time `t`, by halving: 20 steps is under a millionth)
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2;
      if (at(x1, x2, mid) < t) lo = mid;
      else hi = mid;
    }
    return at(y1, y2, (lo + hi) / 2);
  };
}

/** CSS's `ease`, `ease-out` and `ease-in-out`. */
export const ease = bezier(0.25, 0.1, 0.25, 1);
export const easeOut = bezier(0, 0, 0.58, 1);
export const easeInOut = bezier(0.42, 0, 0.58, 1);

/** A value between keyframes: `frames` are [share of the time, value], in order; each step eased by `curve`, as CSS
 *  eases each keyframe's step by the animation's timing function. */
export function keyframed(frames: [number, number][], t: number, curve: (t: number) => number): number {
  if (t <= frames[0][0]) return frames[0][1];
  for (let i = 1; i < frames.length; i++) {
    const [at, value] = frames[i];
    if (t > at) continue;
    const [was, from] = frames[i - 1];
    return from + (value - from) * curve(at === was ? 1 : (t - was) / (at - was));
  }
  return frames[frames.length - 1][1];
}
