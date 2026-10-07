// `lab gait`: the hero's walk judged as a person's, over level ground and the dais's steps, nothing drawn, drawn and
// changing direction: how much of the time each foot is on the ground, both or neither; the steps a second and their
// length against the ground covered; the hops (both feet leaving or landing together); a foot dance's short steps; how
// far the hips rise and fall, and whether they are highest where a walk's or a run's are; and the jerks (the hips' and
// the ankles' sudden changes of speed). Each scenario is filmed from the side round its first hop (else its middle), a
// picture every few frames, so the motion is seen as well as measured: measured first, then run again to picture
// only the frames the film takes (a picture every few frames throughout, kept in a ring, took the browser down). What
// a person wouldn't do is said as such.
import * as THREE from 'three';
import type { Lab, Pictured, ViewName } from './lab';
import type { LegIK } from '../../../src/entities/models/ik';
import { groundHeight } from '../../../src/world/ground';

/** One leg of a scenario: the keys held, the attack (held, tapped or not), for how many frames. */
interface GaitLeg {
  keys: string[];
  attack: boolean | 'taps';
  frames: number;
}

/** A walk to judge: where it starts, the point a drawn shot aims at, its legs, and the view it is filmed from. */
interface GaitScenario {
  name: string;
  /** what it is, as the report says it */
  what: string;
  start: [number, number];
  aim: [number, number] | null;
  legs: GaitLeg[];
  film: ViewName;
}

const legOf = (keys: string[], attack: GaitLeg['attack'], frames: number): GaitLeg => ({ keys, attack, frames });

/** a tapped attack: pressed this many frames, then let go this many (a bow's tap looses at its least draw) */
const TAP_DOWN = 6;
const TAP_UP = 12;

/** where the level walks start (open ground), and the point a drawn one aims at (along +z) */
const LEVEL: [number, number] = [14, 17];
const LEVEL_AIM: [number, number] = [14, 40];
/** where the walks over the steps start (on the dais, near its middle), and the point a drawn one aims at */
const DAIS: [number, number] = [1.5, 0.3];
const DAIS_AIM: [number, number] = [1.5, 25];

/** the direction changes of a walk that changes it often: left, right, back and forth, and the diagonals */
const ZIGZAG = [['a'], ['d'], ['w'], ['a'], ['s'], ['d'], ['a', 'w'], ['d', 's'], ['a'], ['d', 'w'], ['s'], ['a', 's']];

const SCENARIOS: GaitScenario[] = [
  {
    name: 'walk',
    what: 'level ground, nothing drawn',
    start: LEVEL,
    aim: null,
    legs: [legOf(['d'], false, 100), legOf(['a'], false, 100)],
    film: 'left',
  },
  {
    name: 'drawn',
    what: 'level ground, strafing drawn',
    start: LEVEL,
    aim: LEVEL_AIM,
    legs: [legOf(['a'], true, 120), legOf(['d'], true, 120)],
    film: 'front',
  },
  {
    name: 'taps',
    what: 'level ground, strafing and tapping attacks',
    start: LEVEL,
    aim: LEVEL_AIM,
    legs: [legOf(['a'], 'taps', 120), legOf(['d'], 'taps', 120)],
    film: 'front',
  },
  {
    name: 'zigzag',
    what: 'level ground, drawn, changing direction every third of a second',
    start: LEVEL,
    aim: LEVEL_AIM,
    legs: ZIGZAG.map((keys) => legOf(keys, true, 20)),
    film: 'front',
  },
  {
    name: 'stairs',
    what: 'off the dais down its step and back up, nothing drawn',
    start: DAIS,
    aim: null,
    legs: [legOf(['d'], false, 80), legOf(['a'], false, 80)],
    film: 'left',
  },
  {
    name: 'stairsDrawn',
    what: 'off the dais down its step and back up, strafing drawn',
    start: DAIS,
    aim: DAIS_AIM,
    legs: [legOf(['d'], true, 150), legOf(['a'], true, 150)],
    film: 'front',
  },
];

/** The scenarios `lab gait` can run, by name. */
export const GAIT_SCENARIOS = SCENARIOS.map((scenario) => scenario.name);

/** What `lab gait` is asked for. */
export interface GaitOptions {
  /** the scenarios to run (all when empty) */
  scenarios?: string[];
  /** list every step: its foot, when it left and landed, how far it went, and the hops */
  frames?: boolean;
}

/** a body going slower than this is standing (m/s) */
const MOVING_SPEED = 0.5;
/** both feet leaving or landing within this many frames of each other is a hop (a run's alternate half a cycle
 *  apart) */
const HOP_GAP = 4;
/** a step shorter than this is a foot dance's (m) */
const SHORT_STEP = 0.15;
/** a person walks up to about this speed, with a foot always on the ground (m/s); above it, a person runs */
const WALK_MOST = 2.2;
/** under this much rise and fall of the hips a step (m), the body is carried along rather than walked */
const BOB_LEAST = 0.015;
/** the hips changing speed more than this in a frame jerk (m/s: a run's push off the ground and its landing change
 *  them by about 0.3) */
const HIPS_JERK = 0.6;
/** an ankle in the air changing speed more than this in a frame jerks (m/s: a swing's take-off and landing, and its
 *  turn forward, change it by up to about 1.5) */
const ANKLE_JERK = 2.5;
/** the film: a picture every this many frames, this many of them, this many of them before the first hop */
const FILM_EVERY = 3;
const FILM_LENGTH = 8;
const FILM_BEFORE = 4;
/** with no hop, the film starts this many frames into the scenario */
const FILM_FROM = 45;

/** A foot's step: when it left the ground and landed, how far it went, and the swing the gait planned for it as it
 *  left (frames: the cycle's share in the air). */
interface Step {
  foot: number;
  left: number;
  landed: number;
  length: number;
  planned: number;
  /** how it left: in its window, or early (`f.over`, the body leaving it out of reach) */
  how: string;
}

/** The hips' height over the ground, summed by what the feet were doing. */
interface HeightBySupport {
  sum: number;
  frames: number;
}

/** What one scenario found. */
interface GaitRun {
  frames: number;
  moving: number;
  covered: number;
  planted: [number, number];
  bothDown: number;
  bothUp: number;
  steps: Step[];
  hops: string[];
  shortSteps: number;
  bobs: number[];
  heights: Record<'flight' | 'single' | 'double', HeightBySupport>;
  jerks: number;
  worstJerk: number;
  worstJerkAt: string;
  plannedDuty: number;
  /** the frames a hop happened on */
  hopFrames: number[];
  /** each jerk: its frame, the point and the change */
  jerkList: string[];
}

/** The film to take: from which frame, what it is round, and its pictures so far. */
interface Film {
  from: number;
  about: string;
  shots: { frame: number; tiles: Pictured['tiles']; feet: string }[];
}

/** What `lab gait` found: its lines and its films. */
export interface GaitReport {
  lines: string[];
  moments: Pictured[];
}

const cm = (metres: number) => (metres * 100).toFixed(1);
const degreesOf = (radians: number) => ((radians * 180) / Math.PI).toFixed(0);
const share = (count: number, of: number) => `${of ? Math.round((100 * count) / of) : 0}%`;
const SIDES = ['L', 'R'] as const;

/** Whether the attack is down on this frame of a leg. */
function attackDown(leg: GaitLeg, frame: number): boolean {
  if (leg.attack !== 'taps') return leg.attack;
  return frame % (TAP_DOWN + TAP_UP) < TAP_DOWN;
}

/** The leg IK's plan for this frame, as it keeps it: the share of the cycle a foot is down, and the cycle (s). */
function planOf(legs: LegIK): { duty: number; cycle: number } {
  const frame = (legs as unknown as { frame?: { duty?: number; cycle?: number } }).frame;
  return { duty: frame?.duty ?? 0, cycle: frame?.cycle ?? 0 };
}

/** The frames of a swing the gait plans now. */
function plannedSwing(legs: LegIK, seconds: number): number {
  const plan = planOf(legs);
  return ((1 - plan.duty) * plan.cycle) / seconds;
}

/** Each foot on the ground (planted) or not, as the leg IK has it, for a film's note. */
function feetNow(legs: LegIK): string {
  return legs.feet.map((foot, side) => `${SIDES[side]}${foot.state === 'plant' ? '_' : '^'}`).join('');
}

/** Follows each foot's take-offs and landings into the run's steps, hops and short steps. */
class StepWatch {
  private wasDown: boolean[];
  private leftAt = [-1, -1];
  private landedAt = [-1, -1];
  private leftFrom = [new THREE.Vector3(), new THREE.Vector3()];
  private planned = [0, 0];
  private how = ['', ''];
  /** each foot's time down as it was last frame (a swing's first frame clears it) */
  private stanceBefore = [0, 0];

  constructor(legs: LegIK) {
    this.wasDown = legs.feet.map((foot) => foot.state === 'plant');
  }

  /** This frame's feet: a hop is a take-off or a landing within `HOP_GAP` of the other foot's, both in the air
   *  between. Returns whether one happened. */
  observe(frame: number, legs: LegIK, ankles: THREE.Vector3[], seconds: number, run: GaitRun): boolean {
    let hopped = false;
    legs.feet.forEach((foot, side) => {
      const down = foot.state === 'plant';
      const other = 1 - side;
      const otherDown = legs.feet[other].state === 'plant';
      if (this.wasDown[side] && !down) {
        this.leftAt[side] = frame;
        this.leftFrom[side].copy(ankles[side]);
        this.planned[side] = plannedSwing(legs, seconds);
        const why = (foot as { leftFor?: string }).leftFor ?? '';
        const down = `after ${this.stanceBefore[side].toFixed(2)} s down`;
        // (with the IK's own notes, where it keeps them: an A/B's older side may not)
        const window = (foot as { window?: number }).window;
        const at = window === undefined ? '' : ` at ${window.toFixed(2)} of its window`;
        this.how[side] = `${foot.state}${at}, ${down}${why ? `, ${why}` : ''}`;
        if (!otherDown && frame - this.leftAt[other] <= HOP_GAP) {
          run.hops.push(`frame ${frame}: both feet left the ground together`);
          run.hopFrames.push(frame);
          hopped = true;
        }
      }
      if (!this.wasDown[side] && down && this.leftAt[side] >= 0) {
        const length = Math.hypot(ankles[side].x - this.leftFrom[side].x, ankles[side].z - this.leftFrom[side].z);
        const step = { foot: side, left: this.leftAt[side], landed: frame, length };
        run.steps.push({ ...step, planned: this.planned[side], how: this.how[side] });
        if (length < SHORT_STEP) run.shortSteps++;
        if (otherDown && frame - this.landedAt[other] <= HOP_GAP && this.leftAt[other] > this.landedAt[side]) {
          run.hops.push(`frame ${frame}: both feet landed together`);
          run.hopFrames.push(frame);
          hopped = true;
        }
        this.landedAt[side] = frame;
      }
      this.wasDown[side] = down;
      this.stanceBefore[side] = foot.stance;
    });
    return hopped;
  }
}

/** A point the jerks are watched at: its name, where it is now, and whether it counts this frame (an ankle only in
 *  the air: a landing stops it dead, as it should). */
interface Watched {
  name: string;
  at: THREE.Vector3;
  counts: boolean;
  jerk: number;
}

/** Follows the hips' and each ankle's speed for the jerks: a change of speed in a frame past the point's `jerk`,
 *  over frames it counted on and the one before. */
class JerkWatch {
  private last = new Map<string, THREE.Vector3>();
  private speed = new Map<string, THREE.Vector3 | null>();

  observe(frame: number, points: Watched[], seconds: number, run: GaitRun): void {
    for (const point of points) {
      const last = this.last.get(point.name);
      this.last.set(point.name, point.at.clone());
      if (!last || !point.counts) {
        this.speed.set(point.name, null);
        continue;
      }
      const speed = point.at.clone().sub(last).divideScalar(seconds);
      const before = this.speed.get(point.name);
      this.speed.set(point.name, speed);
      if (!before) continue;
      const change = speed.distanceTo(before);
      if (change > point.jerk) {
        run.jerks++;
        const turned = before.length() > 0.1 && speed.length() > 0.1 ? before.angleTo(speed) : 0;
        const how = `${before.length().toFixed(1)} to ${speed.length().toFixed(1)} m/s, turned ${degreesOf(turned)}°`;
        run.jerkList.push(`frame ${frame}, ${point.name}: ${change.toFixed(1)} m/s (${how})`);
      }
      if (change <= run.worstJerk) continue;
      run.worstJerk = change;
      run.worstJerkAt = `frame ${frame}, ${point.name}`;
    }
  }
}

/** The film of a scenario its first run found `hops` in: round the first, else from `FILM_FROM`. */
function filmFor(hops: number[]): Film {
  if (!hops.length) return { from: FILM_FROM, about: 'steady', shots: [] };
  const from = Math.max(0, hops[0] - FILM_BEFORE * FILM_EVERY);
  return { from, about: `round the first hop (frame ${hops[0]})`, shots: [] };
}

/** Pictures this frame if the film takes it: every `FILM_EVERY` frames from its start, `FILM_LENGTH` of them. */
function filmShot(lab: Lab, scenario: GaitScenario, film: Film, frame: number, legs: LegIK): void {
  const into = frame - film.from;
  if (into < 0 || into % FILM_EVERY !== 0 || film.shots.length >= FILM_LENGTH) return;
  film.shots.push({ frame, tiles: lab.picture('', [scenario.film]).tiles, feet: feetNow(legs) });
}

/** The hips' rise and fall over each step: the highest less the lowest between one landing and the next. */
function bobOfSteps(heights: number[], steps: Step[]): number[] {
  const landings = steps.map((step) => step.landed).sort((a, b) => a - b);
  const bobs: number[] = [];
  for (let i = 1; i < landings.length; i++) {
    const over = heights.slice(landings[i - 1], landings[i] + 1).filter((height) => !Number.isNaN(height));
    if (over.length > 2) bobs.push(Math.max(...over) - Math.min(...over));
  }
  return bobs;
}

/** Runs one scenario, set up afresh, and measures its walk, picturing the frames `film` takes, if any. */
async function runScenario(lab: Lab, scenario: GaitScenario, film: Film | null): Promise<GaitRun> {
  const facing = scenario.aim ? 0 : Math.PI / 2;
  await lab.setup({ at: scenario.start, facing, nocked: Boolean(lab.player.cls.quiver) });
  const legs = lab.model.root.userData.legs as LegIK | undefined;
  if (!legs) throw new Error(`lab: gait: the ${lab.player.cls.id} has no leg IK`);
  const seconds = window.__labClock.frame / 1000;
  const run: GaitRun = {
    frames: 0,
    moving: 0,
    covered: 0,
    planted: [0, 0],
    bothDown: 0,
    bothUp: 0,
    steps: [],
    hops: [],
    shortSteps: 0,
    bobs: [],
    heights: { flight: { sum: 0, frames: 0 }, single: { sum: 0, frames: 0 }, double: { sum: 0, frames: 0 } },
    jerks: 0,
    worstJerk: 0,
    worstJerkAt: '',
    plannedDuty: 0,
    hopFrames: [],
    jerkList: [],
  };
  const steps = new StepWatch(legs);
  const jerks = new JerkWatch();
  const heights: number[] = [];
  const lastAt = new THREE.Vector3(lab.player.pos.x, 0, lab.player.pos.z);
  const aim = scenario.aim ? new THREE.Vector3(scenario.aim[0], 0, scenario.aim[1]) : undefined;
  const measure = () => {
    const frame = run.frames++;
    const at = new THREE.Vector3(lab.player.pos.x, 0, lab.player.pos.z);
    const moved = at.distanceTo(lastAt);
    lastAt.copy(at);
    const ankles = [lab.joints.ankleL, lab.joints.ankleR].map((ankle) => ankle.getWorldPosition(new THREE.Vector3()));
    const hips = lab.joints.hips.getWorldPosition(new THREE.Vector3());
    steps.observe(frame, legs, ankles, seconds, run);
    if (film) filmShot(lab, scenario, film, frame, legs);
    const moving = moved / seconds > MOVING_SPEED;
    heights.push(moving ? hips.y - groundHeight(hips.x, hips.z) : NaN);
    if (!moving) return;
    run.moving++;
    run.covered += moved;
    run.plannedDuty += planOf(legs).duty;
    const down = legs.feet.map((foot) => foot.state === 'plant');
    down.forEach((isDown, side) => {
      if (isDown) run.planted[side]++;
    });
    const support = down[0] && down[1] ? 'double' : down[0] || down[1] ? 'single' : 'flight';
    if (support === 'double') run.bothDown++;
    if (support === 'flight') run.bothUp++;
    run.heights[support].sum += heights[frame];
    run.heights[support].frames++;
    const watched: Watched[] = SIDES.map((name, side) => ({
      name: `ankle ${name}`,
      at: ankles[side],
      counts: !down[side],
      jerk: ANKLE_JERK,
    }));
    watched.push({ name: 'hips', at: hips, counts: true, jerk: HIPS_JERK });
    jerks.observe(frame, watched, seconds, run);
  };
  for (const leg of scenario.legs) {
    await lab.step(leg.frames, (f) => ({ keys: leg.keys, m0: attackDown(leg, f), aim }), measure);
  }
  run.bobs = bobOfSteps(heights, run.steps);
  return run;
}

/** The hips' mean height over the ground with the feet as `support` has them, or nothing if never so. */
function meanHeight(run: GaitRun, support: keyof GaitRun['heights']): number | null {
  const kept = run.heights[support];
  return kept.frames ? kept.sum / kept.frames : null;
}

/** What a person wouldn't do in this walk. */
function unlikeAPerson(run: GaitRun, speed: number): string[] {
  const found: string[] = [];
  if (run.hops.length) found.push(`${run.hops.length} hops: both feet leaving or landing together`);
  if (speed < WALK_MOST && run.bothUp > 0.05 * run.moving) {
    found.push(`both feet in the air ${share(run.bothUp, run.moving)} of the time at a walk's speed`);
  }
  const bob = median(run.bobs);
  if (bob < BOB_LEAST) found.push(`the hips rise and fall ${cm(bob)} cm a step: carried along, not walked`);
  const flight = meanHeight(run, 'flight');
  const single = meanHeight(run, 'single');
  if (run.bothUp > 0.1 * run.moving && flight !== null && single !== null && flight <= single) {
    found.push('the hips no higher in the air than on one foot: a run hung from a string, not pushed off the ground');
  }
  if (run.shortSteps) found.push(`${run.shortSteps} steps under ${cm(SHORT_STEP)} cm: a foot dance`);
  if (run.jerks) found.push(`${run.jerks} jerks: a sudden change of speed in a frame`);
  return found;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/** The report's lines for one scenario. */
function describeRun(scenario: GaitScenario, run: GaitRun, seconds: number, listSteps: boolean): string[] {
  const time = run.moving * seconds;
  const speed = time ? run.covered / time : 0;
  const steps = run.steps.length;
  const lines = [`${scenario.what}: ${run.frames} frames, ${run.moving} moving at ${speed.toFixed(2)} m/s`];
  lines.push(
    `  on the ground: L ${share(run.planted[0], run.moving)}, R ${share(run.planted[1], run.moving)}`
      + ` (the plan ${(run.moving ? run.plannedDuty / run.moving : 0).toFixed(2)} of a cycle each);`
      + ` both ${share(run.bothDown, run.moving)}, neither ${share(run.bothUp, run.moving)}`,
  );
  const cadence = time ? steps / time : 0;
  const stepLength = steps ? run.covered / steps : 0;
  lines.push(`  ${cadence.toFixed(2)} steps a second, ${cm(stepLength)} cm of ground a step; ${steps} steps`);
  const flight = meanHeight(run, 'flight');
  const single = meanHeight(run, 'single');
  const double = meanHeight(run, 'double');
  const heightOf = (height: number | null) => (height === null ? '-' : cm(height));
  lines.push(
    `  the hips rise and fall ${cm(median(run.bobs))} cm a step (the median); over the ground, in the air`
      + ` ${heightOf(flight)} cm, on one foot ${heightOf(single)}, on both ${heightOf(double)}`,
  );
  lines.push(`  the worst jerk ${run.worstJerk.toFixed(2)} m/s in a frame (${run.worstJerkAt || 'none'})`);
  const unlike = unlikeAPerson(run, speed);
  lines.push(unlike.length ? `  unlike a person: ${unlike.join('; ')}` : '  as a person walks');
  if (listSteps) {
    for (const step of run.steps) {
      const swing = `${step.landed - step.left} frames in the air (the plan ${step.planned.toFixed(0)})`;
      const what = `${SIDES[step.foot]} left at ${step.left} (${step.how}), landed at ${step.landed}`;
      lines.push(`    step ${what}: ${swing}, ${cm(step.length)} cm`);
    }
    lines.push(...run.hops.map((hop) => `    ${hop}`));
    lines.push(...run.jerkList.map((jerk) => `    jerk ${jerk}`));
  }
  return lines;
}

/** The film as one moment: its pictures left to right, each frame's feet beside it (`_` down, `^` in the air). */
function filmMoment(scenario: GaitScenario, film: Film): Pictured | null {
  if (!film.shots.length) return null;
  const feet = film.shots.map((shot) => `${shot.frame} ${shot.feet}`).join(', ');
  return {
    label: `${scenario.what}, ${film.about}`,
    tiles: film.shots.flatMap((shot) => shot.tiles),
    notes: [`every ${FILM_EVERY} frames, left to right: ${feet}`],
  };
}

/**
 * Runs the scenarios asked for, one after another (each set up afresh where it starts), and judges each walk as a
 * person's, with its film.
 */
export async function gait(lab: Lab, options: GaitOptions): Promise<GaitReport> {
  const asked = options.scenarios?.length ? options.scenarios : GAIT_SCENARIOS;
  const report: GaitReport = { lines: [], moments: [] };
  const seconds = window.__labClock.frame / 1000;
  for (const scenario of SCENARIOS.filter((candidate) => asked.includes(candidate.name))) {
    const run = await runScenario(lab, scenario, null);
    report.lines.push(...describeRun(scenario, run, seconds, Boolean(options.frames)));
    const film = filmFor(run.hopFrames);
    await runScenario(lab, scenario, film);
    const moment = filmMoment(scenario, film);
    if (moment) report.moments.push(moment);
  }
  report.lines.push(
    'a person: walks to about 2 m/s with a foot always down and both down 15 to 25% of the time, the hips highest on'
      + ' one foot; runs above, 20 to 35% in the air, the hips 5 to 9 cm up and down and highest in the air',
  );
  return report;
}
