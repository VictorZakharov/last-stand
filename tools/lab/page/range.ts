// `lab range`: every joint of the hero against a body's ranges (`models/anatomy.ts`), frame by frame, as the game's dev
// builds watch them (`watchBody`), over standing, walking each way, shooting and walks that change direction while he
// shoots or runs. Each angle past its range: on how many frames, the worst and where (the scenario, the frame, and for
// a leg whether its foot was planted), and the worst moment of each scenario pictured. A canary turns the head round
// past the neck's range on one frame, which the measure must catch.
import * as THREE from 'three';
import type { Lab, Pictured } from './lab';
import {
  breaches, elevationLimit, measureBody, rotationRange, type BodyAngles, type Breach,
} from '../../../src/entities/models/anatomy';
import type { Joints } from '../../../src/entities/models/rig';
import type { LegIK } from '../../../src/entities/models/ik';

/** A hand as it is turned in its grip: the group of its own meshes under the joint, as `watchBody` measures it. */
function turnedHand(hand: THREE.Object3D): THREE.Object3D {
  const own = (child: THREE.Object3D) => (child as THREE.Mesh).isMesh && child.userData.own;
  return hand.children.find((child) => (child as THREE.Group).isGroup && child.children.some(own)) ?? hand;
}

/** The body's angles now, and the joints past their ranges, the worst first. */
interface BodyNow {
  angles: BodyAngles;
  found: Breach[];
}

/** The body's angles and the joints past their ranges now, measured as the game's dev builds measure them
 *  (`watchBody`; with the module's own exports alone, so an A/B's side on an older commit measures the same). */
function bodyBreaches(joints: Joints): BodyNow {
  joints.root.updateMatrixWorld(true);
  const angles = measureBody(joints, { L: turnedHand(joints.handL), R: turnedHand(joints.handR) });
  return { angles, found: breaches(angles) };
}

/** One leg of a scenario: the keys held, the attack (held, tapped or not), for how many frames. */
interface RangeLeg {
  keys: string[];
  attack: boolean | 'taps';
  frames: number;
}

interface RangeScenario {
  name: string;
  /** what it is, as the report says it */
  what: string;
  legs: RangeLeg[];
}

const legOf = (keys: string[], attack: RangeLeg['attack'], frames: number): RangeLeg => ({ keys, attack, frames });

/** a tapped attack: pressed this many frames, then let go this many (a bow's tap looses at its least draw) */
const TAP_DOWN = 6, TAP_UP = 12;

/** the zigzag a reversal makes: left, right, back and forth, and the diagonals */
const ZIGZAG = [['a'], ['d'], ['a'], ['d'], ['w'], ['s'], ['w'], ['s'], ['a', 'w'], ['d', 's'], ['a', 's'], ['d', 'w']];

const SCENARIOS: RangeScenario[] = [
  { name: 'stand', what: 'standing', legs: [legOf([], false, 120)] },
  {
    name: 'walk',
    what: 'walking forwards, back and to each side',
    legs: [['w'], ['s'], ['a'], ['d']].map((keys) => legOf(keys, false, 80)),
  },
  {
    name: 'shoot',
    what: 'attacking standing: held, let go, again',
    legs: [legOf([], true, 80), legOf([], false, 50), legOf([], true, 80), legOf([], false, 50)],
  },
  {
    name: 'reverse',
    what: 'attacking while the walk changes direction',
    legs: ZIGZAG.map((keys) => legOf(keys, true, 25)),
  },
  {
    name: 'taps',
    what: 'tapping attacks while the walk changes direction',
    legs: ZIGZAG.map((keys) => legOf(keys, 'taps', 30)),
  },
  {
    name: 'run',
    what: 'running reversals: left and right again',
    legs: [['a'], ['d'], ['a'], ['d']].map((keys) => legOf(keys, false, 40)),
  },
];

/** The scenarios `lab range` can run, by name. */
export const RANGE_SCENARIOS = SCENARIOS.map((scenario) => scenario.name);

/** What `lab range` is asked for. */
export interface RangeOptions {
  /** the scenarios to run (all when empty) */
  scenarios?: string[];
  /** turn the head past the neck's range on one frame, which must be caught */
  canary?: boolean;
  /** list each frame with a joint past its range */
  frames?: boolean;
}

/** where every scenario starts: open ground, facing +z */
const START: [number, number] = [14, 17];
/** a scenario's worst moment is pictured once a joint is this far past its range (degrees) */
const PICTURE_FROM = 5;
/** the canary's frame, and how far it turns the head (rad) */
const CANARY_FRAME = 60;
const CANARY_TURN = 2.4;
/** the canary is caught when the neck reads at least this far past its range (degrees) */
const CANARY_CAUGHT = 40;

/** One angle past its range over the run: on how many frames, and its worst. */
interface AngleRecord {
  name: string;
  frames: number;
  worst: Breach;
  where: string;
}

/** Whether the attack is down on this frame of a leg. */
function attackDown(leg: RangeLeg, frame: number): boolean {
  if (leg.attack !== 'taps') return leg.attack;
  return frame % (TAP_DOWN + TAP_UP) < TAP_DOWN;
}

/** What `lab range` found: its lines, its pictured moments, and the canary. */
export interface RangeReport {
  lines: string[];
  moments: Pictured[];
  canary?: { caught: boolean; measured: number };
}

const degrees = (value: number) => value.toFixed(0);

/** For a leg's angle, whether that leg's foot was planted (as the leg IK has it), else nothing. */
function footOf(lab: Lab, name: string): string {
  const legs = lab.model.root.userData.legs as LegIK | undefined;
  const leg = /^(hip|knee|ankle)([LR])\./.exec(name);
  if (!legs || !leg) return '';
  const foot = legs.feet[leg[2] === 'L' ? 0 : 1];
  return foot.state === 'plant' ? ', its foot planted' : ', its foot in the air';
}

/** For a shoulder past its range, its raise, the plane it rises in and its turn, against what each allows (a raise
 *  or a turn can take it past), else nothing. */
function armOf(angles: BodyAngles, name: string): string {
  const shoulder = /^shoulder([LR])\.excess$/.exec(name);
  if (!shoulder) return '';
  const side = shoulder[1];
  const raise = angles[`shoulder${side}.elevation`];
  const plane = angles[`shoulder${side}.plane`];
  const turn = angles[`shoulder${side}.rotation`];
  const [turnLeast, turnMost] = rotationRange(raise);
  return `, raised ${degrees(raise)}° (at most ${degrees(elevationLimit(plane))} in its plane ${degrees(plane)}°)`
    + `, turned ${degrees(turn)}° (${degrees(turnLeast)}..${degrees(turnMost)})`;
}

/** Where a breach is, past its scenario and frame: a leg's foot planted or not, a shoulder's raise and turn. */
function contextOf(lab: Lab, angles: BodyAngles, name: string): string {
  return footOf(lab, name) + armOf(angles, name);
}

/** Counts `breach` in its angle's record, keeping it (and `where`) if it's the worst yet. */
function keepBreach(records: Map<string, AngleRecord>, breach: Breach, where: string): void {
  const record = records.get(breach.name);
  if (!record) {
    records.set(breach.name, { name: breach.name, frames: 1, worst: breach, where });
    return;
  }
  record.frames++;
  if (breach.by > record.worst.by) {
    record.worst = breach;
    record.where = where;
  }
}

function describeBreach(breach: Breach): string {
  const range = breach.name.endsWith('.excess') ? 'the raise its plane allows' : `${breach.min}..${breach.max}`;
  return `${breach.name} ${degrees(breach.value)}° (${degrees(breach.by)} past ${range})`;
}

/** Turns the head past the neck's range for one measure, and back. Returns how far past the neck read. */
function measureCanary(lab: Lab): number {
  const neck = lab.joints.neck;
  neck.rotation.y += CANARY_TURN;
  const found = bodyBreaches(lab.joints).found.find((breach) => breach.name === 'neck.rotation');
  neck.rotation.y -= CANARY_TURN;
  lab.joints.root.updateMatrixWorld(true);
  return found?.by ?? 0;
}

/** What one scenario's run keeps as it goes. */
interface ScenarioRun {
  frame: number;
  framesPast: number;
  worstHere: number;
  moment: Pictured | null;
  /** each ankle's fastest move in a frame (m) and where */
  fastest: number;
  fastestAt: string;
}

/** Runs one scenario, set up afresh where every scenario starts, counting what it finds into `records`. */
async function runScenario(
  lab: Lab, scenario: RangeScenario, options: RangeOptions, records: Map<string, AngleRecord>, report: RangeReport,
  listed: string[],
): Promise<void> {
  await lab.setup({ at: START, facing: 0, nocked: Boolean(lab.player.cls.quiver) });
  const run: ScenarioRun = { frame: 0, framesPast: 0, worstHere: PICTURE_FROM, moment: null, fastest: 0, fastestAt: '' };
  const ankles = [lab.joints.ankleL, lab.joints.ankleR];
  const last = ankles.map((ankle) => ankle.getWorldPosition(new THREE.Vector3()));
  const measure = () => {
    if (options.canary && !report.canary && run.frame === CANARY_FRAME) {
      const measured = measureCanary(lab);
      report.canary = { caught: measured >= CANARY_CAUGHT, measured };
    }
    const { angles, found } = bodyBreaches(lab.joints);
    if (found.length) run.framesPast++;
    for (const breach of found) {
      keepBreach(records, breach, `${scenario.name} frame ${run.frame}${contextOf(lab, angles, breach.name)}`);
    }
    if (found.length && options.frames) {
      listed.push(`  ${scenario.name} frame ${run.frame}: ${found.map(describeBreach).join(', ')}`);
    }
    if (found.length && found[0].by > run.worstHere) {
      run.worstHere = found[0].by;
      const notes = [`frame ${run.frame}`, describeBreach(found[0]) + contextOf(lab, angles, found[0].name)];
      run.moment = lab.picture(`${scenario.what}, worst`, ['third', 'front', 'left'], notes);
    }
    ankles.forEach((ankle, side) => {
      const now = ankle.getWorldPosition(new THREE.Vector3());
      const moved = now.distanceTo(last[side]);
      last[side].copy(now);
      if (run.frame === 0 || moved <= run.fastest) return;
      run.fastest = moved;
      run.fastestAt = `frame ${run.frame}, ${side ? 'R' : 'L'}${footOf(lab, `ankle${side ? 'R' : 'L'}.`)}`;
    });
    run.frame++;
  };
  for (const leg of scenario.legs) {
    await lab.step(leg.frames, (f) => ({ keys: leg.keys, m0: attackDown(leg, f) }), measure);
  }
  const fastest = `fastest ankle ${(run.fastest * 100).toFixed(1)} cm a frame (${run.fastestAt})`;
  report.lines.push(`${scenario.what}: ${run.frame} frames, ${run.framesPast} with a joint past its range; ${fastest}`);
  if (run.moment) report.moments.push(run.moment);
}

/**
 * Runs the scenarios asked for, one after another (each set up afresh where they start), and reports every angle the
 * body took past its range.
 */
export async function range(lab: Lab, options: RangeOptions): Promise<RangeReport> {
  const asked = options.scenarios?.length ? options.scenarios : RANGE_SCENARIOS;
  const records = new Map<string, AngleRecord>();
  const report: RangeReport = { lines: [], moments: [] };
  const listed: string[] = [];
  for (const scenario of SCENARIOS.filter((candidate) => asked.includes(candidate.name))) {
    await runScenario(lab, scenario, options, records, report, listed);
  }
  const worstFirst = [...records.values()].sort((a, b) => b.worst.by - a.worst.by);
  report.lines.push(worstFirst.length ? 'past their ranges, the worst first:' : 'every joint within its range');
  for (const record of worstFirst) {
    report.lines.push(`  ${describeBreach(record.worst)} on ${record.frames} frames, the worst in ${record.where}`);
  }
  report.lines.push(...listed);
  if (report.canary) {
    const verdict = report.canary.caught ? 'caught' : 'MISSED';
    const past = degrees(report.canary.measured);
    report.lines.push(`canary, the head turned past the neck's range: ${verdict} (${past} past)`);
  }
  return report;
}

/** The canary, if it ran and was missed, as a problem. */
export function missedRangeCanary(report: RangeReport): string[] {
  return report.canary && !report.canary.caught ? ['range: the canary (the head turned past its range) was missed'] : [];
}
