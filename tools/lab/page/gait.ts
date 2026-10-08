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
import { G } from '../../../src/state';

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
    what: 'level ground, nothing drawn',
    start: LEVEL,
    aim: null,
    legs: [legOf(['d'], false, 60), legOf(['a'], false, 60)],
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
  /** each frame, when traced */
  trace: string[];
  /** the frames a planted foot was dragged (its leg short of it even on its toes), each foot's run of them going
   *  on, and the longest; and the frames one was up on its toes, out of a flat foot's reach (a push off) */
  dragged: number;
  dragRun: [number, number];
  longestDrag: number;
  onToes: number;
  /** the frames the body moved well short of its own velocity (held up by something in its way), and the first */
  heldUp: number;
  heldUpAt: string;
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
  const body = `faces ${facing.padStart(4)} goes ${going.padStart(4)} at ${speed.toFixed(2)} pelvis ${pelvis.padStart(4)}`;
  const cycle = cycleOf(legs);
  const phase = cycle ? (((cycle.phase / (2 * Math.PI)) % 1) + 1) % 1 : NaN;
  const cycleNote = cycle ? `phase ${phase.toFixed(2)} rate ${cycle.rate.toFixed(1).padStart(5)}${cycle.backing ? ' back' : ''}` : '';
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
async function runScenario(lab: Lab, scenario: GaitScenario, film: Film | null, trace = false): Promise<GaitRun> {
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
    trace: [],
    dragged: 0,
    dragRun: [0, 0],
    longestDrag: 0,
    onToes: 0,
    heldUp: 0,
    heldUpAt: '',
  };
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
      run.trace.push(traceLine(lab, frame, legs, moved / seconds, motions));
      anklesBefore.splice(0, 2, ...anklesWere);
      anklesWere.splice(0, 2, ...ankles);
    }
    followHeldUp(run, lab, frame, moved / seconds);
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
  lines.push(...run.trace);
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
  const report: GaitReport = { lines: [], moments: [], problems: [] };
  const seconds = window.__labClock.frame / 1000;
  for (const scenario of SCENARIOS.filter((candidate) => asked.includes(candidate.name))) {
    const run = await runScenario(lab, scenario, null, Boolean(options.trace));
    report.lines.push(...describeRun(scenario, run, seconds, Boolean(options.frames)));
    if (run.heldUp) report.problems.push(`gait: ${scenario.name} was held up by something in its way (${run.heldUpAt})`);
    const film = filmFor(run.hopFrames);
    await runScenario(lab, scenario, film);
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
