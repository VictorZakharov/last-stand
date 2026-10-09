// `lab gait`: the hero's walk judged as a person's, over level ground and the dais's steps, nothing drawn, drawn and
// changing direction: how much of the time each foot is on the ground, both or neither; the steps a second and their
// length against the ground covered; the hops (both feet leaving or landing together); a foot dance's short steps; how
// far the hips rise and fall, and whether they are highest where a walk's or a run's are; and the jerks (the hips' and
// the ankles' sudden changes of speed). Each scenario is filmed from the side round its first hop (else its middle), a
// picture every few frames, so the motion is seen as well as measured: measured first, then run again to picture
// only the frames the film takes (a picture every few frames throughout, kept in a ring, took the browser down). What
// a person wouldn't do is said as such. Each frame is also judged as a body's: whether it could move so, its centre
// of mass with its gear against the push from its planted soles (`balance.ts`), and every joint within its range.
import * as THREE from 'three';
import type { Lab, Pictured, ViewName } from './lab';
import type { LegIK } from '../../../src/entities/models/ik';
import type { Breach } from '../../../src/entities/models/anatomy';
import { groundHeight } from '../../../src/world/ground';
import { G } from '../../../src/state';
import { judgeBalance, sampleOf, type BalanceSample, type Fall, type Unlike } from './balance';
import { buildOf } from './gearWeight';
import { shapesOf } from './soles';
import { bodyBreaches, describeBreach } from './range';

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

/** where the level walks start (open ground: from 14, 17 the walk ran into a prop and the circles into another), and
 *  the point a drawn one aims at (along +z) */
const LEVEL: [number, number] = [14, 14];
const LEVEL_AIM: [number, number] = [14, 40];
/** where the walks over the steps start (on the dais, near its middle), and the point a drawn one aims at */
const DAIS: [number, number] = [1.5, 0.3];
const DAIS_AIM: [number, number] = [1.5, 25];

/** the direction changes of a walk that changes it often: left, right, back and forth, and the diagonals */
const ZIGZAG = [['a'], ['d'], ['w'], ['a'], ['s'], ['d'], ['a', 'w'], ['d', 's'], ['a'], ['d', 'w'], ['s'], ['a', 's']];
/** how long a walk that sets off from standing stands first (frames): the set-up's nock leaves the feet stepping */
const STAND_FRAMES = 30;
/** the eight ways round a circle, clockwise from ahead, as a player rolls the keys to go round one */
const ROUND = [['w'], ['w', 'd'], ['d'], ['d', 's'], ['s'], ['s', 'a'], ['a'], ['a', 'w']];
/** how many frames each way round a circle is held, and how many times it goes round */
const ROUND_FRAMES = 12;
const ROUND_LAPS = 2;

/** The legs of a walk going round a circle `ROUND_LAPS` times, attacking as `attack` says. */
function roundLegs(attack: GaitLeg['attack']): GaitLeg[] {
  const legs: GaitLeg[] = [];
  for (let lap = 0; lap < ROUND_LAPS; lap++) {
    for (const keys of ROUND) legs.push(legOf(keys, attack, ROUND_FRAMES));
  }
  return legs;
}

const SCENARIOS: GaitScenario[] = [
  {
    name: 'walk',
    what: 'level ground, nothing drawn: standing, off at a run, turned round, and stopped',
    start: LEVEL,
    aim: null,
    legs: [legOf([], false, STAND_FRAMES), legOf(['d'], false, 60), legOf(['a'], false, 60), legOf([], false, 45)],
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
    name: 'circle',
    what: 'level ground, nothing drawn, going round in circles',
    start: LEVEL,
    aim: null,
    legs: roundLegs(false),
    film: 'above',
  },
  {
    name: 'circleDrawn',
    what: 'level ground, drawn, going round in circles',
    start: LEVEL,
    aim: LEVEL_AIM,
    legs: roundLegs(true),
    film: 'above',
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
  /** list every frame: the way the body faces and goes, the pelvis, the cycle, and each foot */
  trace?: boolean;
  /** with `trace`, only the frames from the first to the second */
  span?: [number, number];
  /** film each scenario (true by default): each is run again for its film, which a check of the numbers never reads */
  films?: boolean;
  /** how many frames longer each scenario's first move lasts, so every later change of way comes at another point of
   *  a stride (a check runs each scenario so from a few) */
  offset?: number;
}

/** The frames a trace lists, from the first to the last. */
type TraceSpan = [number, number];

/** The frames to trace as the options ask, or none. */
function traceSpanOf(options: GaitOptions): TraceSpan | null {
  if (!options.trace) return null;
  return options.span ?? [0, Infinity];
}

/** a body going slower than this is standing (m/s) */
const MOVING_SPEED = 0.5;
/** both feet leaving or landing within this many frames of each other is a hop (a run's alternate half a cycle
 *  apart) */
const HOP_GAP = 4;
/** a body whose velocity is at least this (m/s) but which moved less than this share of it is held up */
const HELD_UP_SPEED = 1;
const HELD_UP_SHARE = 0.5;
/** a planted foot dragged this many frames running is left behind (a frame's is the leg catching up) */
const DRAG_RUN = 3;
/** a body still this many frames has stopped; a step back against its way after that, more than this, is a step
 *  back under it (m) */
const STOPPED_FRAMES = 2;
const STEP_BACK = 0.05;
/** how far from its window's start a stride may leave and still be in step with the walk cycle (a share of the
 *  window) */
const IN_STEP = 0.25;
/** a step shorter than this is a foot dance's (m) */
const SHORT_STEP = 0.15;
/** a person walks up to about this speed, with a foot always on the ground (m/s); above it, a person runs */
const WALK_MOST = 2.2;
/** under this much rise and fall of the hips a step (m), the body is carried along rather than walked */
const BOB_LEAST = 0.015;
/** the hips' change of speed in a frame changing by more than this jerks (m/s: a run's push off the ground and its
 *  landing change their speed by about 0.3 a frame) */
const HIPS_JERK = 0.4;
/** an ankle in the air's change of speed in a frame changing by more than this jerks (m/s: a smooth swing's changes by
 *  a few tenths a frame, from 0.2 at a walk to 0.4 at a run) */
const ANKLE_JERK = 1.5;
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
  /** where in its window it left (0 its start, 1 its end), where the IK says */
  window?: number;
  /** whether it landed already out of the leg's reach (`f.over`) */
  landedOver: boolean;
  /** where its ankle left and landed */
  from: THREE.Vector3;
  to: THREE.Vector3;
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
  /** the frames traced, each with its line */
  trace: { frame: number; line: string }[];
  /** the frames a planted foot was dragged (its leg short of it even on its toes), each foot's run of them going
   *  on, and the longest; and the frames one was up on its toes, out of a flat foot's reach (a push off) */
  dragged: number;
  dragRun: [number, number];
  longestDrag: number;
  onToes: number;
  /** the frames the body moved well short of its own velocity (held up by something in its way), and the first */
  heldUp: number;
  heldUpAt: string;
  /** each side's hand and knee, how far forward of the hips each frame moving (m, in the hips' frame), and the
   *  frames they were taken on (`ankle` keeps the knee: the name an older report used) */
  swings: { hand: number[]; ankle: number[] }[];
  swingFrames: number[];
  /** each frame's body for the balance, and the frames it couldn't have moved so (`balance.ts`) */
  balance: BalanceSample[];
  falls: Fall[];
  /** the frames a joint was past its range, and the worst of them */
  pastRange: number;
  worstBreach: { breach: Breach; frame: number } | null;
  /** each frame, the way the body last went (x, z) and how many frames it has been still */
  lastWay: (THREE.Vector2 | null)[];
  stillFor: number[];
  /** each frame's feet, as a film's note has them (`_` down, `^` up) */
  feetAt: string[];
}

/** The film to take: from which frame, what it is round, and its pictures so far. */
interface Film {
  from: number;
  about: string;
  shots: { frame: number; tiles: Pictured['tiles']; feet: string }[];
}

/** What `lab gait` found: its lines, its films, and what went wrong with a scenario itself (the command fails). */
export interface GaitReport {
  lines: string[];
  moments: Pictured[];
  problems: string[];
  /** what a person's walk has none of, counted over the scenarios run (a check adds a hero's up over its jobs) */
  counts: Record<string, number>;
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

/** The walk cycle as the leg IK reads it, where it says (an A/B's older side may not). */
function cycleOf(legs: LegIK): { phase: number; rate: number; backing: boolean } | null {
  return (legs as { cycleNow?: { phase: number; rate: number; backing: boolean } }).cycleNow ?? null;
}

/** A foot this frame, for a trace: planted (`_`, with how far its spot is from its hip over the ground, cm, and `!`
 *  out of reach) or in the air (`^`, with its stride's progress), and where it is in its window. */
function traceFoot(lab: Lab, legs: LegIK, side: number, motion: string): string {
  const foot = legs.feet[side];
  const window = (foot as { window?: number }).window;
  const where = window === undefined ? '' : ` w${window.toFixed(2)}`;
  const hip = (side === 0 ? lab.joints.thighL : lab.joints.thighR).getWorldPosition(new THREE.Vector3());
  const fromHip = Math.hypot(foot.P.x - hip.x, foot.P.z - hip.z);
  const planted = `_${cm(fromHip).padStart(5)}${foot.over ? '!' : ' '}`;
  const doing = foot.state === 'plant' ? planted : `^${foot.t.toFixed(2)}`;
  return `${SIDES[side]}${doing.padEnd(8)}${where.padEnd(7)} ${motion}`;
}

/** How an ankle moved this frame, for a trace: its speed (m/s) and how far its way turned from last frame's
 *  (degrees), from where it was the two frames before. */
function ankleMotion(now: THREE.Vector3, last: THREE.Vector3 | undefined, before: THREE.Vector3 | undefined,
  seconds: number): string {
  if (!last) return '';
  const move = now.clone().sub(last);
  const speed = move.length() / seconds;
  const was = before ? last.clone().sub(before) : null;
  const turned = was && was.length() > 1e-4 && move.length() > 1e-4 ? degreesOf(was.angleTo(move)) : '-';
  return `v ${speed.toFixed(1).padStart(4)} ${turned.padStart(3)}°`;
}

/** This frame of a walk, for a trace: the way the body faces and goes, the pelvis (degrees), its speed over the
 *  ground (`speed`, m/s), the cycle's
 *  phase (a share of a cycle) and rate, backing or not, and each foot. */
function traceLine(lab: Lab, frame: number, legs: LegIK, speed: number, motions: string[]): string {
  const velocity = lab.player.vel;
  const going = speed > 0.05 ? degreesOf(Math.atan2(velocity.x, velocity.z)) : '-';
  const facing = degreesOf(lab.player.facing);
  const pelvis = degreesOf(legs.pelvisYaw);
  const way = `faces ${facing.padStart(4)} goes ${going.padStart(4)} at ${speed.toFixed(2)}`;
  const body = `${way} pelvis ${pelvis.padStart(4)}`;
  const cycle = cycleOf(legs);
  const phase = cycle ? (((cycle.phase / (2 * Math.PI)) % 1) + 1) % 1 : NaN;
  const backing = cycle?.backing ? ' back' : '';
  const cycleNote = cycle ? `phase ${phase.toFixed(2)} rate ${cycle.rate.toFixed(1).padStart(5)}${backing}` : '';
  const feet = legs.feet.map((_, side) => traceFoot(lab, legs, side, motions[side])).join(' ');
  const curve = (legs as unknown as { frame?: { curve?: number } }).frame?.curve;
  const curveNote = curve === undefined ? '' : `curve ${curve.toFixed(2).padStart(5)}`;
  const drop = legs.pelvisDrop;
  const gaitSpeed = (legs as unknown as { frame?: { speed?: number } }).frame?.speed ?? NaN;
  const plan = `duty ${planOf(legs).duty.toFixed(2)} at ${gaitSpeed.toFixed(2)}`;
  const dropNote = `drop ${cm(drop.dropped).padStart(4)}/${cm(drop.wanted).padStart(4)} ${plan}`;
  return `    ${String(frame).padStart(3)} ${body} ${curveNote} ${dropNote} ${cycleNote.padEnd(25)} ${feet}`;
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
  private window: (number | undefined)[] = [undefined, undefined];
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
        this.window[side] = window;
        if (!otherDown && frame - this.leftAt[other] <= HOP_GAP) {
          run.hops.push(`frame ${frame}: both feet left the ground together`);
          run.hopFrames.push(frame);
          hopped = true;
        }
      }
      if (!this.wasDown[side] && down && this.leftAt[side] >= 0) {
        const length = Math.hypot(ankles[side].x - this.leftFrom[side].x, ankles[side].z - this.leftFrom[side].z);
        const step = { foot: side, left: this.leftAt[side], landed: frame, length };
        const landedOver = foot.over;
        const how = this.how[side];
        const ends = { from: this.leftFrom[side].clone(), to: ankles[side].clone() };
        run.steps.push({ ...step, ...ends, planned: this.planned[side], how, window: this.window[side], landedOver });
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

/** A watched point's last place, and its last two velocities (m/s, the latest first; none over a frame it didn't
 *  count on). */
interface Followed {
  at: THREE.Vector3;
  speeds: THREE.Vector3[];
}

/** Follows the hips' and each ankle's speed for the jerks: a change of its change of speed in a frame past the point's
 *  `jerk`, over three frames it counted on running. A smooth swing's speed changes steadily, by up to 2 to 3.5 m/s a
 *  frame at a run, its change by a few tenths: counted by the change of speed alone, a run's ordinary swing read as a
 *  hundred jerks a scenario and hid the snaps. */
class JerkWatch {
  private followed = new Map<string, Followed>();

  observe(frame: number, points: Watched[], seconds: number, run: GaitRun): void {
    for (const point of points) {
      const was = this.followed.get(point.name);
      const followed: Followed = { at: point.at.clone(), speeds: [] };
      this.followed.set(point.name, followed);
      if (!was || !point.counts) continue;
      const speed = point.at.clone().sub(was.at).divideScalar(seconds);
      followed.speeds = [speed, ...was.speeds.slice(0, 1)];
      if (followed.speeds.length < 2 || was.speeds.length < 2) continue;
      const [last, before] = was.speeds;
      const change = speed.clone().sub(last).sub(last.clone().sub(before)).length();
      if (change > point.jerk) {
        run.jerks++;
        const speeds = [before, last, speed].map((each) => each.length().toFixed(1)).join(', ');
        const turned = last.length() > 0.1 && speed.length() > 0.1 ? last.angleTo(speed) : 0;
        const how = `${speeds} m/s, turned ${degreesOf(turned)}°`;
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
async function runScenario(
  lab: Lab, scenario: GaitScenario, film: Film | null, trace: TraceSpan | null = null, offset = 0,
): Promise<GaitRun> {
  const facing = scenario.aim ? 0 : Math.PI / 2;
  // (a film looks at the hero, cape and all; the measure's run never does: `Fixture.capes`)
  await lab.setup({ at: scenario.start, facing, nocked: Boolean(lab.player.cls.quiver), capes: film !== null });
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
    trace: [],
    dragged: 0,
    dragRun: [0, 0],
    longestDrag: 0,
    onToes: 0,
    heldUp: 0,
    heldUpAt: '',
    swings: [{ hand: [], ankle: [] }, { hand: [], ankle: [] }],
    swingFrames: [],
    balance: [],
    falls: [],
    pastRange: 0,
    worstBreach: null,
    lastWay: [],
    stillFor: [],
    feetAt: [],
  };
  const shapes = shapesOf(lab, legs, [lab.joints.ankleL, lab.joints.ankleR]);
  const steps = new StepWatch(legs);
  const jerks = new JerkWatch();
  const heights: number[] = [];
  // (each ankle where it was last frame and the frame before, for a trace)
  const anklesWere: THREE.Vector3[] = [];
  const anklesBefore: THREE.Vector3[] = [];
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
    if (trace) {
      const motions = ankles.map((ankle, side) => ankleMotion(ankle, anklesWere[side], anklesBefore[side], seconds));
      const traced = frame >= trace[0] && frame <= trace[1];
      if (traced) run.trace.push({ frame, line: traceLine(lab, frame, legs, moved / seconds, motions) });
      anklesBefore.splice(0, 2, ...anklesWere);
      anklesWere.splice(0, 2, ...ankles);
    }
    followHeldUp(run, lab, frame, moved / seconds);
    followStill(run, lab);
    followBalance(run, lab, legs, shapes);
    followRanges(run, lab, frame);
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
    followReach(run, legs);
    followSwings(run, lab, frame);
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
  for (const leg of lengthened(scenario.legs, offset)) {
    await lab.step(leg.frames, (f) => ({ keys: leg.keys, m0: attackDown(leg, f), aim }), measure);
  }
  run.bobs = bobOfSteps(heights, run.steps);
  run.falls = judgeBalance(run.balance, seconds);
  noteFallsInTrace(run);
  return run;
}

/**
 * A scenario's legs with its first move `offset` frames longer, so every later change of way comes at another point
 * of a stride: run so alone, a frame's change anywhere sent every later stride elsewhere, and a change's gallops came
 * out 2 or 3 either way over a check's gait scenarios by chance. (Stood first instead, nothing changed: the set-off
 * is the same from any moment of the idle.)
 */
function lengthened(legs: GaitLeg[], offset: number): GaitLeg[] {
  const first = legs.findIndex((leg) => leg.keys.length > 0);
  if (offset <= 0 || first < 0) return legs;
  return legs.map((leg, index) => (index === first ? { ...leg, frames: leg.frames + offset } : leg));
}

/** The way the body goes this frame, or the way it last went once it stops, and how long it has been still. */
function followStill(run: GaitRun, lab: Lab): void {
  const velocity = lab.player.vel;
  const speed = Math.hypot(velocity.x, velocity.z);
  const frame = run.stillFor.length;
  const moving = speed > MOVING_SPEED;
  const stillBefore = frame ? run.stillFor[frame - 1] : 0;
  const wayBefore = frame ? run.lastWay[frame - 1] : null;
  run.stillFor.push(moving ? 0 : stillBefore + 1);
  run.lastWay.push(moving ? new THREE.Vector2(velocity.x / speed, velocity.z / speed) : wayBefore);
}

/** This frame of the body for the balance: its centre of mass with its gear, and the soles planted under it. */
function followBalance(run: GaitRun, lab: Lab, legs: LegIK, shapes: ReturnType<typeof shapesOf>): void {
  const frame = run.stillFor.length - 1;
  const way = run.stillFor[frame] === 0 ? run.lastWay[frame] : null;
  const ankles = [lab.joints.ankleL, lab.joints.ankleR];
  const feet = legs.feet.map((foot, side) => {
    return { planted: foot.state === 'plant', ankle: ankles[side], shape: shapes[side] };
  });
  run.balance.push(sampleOf(lab.joints, buildOf(lab), lab.player.pos, feet, way));
  run.feetAt.push(feetNow(legs));
}

/** Counts a frame with a joint past its range, and keeps the worst. */
function followRanges(run: GaitRun, lab: Lab, frame: number): void {
  const { found } = bodyBreaches(lab.joints);
  if (!found.length) return;
  run.pastRange++;
  if (!run.worstBreach || found[0].by > run.worstBreach.breach.by) run.worstBreach = { breach: found[0], frame };
}

/** what each way a body couldn't move is called in a report */
const UNLIKE_NAMES: Record<Unlike, string> = {
  tips: 'would tip',
  grip: 'beyond the feet\'s grip',
  game: 'the game\'s own movement beyond any grip',
  pulled: 'pulled down with a foot on the ground',
  pushed: 'pushed along in the air',
  held: 'in the air, not falling as a body does:',
};

/** A frame's falls, as a trace notes them. */
function fallNote(falls: Fall[]): string {
  const noteOf = (fall: Fall) => [UNLIKE_NAMES[fall.unlike], fall.toward, amountOf(fall)].filter(Boolean).join(' ');
  return falls.map(noteOf).join(', ');
}

/** How much a fall is: off the soles (cm) or a push (m/s²). */
function amountOf(fall: Fall): string {
  return fall.unlike === 'tips' ? `${cm(fall.by)} cm` : `${fall.by.toFixed(1)} m/s²`;
}

/** Adds each traced frame's falls to its line. */
function noteFallsInTrace(run: GaitRun): void {
  for (const traced of run.trace) {
    const falls = run.falls.filter((fall) => fall.frame === traced.frame);
    if (falls.length) traced.line += `  ${fallNote(falls)}`;
  }
}

/** The body's balance over the run: each way it couldn't have moved, on how many frames, and the worst. */
function balanceOf(run: GaitRun): string {
  const kinds = Object.keys(UNLIKE_NAMES) as Unlike[];
  const said = kinds.flatMap((unlike) => {
    const falls = run.falls.filter((fall) => fall.unlike === unlike);
    if (!falls.length) return [];
    const worst = falls.reduce((best, fall) => (Math.abs(fall.by) > Math.abs(best.by) ? fall : best));
    const ways = unlike === 'tips' ? ` (${towardsOf(falls)})` : '';
    return [`${UNLIKE_NAMES[unlike]} ${falls.length} frames${ways}, the worst ${amountOf(worst)} at ${worst.frame}`];
  });
  const what = 'its centre of mass with its gear against the push from its planted soles';
  return said.length ? `as a body (${what}): ${said.join('; ')}` : `as a body could move (${what})`;
}

/** How many frames a body would tip each way. */
function towardsOf(falls: Fall[]): string {
  const counts = new Map<string, number>();
  for (const fall of falls) counts.set(fall.toward, (counts.get(fall.toward) ?? 0) + 1);
  return [...counts].map(([toward, count]) => `${toward} ${count}`).join(', ');
}

/** The episodes of a run a body couldn't move so (frames a frame or less apart), for `--frames`: each one's frames,
 *  what the feet did, and each way it couldn't, at its worst. */
function fallEpisodes(run: GaitRun): string[] {
  const episodes: Fall[][] = [];
  for (const fall of run.falls) {
    const current = episodes[episodes.length - 1];
    const last = current?.[current.length - 1];
    if (last && fall.frame - last.frame <= 1) current.push(fall);
    else episodes.push([fall]);
  }
  return episodes.map((falls) => {
    const first = falls[0].frame;
    const last = falls[falls.length - 1].frame;
    const frames = first === last ? `frame ${first}` : `frames ${first}-${last}`;
    return `    ${frames} (${feetDoing(run, first, last)}): ${episodeWays(falls)}`;
  });
}

/** Each way an episode's body couldn't move, at its worst. */
function episodeWays(falls: Fall[]): string {
  const worst = new Map<string, Fall>();
  for (const fall of falls) {
    const key = `${fall.unlike} ${fall.toward}`;
    const was = worst.get(key);
    if (!was || fall.by > was.by) worst.set(key, fall);
  }
  const said = (fall: Fall) => `${fallNote([fall])} (at ${fall.frame}${fall.causes ? `: ${fall.causes}` : ''})`;
  return [...worst.values()].map(said).join('; ');
}

/** What the feet did over frames `first` to `last`: standing or moving, and each frame's feet (`_` down, `^` up). */
function feetDoing(run: GaitRun, first: number, last: number): string {
  const moving = run.stillFor.slice(first, last + 1).some((still) => still === 0);
  const feet = run.feetAt.slice(first, last + 1).join(' ');
  return `${moving ? 'moving' : 'standing'}, ${feet}`;
}

/** The joints past their ranges over the run. */
function rangesOf(run: GaitRun): string {
  if (!run.worstBreach) return 'every joint within its range';
  const worst = `${describeBreach(run.worstBreach.breach)} at frame ${run.worstBreach.frame}`;
  return `a joint past its range ${run.pastRange} frames, the worst ${worst}`;
}

/** The steps a foot took back against the way the body had gone, once it had stopped: put out ahead, and stepped back
 *  under a body that never came over it. */
function stepsBack(run: GaitRun): Step[] {
  return run.steps.filter((step) => {
    const way = run.lastWay[step.left];
    if (!way || run.stillFor[step.left] < STOPPED_FRAMES) return false;
    const along = (step.to.x - step.from.x) * way.x + (step.to.z - step.from.z) * way.y;
    return along < -STEP_BACK;
  });
}

/** Counts a frame the body moved well short of its velocity (`speed` its move over the ground, m/s), and names the
 *  first with the nearest obstacle: a scenario run into a prop measures a body stopping and starting, not a walk. */
function followHeldUp(run: GaitRun, lab: Lab, frame: number, speed: number): void {
  const velocity = Math.hypot(lab.player.vel.x, lab.player.vel.z);
  if (velocity < HELD_UP_SPEED || speed > HELD_UP_SHARE * velocity) return;
  run.heldUp++;
  if (run.heldUpAt) return;
  const at = lab.player.pos;
  const nearest = G.arena.obstacles.reduce(
    (best, obstacle) => {
      const gap = Math.hypot(obstacle.x - at.x, obstacle.z - at.z) - obstacle.r;
      return gap < best.gap ? { gap, x: obstacle.x, z: obstacle.z } : best;
    },
    { gap: Infinity, x: NaN, z: NaN },
  );
  const near = Number.isFinite(nearest.gap)
    ? `, the nearest obstacle ${cm(nearest.gap)} cm off, at ${nearest.x.toFixed(1)}, ${nearest.z.toFixed(1)}`
    : '';
  run.heldUpAt = `frame ${frame}, at ${at.x.toFixed(1)}, ${at.z.toFixed(1)}${near}`;
}

/** Each hand's and ankle's place forward of the hips this frame, in the hips' frame (m). */
function followSwings(run: GaitRun, lab: Lab, frame: number): void {
  run.swingFrames.push(frame);
  const joints = lab.joints;
  // (against the knee, the thigh's swing, as a person's arm swings against the hip's: the ankle trails the thigh
  // through a swing as the knee folds, and no arm swung by the thigh could read as -1 against it)
  const pairs = [[joints.handL, joints.kneeL], [joints.handR, joints.kneeR]];
  pairs.forEach(([hand, ankle], side) => {
    run.swings[side].hand.push(forwardOfHips(lab, hand));
    run.swings[side].ankle.push(forwardOfHips(lab, ankle));
  });
}

/** How far forward of the hips a joint is, in the hips' own frame (m). */
function forwardOfHips(lab: Lab, joint: THREE.Object3D): number {
  const hips = lab.joints.hips;
  const scale = hips.getWorldScale(new THREE.Vector3()).x;
  return hips.worldToLocal(joint.getWorldPosition(new THREE.Vector3())).z * scale;
}

/** each hand's swing against its ankle is judged over stretches this long, this far apart (frames: a stretch is a
 *  stride and more at a run, most of one at a walk) */
const SWING_STRETCH = 30;
const SWING_EVERY = 15;
/** a hand moving fore and aft less than this over a stretch is held, not swinging (m) */
const SWING_LEAST = 0.06;

/** A stretch of the moving frames a hand's swing is judged over: its first and last frames, and the correlation. */
interface SwingStretch {
  at: number;
  until: number;
  value: number;
}

/** Each side's hand against its own ankle over each stretch of the moving frames. */
function swingStretches(run: GaitRun): SwingStretch[][] {
  return run.swings.map((swing) => {
    const stretches: SwingStretch[] = [];
    for (let from = 0; from + SWING_STRETCH <= swing.hand.length; from += SWING_EVERY) {
      const until = from + SWING_STRETCH;
      const hand = swing.hand.slice(from, until);
      // (a hand that hardly moves is held, a bow drawn: not a swing to judge)
      if (Math.max(...hand) - Math.min(...hand) < SWING_LEAST) continue;
      const value = correlation(hand, swing.ankle.slice(from, until));
      stretches.push({ at: run.swingFrames[from], until: run.swingFrames[until - 1], value });
    }
    return stretches;
  });
}

/** Every stretch's correlation, side by side, for `--frames`. */
function swingStretchLines(run: GaitRun): string[] {
  return swingStretches(run).flatMap((stretches, side) => stretches.map((stretch) => {
    return `    ${SIDES[side]} hand against its knee, frames ${stretch.at}-${stretch.until}: ${stretch.value.toFixed(2)}`;
  }));
}

/** Each hand against its own side's ankle over each stretch of the moving frames: the median, and the worst stretch
 *  and its frames (a hand swinging with its own leg there, as a person's never does). */
function swingsByStretch(run: GaitRun): string {
  const said = swingStretches(run).map((stretches, side) => {
    if (!stretches.length) return `${SIDES[side]} held`;
    const values = stretches.map((stretch) => stretch.value);
    const worst = stretches.reduce((best, stretch) => (stretch.value > best.value ? stretch : best));
    const worstAt = `frames ${worst.at}-${worst.until}`;
    return `${SIDES[side]} ${median(values).toFixed(2)}, the worst ${worst.value.toFixed(2)} (${worstAt})`;
  });
  return `by ${SWING_STRETCH} frames, the median and the worst: ${said.join('; ')}`;
}

/** The correlation of two series (-1 to 1; 0 when either keeps still). */
function correlation(first: number[], second: number[]): number {
  const count = Math.min(first.length, second.length);
  if (count < 2) return 0;
  const mean = (values: number[]) => values.slice(0, count).reduce((sum, value) => sum + value, 0) / count;
  const firstMean = mean(first);
  const secondMean = mean(second);
  let both = 0;
  let firstSquares = 0;
  let secondSquares = 0;
  for (let i = 0; i < count; i++) {
    const a = first[i] - firstMean;
    const b = second[i] - secondMean;
    both += a * b;
    firstSquares += a * a;
    secondSquares += b * b;
  }
  const spread = Math.sqrt(firstSquares * secondSquares);
  return spread > 1e-9 ? both / spread : 0;
}

/** The walk's rhythm: how many strides left in step with the walk cycle (near their window's start, as the arms
 *  swing by it) and how many landed already out of the leg's reach. */
function rhythmOf(steps: Step[]): string {
  const timed = steps.filter((step) => step.window !== undefined);
  const inStep = timed.filter((step) => Math.abs(step.window!) <= IN_STEP).length;
  const over = steps.filter((step) => step.landedOver).length;
  const kept = timed.length ? `${inStep} of ${timed.length} strides in step with the cycle` : 'the cycle not known';
  const outOfStep = timed.filter((step) => Math.abs(step.window!) > IN_STEP);
  const offFrames = outOfStep.map((step) => `${SIDES[step.foot]} ${step.left}`).join(', ');
  const overFrames = steps.filter((step) => step.landedOver).map((step) => `${SIDES[step.foot]} ${step.landed}`);
  const off = offFrames ? `, out of step: ${offFrames}` : '';
  const landed = over ? ` (${overFrames.join(', ')})` : '';
  return `${kept} (leaving within ${IN_STEP} of their window's start${off}); ${over} landed out of reach${landed}`;
}

/** What a walk has that a person's has none of, by name: the hops and a foot dance's steps. */
function countsOf(run: GaitRun): Record<string, number> {
  return { hops: run.hops.length, 'short steps': run.shortSteps };
}

/** Adds `counts` into `total`, name by name. */
function addCounts(total: Record<string, number>, counts: Record<string, number>): void {
  for (const [name, count] of Object.entries(counts)) total[name] = (total[name] ?? 0) + count;
}

/** Counts the planted feet dragged this frame, and each one's run of such frames, and those on their toes. */
function followReach(run: GaitRun, legs: LegIK): void {
  legs.feet.forEach((foot, side) => {
    const planted = foot.state === 'plant';
    // (where the IK says: an A/B's older side may not)
    const dragged = planted && Boolean((foot as { dragged?: boolean }).dragged);
    run.dragRun[side] = dragged ? run.dragRun[side] + 1 : 0;
    if (dragged) run.dragged++;
    if (planted && foot.over) run.onToes++;
    run.longestDrag = Math.max(run.longestDrag, run.dragRun[side]);
  });
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
  if (run.longestDrag >= DRAG_RUN) {
    found.push(`a planted foot dragged for up to ${run.longestDrag} frames: the leg short of it, even on its toes`);
  }
  if (run.jerks) found.push(`${run.jerks} jerks: a sudden change of the change of speed in a frame`);
  const back = stepsBack(run);
  if (back.length) {
    const frames = back.map((step) => `${SIDES[step.foot]} ${step.left}`).join(', ');
    found.push(`${back.length} steps back under a body that had stopped (${frames}): its feet were out ahead of it`);
  }
  const tips = run.falls.filter((fall) => fall.unlike === 'tips').length;
  if (tips) found.push(`the body would fall over on ${tips} frames: its feet not under its weight`);
  const hung = run.falls.filter((fall) => fall.unlike === 'held').length;
  if (hung) found.push(`hung in the air on ${hung} frames, not falling as a body does`);
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
  const worst = `${run.worstJerk.toFixed(2)} m/s (${run.worstJerkAt || 'none'})`;
  lines.push(`  the worst jerk, a change of the change of speed in a frame: ${worst}`);
  lines.push(
    `  a planted foot dragged ${share(run.dragged, run.moving)} of the time, up to ${run.longestDrag} frames running;`
      + ` on its toes, out of a flat foot's reach, ${share(run.onToes, run.moving)}`,
  );
  if (run.heldUp) {
    lines.push(`  held up by something in its way ${run.heldUp} frames (${run.heldUpAt}): not a walk to judge`);
  }
  lines.push(`  ${rhythmOf(run.steps)}`);
  lines.push(`  ${balanceOf(run)}`);
  lines.push(`  ${rangesOf(run)}`);
  const against = run.swings.map((swing) => correlation(swing.hand, swing.ankle).toFixed(2));
  const hands = `L ${against[0]}, R ${against[1]}`;
  lines.push(`  each hand fore and aft against its own side's knee: ${hands} (a person's: -1)`);
  lines.push(`    ${swingsByStretch(run)}`);
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
    lines.push(...fallEpisodes(run));
    lines.push(...swingStretchLines(run));
  }
  lines.push(...run.trace.map((traced) => traced.line));
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
  const report: GaitReport = { lines: [], moments: [], problems: [], counts: {} };
  const seconds = window.__labClock.frame / 1000;
  for (const scenario of SCENARIOS.filter((candidate) => asked.includes(candidate.name))) {
    const run = await runScenario(lab, scenario, null, traceSpanOf(options), options.offset ?? 0);
    report.lines.push(...describeRun(scenario, run, seconds, Boolean(options.frames)));
    addCounts(report.counts, countsOf(run));
    if (run.heldUp) {
      report.problems.push(`gait: ${scenario.name} was held up by something in its way (${run.heldUpAt})`);
    }
    if (options.films === false) continue;
    const film = filmFor(run.hopFrames);
    await runScenario(lab, scenario, film, null, options.offset ?? 0);
    const moment = filmMoment(scenario, film);
    if (moment) report.moments.push(moment);
  }
  report.lines.push(
    'a person: walks to about 2 m/s with a foot always down and both down 15 to 25% of the time, the hips highest on'
      + ' one foot; runs above, in the air more the faster (20 to 35% at a jog, about half at 7 m/s), the hips 5 to 9'
      + ' cm up and down and highest in the air; each hand swings against its own leg',
  );
  return report;
}
