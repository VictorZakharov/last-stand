// How a hero's body moves over the ground: as a body moves itself, by pushing against the ground with its feet. Its
// velocity eases towards the one the controls ask for, but changes no faster than the feet can push it on (`PUSH`) or
// brake and turn it (`BRAKE`). Eased alone, the game reversed a run in four frames, which no legs can follow: a locked
// stride was left behind and the hips went 20 to 26 degrees past their ranges, or a foot stepped out of turn and the
// legs galloped. The leg IK plans its strides by the same motion (`predictMotion`).

/** how quickly the velocity eases towards the one asked for (1/s) */
const EASE = 9;
/** the most the feet can speed the body up by along the way it goes (m/s²: a sprinter's start is 8 to 10) */
export const PUSH = 8;
/** the most they can slow it, or turn it across the way it goes (m/s²: a planted, braking foot's) */
export const BRAKE = 12;
/** the step the prediction moves on by (s: the game's own frame) */
const PREDICT_STEP = 1 / 60;

/** A velocity, or a place, over the ground. */
export interface Flat {
  x: number;
  z: number;
}

const clamp = (value: number, least: number, most: number) => Math.max(least, Math.min(most, value));

/** Moves velocity `v` on by `dt` (s) towards `goal`, as the feet can push it (in place). */
export function stepVelocity(v: Flat, goal: Flat, dt: number): void {
  const k = 1 - Math.exp(-EASE * dt);
  let dx = (goal.x - v.x) * k, dz = (goal.z - v.z) * k;
  const speed = Math.hypot(v.x, v.z);
  if (speed > 1e-3) {
    // (along the way it goes, pushed on or braked; across it, turned as a braking foot turns it)
    const ux = v.x / speed, uz = v.z / speed;
    const along = clamp(dx * ux + dz * uz, -BRAKE * dt, PUSH * dt);
    const across = clamp(dz * ux - dx * uz, -BRAKE * dt, BRAKE * dt);
    dx = along * ux - across * uz;
    dz = along * uz + across * ux;
  } else {
    const change = Math.hypot(dx, dz), most = PUSH * dt;
    if (change > most) {
      dx *= most / change;
      dz *= most / change;
    }
  }
  v.x += dx;
  v.z += dz;
}

/** Where a body moving at `v` and steered towards `goal` will be after `time` (s), from where it is now, and its
 *  velocity then (`out`), moved on a frame at a time as the game moves it. */
export function predictMotion(v: Flat, goal: Flat, time: number, out: { at: Flat; v: Flat }): void {
  out.at.x = 0;
  out.at.z = 0;
  out.v.x = v.x;
  out.v.z = v.z;
  let left = Math.max(0, time);
  while (left > 1e-6) {
    const dt = Math.min(PREDICT_STEP, left);
    stepVelocity(out.v, goal, dt);
    out.at.x += out.v.x * dt;
    out.at.z += out.v.z * dt;
    left -= dt;
  }
}

/** How long a body moving at `v` and steered towards `goal` takes to slow to `speed` (m/s), and where it is then from
 *  where it is now (`at`); `most` (s) if it never does that soon. */
export function timeToSlow(v: Flat, goal: Flat, speed: number, most: number, at: Flat): number {
  const now = { x: v.x, z: v.z };
  at.x = 0;
  at.z = 0;
  let time = 0;
  while (time < most && Math.hypot(now.x, now.z) > speed) {
    stepVelocity(now, goal, PREDICT_STEP);
    at.x += now.x * PREDICT_STEP;
    at.z += now.z * PREDICT_STEP;
    time += PREDICT_STEP;
  }
  return Math.min(time, most);
}
