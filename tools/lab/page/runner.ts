// A runner's form, for `lab form` to judge the hero's run against: how a person runs at a speed, as the studies of
// running measure it, at a man's size (legs 0.9 m long, hip to ankle). Timing and stride after Dorn, Schache and
// Pandy (2012, J Exp Biol: 3.5 to 9 m/s) and Weyand et al. (2000); the joints' curves over the stride after
// Novacheck (1998, Gait & Posture: the review of running's joint curves), Fukuchi et al. (2017, PeerJ: 2.5 to 4.5
// m/s) and Hinrichs (1987: the arms), as their mean curves read; the bounce after Cavagna et al. (1988). Every value is
// an approximate mean, a person's range round it a few degrees either way: what a run is judged by is where it lies
// far outside those (a knee held bent through the push off, arms held still, a cadence a sprinter's at a jog's pace).
import { curve, type Keys } from '../../../src/entities/models/motion';

/** A man's leg, hip to ankle (m): the studies' runners, against whom a hero's speed and lengths are scaled. */
export const MAN_LEG = 0.9;

/** The joints the form follows over a stride, by the leg's own cycle from its foot's touchdown. */
export type LegCurve = 'thigh' | 'knee' | 'ankle';

/** A runner at one speed: the stride's timing and the joints' curves over it. */
export interface RunnerForm {
  /** the speed (m/s, a man's) */
  speed: number;
  /** steps a second (both feet), a step's length (m), each foot's time on the ground (s) */
  cadence: number;
  step: number;
  contact: number;
  /** each foot's share of its cycle on the ground, and the time neither is down a step (s) */
  duty: number;
  flight: number;
  /** how far the hips rise and fall a step (m) */
  bounce: number;
  /** the trunk's lean forward from upright (deg): the hips to the base of the neck */
  lean: number;
  /** each arm's swing at the shoulder, the upper arm against the trunk (deg, forward positive): its most forward and
   *  its most back; and the elbow's bend (deg, straight 0) at the swing's back and front */
  armForward: number;
  armBack: number;
  elbowBack: number;
  elbowFront: number;
  /** a joint's angle (deg) at `u`, the leg's cycle from its foot's touchdown (0) round to the next (1) */
  leg(joint: LegCurve, u: number): number;
}

/** A value of a table by speed, read between its rows (held at its ends). */
type BySpeed = readonly (readonly [number, number])[];

/** steps a second, by speed (m/s): Dorn et al., 2012 */
const CADENCE: BySpeed = [[3.5, 2.73], [5.2, 2.92], [7, 3.21], [9, 3.84]];
/** a foot's time on the ground (s), by speed */
const CONTACT: BySpeed = [[3.5, 0.26], [5.2, 0.19], [7, 0.155], [9, 0.12]];
/** the hips' rise and fall a step (m), by speed: Cavagna et al., 1988 */
const BOUNCE: BySpeed = [[3.5, 0.08], [5.2, 0.068], [7, 0.055], [9, 0.045]];
/** the trunk's lean forward (deg), by speed */
const LEAN: BySpeed = [[3.5, 6], [5.2, 9], [7, 12], [9, 15]];
/** the arm's swing at the shoulder, forward and back (deg), and the elbow's bend at the back and the front, by speed */
const ARM_FORWARD: BySpeed = [[3.5, 15], [5.2, 25], [7, 38], [9, 55]];
const ARM_BACK: BySpeed = [[3.5, -35], [5.2, -45], [7, -55], [9, -65]];
const ELBOW_BACK: BySpeed = [[3.5, 75], [5.2, 70], [7, 65], [9, 60]];
const ELBOW_FRONT: BySpeed = [[3.5, 100], [5.2, 105], [7, 110], [9, 115]];

/** The value of a table at `speed`, linear between its rows. */
function bySpeed(table: BySpeed, speed: number): number {
  if (speed <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    const [s1, v1] = table[i];
    if (speed <= s1) {
      const [s0, v0] = table[i - 1];
      return v0 + (v1 - v0) * (speed - s0) / (s1 - s0);
    }
  }
  return table[table.length - 1][1];
}

/** A joint's curve over the stance (its touchdown 0, its foot leaving 1) and over the swing (leaving 0, landing 1). */
interface Phased {
  stance: Keys;
  swing: Keys;
}

/** The leg's joints at a jog (3.5 m/s) and a fast run (6.5 m/s), deg. The thigh: its line from the hip to the knee
 *  against straight down, forward positive. The knee: its bend, straight 0. The ankle: the foot against square to the
 *  shin, toes up positive. */
const JOG: Record<LegCurve, Phased> = {
  thigh: {
    stance: [[0, 22], [0.5, 2], [1, -22]],
    swing: [[0, -22], [0.1, -24], [0.4, 0], [0.72, 30], [0.86, 34], [1, 22]],
  },
  knee: {
    stance: [[0, 18], [0.4, 42], [1, 18]],
    swing: [[0, 18], [0.2, 50], [0.45, 92], [0.7, 70], [0.88, 25], [1, 18]],
  },
  ankle: {
    stance: [[0, 3], [0.45, 18], [1, -20]],
    swing: [[0, -20], [0.25, -10], [0.6, 3], [1, 3]],
  },
};
const FAST: Record<LegCurve, Phased> = {
  thigh: {
    stance: [[0, 28], [0.5, 5], [1, -27]],
    swing: [[0, -27], [0.08, -29], [0.35, 0], [0.65, 42], [0.82, 50], [1, 28]],
  },
  knee: {
    stance: [[0, 20], [0.4, 45], [1, 22]],
    swing: [[0, 22], [0.2, 70], [0.42, 120], [0.65, 95], [0.85, 40], [0.95, 22], [1, 20]],
  },
  ankle: {
    stance: [[0, 0], [0.45, 18], [1, -25]],
    swing: [[0, -25], [0.25, -12], [0.6, 2], [1, 2]],
  },
};
const JOG_SPEED = 3.5;
const FAST_SPEED = 6.5;

/** A joint's curve read at `u` of the cycle, its stance ending at `duty`. */
function phased(keys: Phased, u: number, duty: number): number {
  const wrapped = ((u % 1) + 1) % 1;
  if (wrapped < duty) return curve(keys.stance, wrapped / duty);
  return curve(keys.swing, (wrapped - duty) / (1 - duty));
}

/** A runner's form at `speed` (m/s, a man's). */
export function runnerAt(speed: number): RunnerForm {
  const cadence = bySpeed(CADENCE, speed);
  const contact = bySpeed(CONTACT, speed);
  const duty = contact * cadence / 2;
  const between = Math.min(1, Math.max(0, (speed - JOG_SPEED) / (FAST_SPEED - JOG_SPEED)));
  return {
    speed,
    cadence,
    step: speed / cadence,
    contact,
    duty,
    flight: Math.max(0, 1 / cadence - contact),
    bounce: bySpeed(BOUNCE, speed),
    lean: bySpeed(LEAN, speed),
    armForward: bySpeed(ARM_FORWARD, speed),
    armBack: bySpeed(ARM_BACK, speed),
    elbowBack: bySpeed(ELBOW_BACK, speed),
    elbowFront: bySpeed(ELBOW_FRONT, speed),
    leg(joint, u) {
      const jog = phased(JOG[joint], u, duty);
      const fast = phased(FAST[joint], u, duty);
      return jog + (fast - jog) * between;
    },
  };
}

/** Where in its own cycle an arm is when its opposite leg is at `u` of its cycle: an arm is furthest forward as the
 *  other side's thigh is (late in that leg's swing), a little after it. */
const ARM_LAG = 0.04;

/**
 * An arm's swing at `u` of the opposite leg's cycle, for `form`: its upper arm against the trunk and its elbow's bend
 * (deg), each between its back and front as that leg's thigh is between its back and front.
 */
export function armAt(form: RunnerForm, u: number): { shoulder: number; elbow: number } {
  const thigh = form.leg('thigh', u - ARM_LAG);
  const front = form.leg('thigh', thighPeak(form));
  const back = form.leg('thigh', form.duty);
  const share = (thigh - back) / Math.max(1e-6, front - back);
  return {
    shoulder: form.armBack + (form.armForward - form.armBack) * share,
    elbow: form.elbowBack + (form.elbowFront - form.elbowBack) * share,
  };
}

/** Where the thigh is furthest forward in its cycle. */
function thighPeak(form: RunnerForm): number {
  let best = 0;
  let most = -Infinity;
  for (let i = 0; i < 100; i++) {
    const u = i / 100;
    const thigh = form.leg('thigh', u);
    if (thigh > most) {
      most = thigh;
      best = u;
    }
  }
  return best;
}
