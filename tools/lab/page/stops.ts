// `lab stops`: the hero coming to a stop, judged as a person stops. A person stopping from a run takes a step or two
// as the body slows, the last landing under it or beside the other foot on the ground it stands on, and once the body
// is still nothing moves. Each stop here is a run let go at a different point of its stride (on level ground in
// several directions, drawn and not, and towards and away from the dais's edge so the body stops on the dais, on its
// step or on the floor by it), judged from the frame the keys are let go: the steps taken once the body was still, a
// foot put out ahead and drawn back (a waste of motion), a step back against the way it went, the feet's travel once
// still, a foot standing on another level than the body's once still (and how long, until it stepped onto it), the
// frames both feet were up, and how long the feet took to settle.
import * as THREE from 'three';
import type { Lab } from './lab';
import type { LegIK } from '../../../src/entities/models/ik';
import { ARENA } from '../../../src/data/balance';
import { groundHeight } from '../../../src/world/ground';

/** One stop: its name in a report, where the run starts, the keys held and for how many frames, and the point a
 *  drawn one aims at: drawn as it runs, or only from the moment the keys are let go (stopping to shoot). */
interface StopRun {
  name: string;
  start: [number, number];
  keys: string[];
  frames: number;
  aim: [number, number] | null;
  drawsFrom: 'run' | 'stop';
}

/** A family of stops, as the report names it. */
interface StopScenario {
  name: string;
  what: string;
  runs: StopRun[];
}

/** where the stops on level ground start (open ground), and the point a drawn one aims at */
const LEVEL: [number, number] = [14, 14];
const LEVEL_AIM: [number, number] = [14, 40];
/** the frames a run is held before it is let go: a few apart, so the stops fall at different points of a stride */
const RUN_FRAMES = [18, 23, 28, 33, 38, 43];
/** the ways a level run goes */
const LEVEL_KEYS = [['d'], ['a'], ['w'], ['s'], ['w', 'd'], ['s', 'a']];
/** where the runs at the dais's edge start: on the dais, and out on the floor past its step, level with the middle;
 *  and the point a shot there aims at, along the edge */
const ON_DAIS: [number, number] = [1.5, 0.3];
const OFF_DAIS: [number, number] = [ARENA.daisHalf + 3.2, 0.3];
const EDGE_AIM: [number, number] = [ARENA.daisHalf, 25];
/** the frames those runs are held: from stopping short of the edge to stopping past the step */
const EDGE_FRAMES = [30, 33, 36, 39, 42, 45, 48, 51];
/** where a run on a slant out over the edge starts (the edge 3.2 m off across it, 4.5 m along the way) */
const SLANT_START: [number, number] = [2, -2];
/** how far out from the dais's edge the runs along it go (m: on the dais, astride its edge, on its step, astride the
 *  step's edge), from where they start along it, and the frames they are held */
const ALONG_OUT = [-0.25, -0.12, 0, 0.12, 0.35, 0.6, 0.75];
const ALONG_FROM = -3;
const ALONG_FRAMES = [24, 29];
/** the frames after the keys are let go that a stop is judged over (a re-step a second later counts) */
const AFTER_FRAMES = 120;
/** a body slower than this is still (m/s) */
const STILL_SPEED = 0.05;
/** a foot put out this much further ahead along the way than where it ends was put out and drawn back (m) */
const DRAWN_BACK = 0.05;
/** a step against the way the body went by more than this is a step back (m) */
const STEP_BACK = 0.05;
/** two levels this close are one (m) */
const SAME_LEVEL = 1e-3;

/** The runs from `start` each way at each length, named by their keys and frames. */
function runsOf(start: [number, number], keys: string[][], frames: number[], aim: StopRun['aim'],
  drawsFrom: StopRun['drawsFrom'] = 'run'): StopRun[] {
  return keys.flatMap((way) => frames.map((count) => {
    return { name: `${way.join('')} ${count}`, start, keys: way, frames: count, aim, drawsFrom };
  }));
}

/** The runs along the dais's edge, at each distance out from it, named by it (cm). */
function alongEdge(): StopRun[] {
  return ALONG_OUT.flatMap((out) => {
    const start: [number, number] = [ARENA.daisHalf + out, ALONG_FROM];
    const named = (run: StopRun) => ({ ...run, name: `${(out * 100).toFixed(0)} cm out, ${run.name}` });
    return runsOf(start, [['s']], ALONG_FRAMES, null).map(named);
  });
}

const SCENARIOS: StopScenario[] = [
  {
    name: 'level',
    what: 'level ground, nothing drawn, stopping from a run',
    runs: runsOf(LEVEL, LEVEL_KEYS, RUN_FRAMES, null),
  },
  {
    name: 'drawn',
    what: 'level ground, strafing drawn and stopping',
    runs: runsOf(LEVEL, [['d'], ['a']], RUN_FRAMES, LEVEL_AIM),
  },
  {
    name: 'edgeOut',
    what: "running out over the dais's edge and stopping by it, nothing drawn",
    runs: runsOf(ON_DAIS, [['d']], EDGE_FRAMES, null),
  },
  {
    name: 'edgeIn',
    what: 'running in onto the dais and stopping by its edge, nothing drawn',
    runs: runsOf(OFF_DAIS, [['a']], EDGE_FRAMES, null),
  },
  {
    name: 'edgeSlant',
    what: "running out over the dais's edge on a slant and stopping by it, nothing drawn",
    runs: runsOf(SLANT_START, [['d', 's']], EDGE_FRAMES, null),
  },
  {
    name: 'edgeAlong',
    what: "running along the dais's edge, astride it and its step, and stopping, nothing drawn",
    runs: alongEdge(),
  },
  {
    name: 'edgeShot',
    what: "running out over the dais's edge and stopping to shoot along it",
    runs: runsOf(ON_DAIS, [['d']], EDGE_FRAMES, EDGE_AIM, 'stop'),
  },
];

/** The scenarios `lab stops` can run, by name. */
export const STOP_SCENARIOS = SCENARIOS.map((scenario) => scenario.name);

/** What `lab stops` is asked for. */
export interface StopsOptions {
  /** the scenarios to run (all when empty) */
  scenarios?: string[];
  /** list every stop: where it stopped, each step after the keys were let go */
  frames?: boolean;
  /** with `frames`, each frame of each stop: the body, the hips and each ankle along the way from where it rested */
  trace?: boolean;
  /** only the stops whose names contain this (`d 23`, `12 cm out`) */
  only?: string;
}

/** What `lab stops` found: its lines. */
export interface StopsReport {
  lines: string[];
}

/** A step of a foot that landed once the keys were let go: frames from then, where its ankle left and landed, the
 *  level it landed on and the body's then. */
interface StopStep {
  foot: number;
  left: number;
  landed: number;
  from: THREE.Vector3;
  to: THREE.Vector3;
  level: number;
  bodyLevel: number;
  /** the level it stood on before it left (NaN: in the air as the keys were let go) */
  fromLevel: number;
}

/** What one stop found (frames counted from the keys let go). */
interface StopResult {
  run: StopRun;
  /** the body's speed as it was let go (m/s), the way it went, where it was then and where it came to rest */
  speed: number;
  way: THREE.Vector2;
  letGoAt: THREE.Vector3;
  restedAt: THREE.Vector3;
  /** the frame the body was still from, and the last landing (-1: none) */
  stillFrom: number;
  settledAt: number;
  steps: StopStep[];
  /** each foot: how much further ahead along the way it was put than where it ended (m) */
  drawnBack: [number, number];
  /** the feet's travel over the ground once the body was still (m) */
  travelStill: number;
  /** each foot's frames planted on another level than the body's once it was still, and whether it ended so */
  offLevel: [number, number];
  endsOffLevel: [boolean, boolean];
  /** the frames both feet were in the air once one had landed (a run's flight as it was let go is not a hop) */
  bothUp: number;
  /** each frame, for `--trace` */
  frames: StopFrame[];
}

/** A frame of a stop for `--trace`: the body's speed, where it, the hips and each ankle were, each foot's state, the
 *  lean (rad). */
interface StopFrame {
  speed: number;
  body: THREE.Vector3;
  hips: THREE.Vector3;
  ankles: THREE.Vector3[];
  feet: string;
  /** each foot in the air: where its landing is aimed and how far through its stride it is (none planted) */
  aims: ({ at: THREE.Vector3; through: number } | null)[];
  lean: number;
}

const SIDES = ['L', 'R'] as const;
const cm = (metres: number) => (metres * 100).toFixed(0);

/** The way keys held move the body (x, z; w is -z, d is +x), as an angle the body faces (0 is +z). */
function facingOfKeys(keys: string[]): number {
  const x = (keys.includes('d') ? 1 : 0) - (keys.includes('a') ? 1 : 0);
  const z = (keys.includes('s') ? 1 : 0) - (keys.includes('w') ? 1 : 0);
  return Math.atan2(x, z);
}

type LegFoot = LegIK['feet'][number];

/** Where a foot in the air is aimed to land and how far through its stride it is, as the leg IK has it (none
 *  planted, or where an older IK doesn't say). */
function aimOf(foot: LegFoot): StopFrame['aims'][number] {
  const aimed = foot as unknown as { B?: THREE.Vector3; t?: number };
  if (foot.state === 'plant' || !aimed.B) return null;
  return { at: aimed.B.clone(), through: aimed.t ?? NaN };
}

/** How far ahead along `way` a point is (m). */
function alongWay(point: THREE.Vector3, way: THREE.Vector2): number {
  return point.x * way.x + point.z * way.y;
}

/** Follows the feet from the frame the keys are let go: their steps, how far ahead each was put, the levels. */
class StopWatch {
  private frame = 0;
  private wasDown: boolean[];
  private leftAt = [-1, -1];
  private leftFrom = [new THREE.Vector3(), new THREE.Vector3()];
  private leftLevel = [NaN, NaN];
  private levelWas: number[];
  private anklesWere: THREE.Vector3[];
  private furthest = [-Infinity, -Infinity];
  private landed = false;
  readonly result: StopResult;

  constructor(private lab: Lab, private legs: LegIK, run: StopRun) {
    const velocity = lab.player.vel;
    const speed = Math.hypot(velocity.x, velocity.z);
    const way = speed > 1e-3 ? new THREE.Vector2(velocity.x / speed, velocity.z / speed) : new THREE.Vector2(0, 1);
    this.wasDown = legs.feet.map((foot) => foot.state === 'plant');
    this.levelWas = legs.feet.map((foot) => foot.P.y);
    this.anklesWere = this.ankles();
    this.result = {
      run,
      speed,
      way,
      letGoAt: lab.player.pos.clone(),
      restedAt: new THREE.Vector3(),
      stillFrom: -1,
      settledAt: -1,
      steps: [],
      drawnBack: [0, 0],
      travelStill: 0,
      offLevel: [0, 0],
      endsOffLevel: [false, false],
      bothUp: 0,
      frames: [],
    };
  }

  private ankles(): THREE.Vector3[] {
    const joints = [this.lab.joints.ankleL, this.lab.joints.ankleR];
    return joints.map((ankle) => ankle.getWorldPosition(new THREE.Vector3()));
  }

  /** This frame of the stop. */
  observe(): void {
    const frame = this.frame++;
    const ankles = this.ankles();
    this.followStill(frame);
    this.followBothUp();
    this.traceFrame(ankles);
    this.legs.feet.forEach((foot, side) => this.followFoot(frame, foot, side, ankles));
    this.anklesWere = ankles;
  }

  /** The frame the body has been still from (none while it moves). */
  private followStill(frame: number): void {
    const velocity = this.lab.player.vel;
    const still = Math.hypot(velocity.x, velocity.z) < STILL_SPEED;
    if (!still) this.result.stillFrom = -1;
    else if (this.result.stillFrom < 0) this.result.stillFrom = frame;
  }

  /** Counts a frame with both feet up once one has landed. */
  private followBothUp(): void {
    if (this.legs.feet.some((foot) => foot.state === 'plant')) this.landed = true;
    else if (this.landed) this.result.bothUp++;
  }

  /** Keeps this frame for `--trace`. */
  private traceFrame(ankles: THREE.Vector3[]): void {
    const velocity = this.lab.player.vel;
    const feet = this.legs.feet;
    this.result.frames.push({
      speed: Math.hypot(velocity.x, velocity.z),
      body: this.lab.player.pos.clone(),
      hips: this.lab.joints.hips.getWorldPosition(new THREE.Vector3()),
      ankles,
      feet: feet.map((foot, side) => `${SIDES[side]}${foot.state === 'plant' ? '_' : '^'}`).join(''),
      aims: feet.map((foot) => aimOf(foot)),
      lean: this.legs.lean,
    });
  }

  /** One foot this frame: how far ahead it has been, its travel and level once the body is still, and its steps. */
  private followFoot(frame: number, foot: LegFoot, side: number, ankles: THREE.Vector3[]): void {
    const result = this.result;
    const down = foot.state === 'plant';
    const body = this.lab.player.pos;
    const bodyLevel = groundHeight(body.x, body.z);
    this.furthest[side] = Math.max(this.furthest[side], alongWay(ankles[side], result.way));
    if (result.stillFrom >= 0) {
      const moved = ankles[side].clone().sub(this.anklesWere[side]);
      result.travelStill += Math.hypot(moved.x, moved.z);
      if (down && Math.abs(foot.P.y - bodyLevel) > SAME_LEVEL) result.offLevel[side]++;
    }
    if (this.wasDown[side] && !down) {
      this.leftAt[side] = frame;
      this.leftFrom[side].copy(ankles[side]);
      this.leftLevel[side] = this.levelWas[side];
    }
    if (!this.wasDown[side] && down) {
      const leftOnce = this.leftAt[side] >= 0;
      const from = leftOnce ? this.leftFrom[side].clone() : this.anklesWere[side].clone();
      const step = { foot: side, left: this.leftAt[side], landed: frame, from, to: ankles[side].clone() };
      result.steps.push({ ...step, level: foot.P.y, bodyLevel, fromLevel: leftOnce ? this.leftLevel[side] : NaN });
      result.settledAt = frame;
    }
    this.wasDown[side] = down;
    if (down) this.levelWas[side] = foot.P.y;
  }

  /** The stop as it ended. */
  finish(): StopResult {
    const result = this.result;
    const ankles = this.ankles();
    const body = this.lab.player.pos;
    const bodyLevel = groundHeight(body.x, body.z);
    result.restedAt.copy(body);
    this.legs.feet.forEach((foot, side) => {
      result.drawnBack[side] = Math.max(0, this.furthest[side] - alongWay(ankles[side], result.way));
      result.endsOffLevel[side] = Math.abs(foot.P.y - bodyLevel) > SAME_LEVEL;
    });
    return result;
  }
}

/** Runs one stop, set up afresh, and follows it from the keys let go. */
async function runStop(lab: Lab, run: StopRun): Promise<StopResult> {
  const drawnRunning = Boolean(run.aim) && run.drawsFrom === 'run';
  const facing = drawnRunning ? 0 : facingOfKeys(run.keys);
  await lab.setup({ at: run.start, facing, nocked: Boolean(lab.player.cls.quiver) });
  const legs = lab.model.root.userData.legs as LegIK | undefined;
  if (!legs) throw new Error(`lab: stops: the ${lab.player.cls.id} has no leg IK`);
  const aim = run.aim ? new THREE.Vector3(run.aim[0], 0, run.aim[1]) : undefined;
  await lab.step(run.frames, () => ({ keys: run.keys, m0: drawnRunning, aim }));
  const watch = new StopWatch(lab, legs, run);
  await lab.step(AFTER_FRAMES, () => ({ m0: Boolean(run.aim), aim }), () => watch.observe());
  return watch.finish();
}

/** The steps a stop took once its body was still. */
function stepsWhenStill(result: StopResult): StopStep[] {
  if (result.stillFrom < 0) return [];
  return result.steps.filter((step) => step.left >= result.stillFrom);
}

/** The steps a stop took once its body was still from one level onto another: a foot put down on a level and
 *  moved to another once the body stood. */
function stepsOntoAnotherLevel(result: StopResult): StopStep[] {
  return stepsWhenStill(result).filter((step) => Math.abs(step.level - step.fromLevel) > SAME_LEVEL);
}

/** The steps a stop took back against the way its body went. */
function stepsBack(result: StopResult): StopStep[] {
  return result.steps.filter((step) => {
    const along = (step.to.x - step.from.x) * result.way.x + (step.to.z - step.from.z) * result.way.y;
    return along < -STEP_BACK;
  });
}

/** The feet a stop put out ahead and drew back. */
function feetDrawnBack(result: StopResult): number[] {
  return [0, 1].filter((side) => result.drawnBack[side] > DRAWN_BACK);
}

/** Where a stop's body came to rest by the dais: how far inside its edge (m; under 0 on the step or past it). */
function insideEdge(at: THREE.Vector3): number {
  return ARENA.daisHalf - Math.max(Math.abs(at.x), Math.abs(at.z));
}

/** One stop's line for `--frames`: the run, where it rested and how, and each step once let go. */
function describeStop(result: StopResult, seconds: number, trace: boolean): string[] {
  const run = result.run;
  const rest = result.restedAt;
  const edge = insideEdge(rest);
  const by = Math.abs(edge) < 1.5 ? `, ${cm(edge)} cm inside the dais's edge` : '';
  const still = result.stillFrom < 0 ? 'never still' : `still at ${result.stillFrom}`;
  const settled = result.settledAt < 0 ? 'no landing' : `the last landing at ${result.settledAt}`;
  const head = `    ${run.name} frames at ${result.speed.toFixed(1)} m/s: rested at`
    + ` ${rest.x.toFixed(2)}, ${rest.z.toFixed(2)}${by}; ${still}, ${settled}`;
  const fromRest = (point: THREE.Vector3) => cm(alongWay(point, result.way) - alongWay(rest, result.way));
  const lines = [head, `      let go ${fromRest(result.letGoAt)} cm along the way from where it rested`];
  for (const step of result.steps) {
    const along = (step.to.x - step.from.x) * result.way.x + (step.to.z - step.from.z) * result.way.y;
    const length = Math.hypot(step.to.x - step.from.x, step.to.z - step.from.z);
    const offBody = Math.abs(step.level - step.bodyLevel) > SAME_LEVEL;
    const moved = Math.abs(step.level - step.fromLevel) > SAME_LEVEL;
    const onto = moved ? `, from the ${cm(step.fromLevel)} cm level` : '';
    const level = offBody || moved ? `${onto}, on the ${cm(step.level)} cm level with the body on the`
      + ` ${cm(step.bodyLevel)}` : '';
    const left = step.left < 0 ? 'in the air as let go' : `left at ${step.left}`;
    const time = step.left < 0 ? '' : ` (${((step.landed - step.left) * seconds).toFixed(2)} s)`;
    const where = `from ${fromRest(step.from)} to ${fromRest(step.to)} cm from where the body rested`;
    const went = `${cm(length)} cm, ${cm(along)} along the way`;
    lines.push(`      ${SIDES[step.foot]} ${left}, landed at ${step.landed}${time}: ${went}, ${where}${level}`);
  }
  const back = feetDrawnBack(result).map((side) => `${SIDES[side]} ${cm(result.drawnBack[side])} cm`);
  if (back.length) lines.push(`      put out ahead and drawn back: ${back.join(', ')}`);
  const off = [0, 1].filter((side) => result.offLevel[side]);
  if (off.length) {
    const said = off.map((side) => {
      const toTheEnd = result.endsOffLevel[side] ? ', to the end' : '';
      return `${SIDES[side]} ${result.offLevel[side]} frames${toTheEnd}`;
    });
    lines.push(`      once still, on another level than the body's: ${said.join(', ')}`);
  }
  if (trace) lines.push(...result.frames.map((frame, at) => traceLine(frame, at, fromRest)));
  return lines;
}

/** A frame of a stop for `--trace`, along the way from where the body rested (cm). */
function traceLine(frame: StopFrame, at: number, fromRest: (point: THREE.Vector3) => string): string {
  const ankles = frame.ankles.map((ankle, side) => {
    const aim = frame.aims[side];
    const aimed = aim ? ` (to ${fromRest(aim.at).padStart(4)} at ${aim.through.toFixed(2)})` : ''.padEnd(17);
    return `${SIDES[side]} ${fromRest(ankle).padStart(4)}${aimed}`;
  }).join(' ');
  const where = `body ${fromRest(frame.body).padStart(4)} hips ${fromRest(frame.hips).padStart(4)} ${ankles}`;
  const lean = `lean ${((frame.lean * 180) / Math.PI).toFixed(0).padStart(3)}°`;
  return `        ${String(at).padStart(3)} ${frame.speed.toFixed(2).padStart(5)} m/s ${where} ${frame.feet} ${lean}`;
}

/** Whether a stop stepped once its body was still, put a foot out and drew it back, stepped back, stood a foot off
 *  the body's level once still or to the end, or had both feet up. */
const STOP_FAULTS = {
  stepsStill: (result: StopResult) => stepsWhenStill(result).length > 0,
  drawnBack: (result: StopResult) => feetDrawnBack(result).length > 0,
  stepsBack: (result: StopResult) => stepsBack(result).length > 0,
  offLevel: (result: StopResult) => result.offLevel[0] + result.offLevel[1] > 0,
  endsOffLevel: (result: StopResult) => result.endsOffLevel[0] || result.endsOffLevel[1],
  bothUp: (result: StopResult) => result.bothUp > 0,
  relevel: (result: StopResult) => stepsOntoAnotherLevel(result).length > 0,
};

/** The stops of a scenario that did `what`, as a count and their names (keys and frames). */
function countOf(results: StopResult[], what: (result: StopResult) => boolean): string {
  const found = results.filter(what);
  const names = found.map((result) => result.run.name);
  return found.length ? `${found.length} (${names.join(', ')})` : '0';
}

/** The median of some values. */
function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/** The report's lines for one scenario. */
function describeScenario(scenario: StopScenario, results: StopResult[], seconds: number, options: StopsOptions):
  string[] {
  const lines = [`${scenario.what}: ${results.length} stops`];
  const stillSteps = results.map((result) => stepsWhenStill(result).length);
  const settle = results.filter((result) => result.settledAt >= 0).map((result) => result.settledAt * seconds);
  const travel = results.map((result) => result.travelStill);
  const allStill = stillSteps.reduce((sum, count) => sum + count, 0);
  const mostStill = Math.max(0, ...stillSteps);
  lines.push(`  steps once the body was still: ${allStill} in all, up to ${mostStill} a stop;`
    + ` in stops ${countOf(results, STOP_FAULTS.stepsStill)}`);
  const drawnBack = countOf(results, STOP_FAULTS.drawnBack);
  lines.push(`  a foot put out ahead and drawn back over ${cm(DRAWN_BACK)} cm: ${drawnBack}`);
  lines.push(`  a step back against the way: ${countOf(results, STOP_FAULTS.stepsBack)}`);
  lines.push(`  once still, a foot on another level than the body's: ${countOf(results, STOP_FAULTS.offLevel)};`
    + ` ending so: ${countOf(results, STOP_FAULTS.endsOffLevel)}`);
  lines.push(`  once still, a foot stepped from one level onto another: ${countOf(results, STOP_FAULTS.relevel)}`);
  lines.push(`  both feet up once one had landed: ${countOf(results, STOP_FAULTS.bothUp)}`);
  const settleMedian = median(settle).toFixed(2);
  const settleLatest = Math.max(0, ...settle).toFixed(2);
  lines.push(`  the feet settled ${settleMedian} s after letting go (the median), the latest ${settleLatest};`
    + ` their travel once still ${cm(median(travel))} cm (the median), the most ${cm(Math.max(0, ...travel))}`);
  const trace = Boolean(options.trace);
  if (options.frames) lines.push(...results.flatMap((result) => describeStop(result, seconds, trace)));
  return lines;
}

/**
 * Runs the scenarios asked for, each stop set up afresh, and judges each as a person stops.
 */
export async function stops(lab: Lab, options: StopsOptions): Promise<StopsReport> {
  const asked = options.scenarios?.length ? options.scenarios : STOP_SCENARIOS;
  const seconds = window.__labClock.frame / 1000;
  const lines: string[] = [];
  for (const scenario of SCENARIOS.filter((candidate) => asked.includes(candidate.name))) {
    const results: StopResult[] = [];
    const runs = scenario.runs.filter((run) => !options.only || run.name.includes(options.only));
    if (!runs.length) continue;
    for (const run of runs) results.push(await runStop(lab, run));
    lines.push(...describeScenario(scenario, results, seconds, options));
  }
  lines.push('a person: stops in a step or two as the body slows, the last foot landing under it or beside the other on'
    + ' the ground it stands on; once still, nothing moves');
  return { lines };
}
