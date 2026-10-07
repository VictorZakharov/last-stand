// tools/lab carry: the ranger's carried bow against his body, through a carry's whole round with an arrow on the
// string: standing, walking, standing, a draw from the carry and its shot, waiting with the next arrow, and putting
// it back. Each frame, rays run along the string, the limbs' middles and the nocked arrows against the body's meshes
// as they are drawn. Each crossing of a mesh is a clip: the coat's skirt is one sheet and the bracer an open tube,
// so what lies between two crossings isn't the measure, the crossings are. Beside them: the bow arm's clearance of
// the string (its forearm and upper arm as capsules), its elbow's side of the bow's plane, and its joints past their
// ranges.
import * as THREE from 'three';
import type { Lab } from './lab';
import type { Bow } from '../../../src/entities/models/bow';
import { measureBody, breaches } from '../../../src/entities/models/anatomy';
import { G } from '../../../src/state';
import { BakedBody, addCrossings, crossingsAlong, isUnder, segmentDistance, type Crossing } from './geometry';
import { bowOf } from './ranger';

/** A stretch of the round: how many frames, and what the player holds through it. */
interface Phase {
  name: string;
  frames: number;
  keys: string[];
  draw: boolean;
}

const ROUND: Phase[] = [
  { name: 'stand', frames: 40, keys: [], draw: false },
  { name: 'walk', frames: 70, keys: ['w'], draw: false },
  { name: 'stand', frames: 30, keys: [], draw: false },
  { name: 'draw', frames: 20, keys: [], draw: true },
  { name: 'shot', frames: 40, keys: [], draw: false },
];
/** frames measured once he starts putting the arrow back */
const STOW_FRAMES = 150;

/** the bow arm's forearm (with its bracer) and upper arm as capsules: their radii (m) */
const FOREARM_RADIUS = 0.059;
const UPPER_ARM_RADIUS = 0.073;

/** the draw hand's fingers hold the string and the nock: what's in that hand doesn't count */
const DRAW_HAND = /^handR\//;

/** a nocked arrow's ends in its own frame: the nock behind the string, the head (m) */
const ARROW_NOCK = new THREE.Vector3(0, 0, -0.44);
const ARROW_HEAD = new THREE.Vector3(0, 0, 0.48);

/** a line measured against the body, its two ends in the world */
type Segment = [THREE.Vector3, THREE.Vector3];

/** One frame's measure. */
interface FrameMeasure {
  phase: string;
  string: Map<string, Crossing>;
  limbs: Map<string, Crossing>;
  arrows: Map<string, Crossing>;
  /** clearance of the string, cm (negative: into the arm) */
  forearm: number;
  upperArm: number;
  /** the bow arm's elbow off the bow's plane, cm */
  elbowSide: number;
  /** the bow arm's joints past their ranges, degrees past */
  pastRange: Record<string, number>;
  /** a canary's planted fault was measured in this frame */
  planted: boolean;
}

/** The worst of a part's clips over a phase: the deepest (cm inside; 0 for a line through a sheet's edge) and on
 *  how many frames. */
interface PartClips {
  deepest: number;
  frames: number;
}

/** A phase's frames summed. */
export interface PhaseSummary {
  frames: number;
  clipFrames: number;
  forearm: number;
  forearmInto: number;
  upperArm: number;
  elbowSide: [number, number];
  string: Record<string, PartClips>;
  limbs: Record<string, PartClips>;
  arrows: Record<string, PartClips>;
  pastRange: Record<string, number>;
}

export interface CarryReport {
  phases: Record<string, PhaseSummary>;
  /** frames with any clip, the shot's own frames aside */
  clipFrames: number;
  /** what the round did, checked */
  checks: string[];
  /** with a canary: [planted frames caught, planted frames] */
  canary?: [number, number];
}

export interface CarryOptions {
  canary?: boolean;
}

/** metres to centimetres, to a millimetre */
const centimetres = (metres: number) => Number((metres * 100).toFixed(1));

/** true when a held arrow (the one in the draw hand) is the object or among its parents */
function isHeldArrow(object: THREE.Object3D): boolean {
  for (let o: THREE.Object3D | null = object; o; o = o.parent) {
    if (o.name === 'heldArrow') return true;
  }
  return false;
}

/** Measures one frame as it would be drawn. */
class CarryMeasure {
  private readonly body: BakedBody;

  constructor(private readonly lab: Lab, private readonly bow: Bow) {
    const away = (mesh: THREE.Mesh) => isUnder(mesh, bow.group) || isHeldArrow(mesh);
    this.body = new BakedBody(lab.model.root, lab.joints, (mesh) => !away(mesh));
  }

  measure(phase: string, planted: boolean): FrameMeasure {
    const { lab, bow } = this;
    const joints = lab.joints;
    lab.model.root.updateMatrixWorld(true);
    const world = (local: THREE.Vector3) => bow.group.localToWorld(local.clone());

    // the string: from the top tip to the stretch the fingers hold, that stretch, and on to the bottom tip
    const nockTop = world(bow.nock.clone().setY(bow.nock.y + bow.hold));
    const nockBottom = world(bow.nock.clone().setY(bow.nock.y - bow.hold));
    const strings: Segment[] = [
      [world(bow.tipU), nockTop],
      [nockTop, nockBottom],
      [nockBottom, world(bow.tipL)],
    ];
    const limbLines: Segment[] = [];
    for (const top of [true, false]) {
      const line = bow.limbLine(top).map(world);
      for (let i = 0; i + 1 < line.length; i++) limbLines.push([line[i], line[i + 1]]);
    }
    const arrowLines: Segment[] = [];
    for (const arrow of bow.arrows) {
      if (!arrow.visible) continue;
      arrowLines.push([arrow.localToWorld(ARROW_NOCK.clone()), arrow.localToWorld(ARROW_HEAD.clone())]);
    }

    // (only the meshes that may reach the lines are baked: most of the body is nowhere near the bow)
    const ends = [...strings, ...limbLines, ...arrowLines].flat();
    const meshes = this.body.bake(new THREE.Sphere().setFromPoints(ends));
    const crossingsOf = (segments: Segment[], skip?: RegExp) => {
      const total = new Map<string, Crossing>();
      for (const [a, b] of segments) addCrossings(total, crossingsAlong(meshes, a, b, skip));
      return total;
    };
    const string = crossingsOf(strings, DRAW_HAND);
    const limbs = crossingsOf(limbLines);
    const arrows = crossingsOf(arrowLines, DRAW_HAND);

    const at = (joint: THREE.Object3D) => joint.getWorldPosition(new THREE.Vector3());
    const shoulder = at(joints.shoulderL);
    const elbow = at(joints.elbowL);
    const wrist = at(joints.handL);
    const clearance = (a: THREE.Vector3, b: THREE.Vector3, radius: number) => {
      const nearest = Math.min(...strings.map(([p, q]) => segmentDistance(a, b, p, q)));
      return centimetres(nearest - radius);
    };

    const pastRange: Record<string, number> = {};
    for (const breach of breaches(measureBody(joints), 0)) {
      if (/L\./.test(breach.name) && /shoulder|elbow|forearm|wrist/.test(breach.name)) {
        pastRange[breach.name] = Math.round(breach.by);
      }
    }

    return {
      phase,
      string,
      limbs,
      arrows,
      forearm: clearance(elbow, wrist, FOREARM_RADIUS),
      upperArm: clearance(shoulder, elbow, UPPER_ARM_RADIUS),
      elbowSide: centimetres(bow.group.worldToLocal(elbow.clone()).x),
      pastRange,
      planted,
    };
  }
}

/**
 * A canary: on every 50th frame standing or walking, the bow is moved into the hips for that frame's measure alone.
 * Each such frame must show as a clip, or the measure sees nothing.
 */
class Canary {
  constructor(private readonly lab: Lab, private readonly bow: Bow, private readonly on: boolean) {}

  /** plants the fault if this frame takes one; returns the undo, or null */
  plant(frame: number, phase: string): (() => void) | null {
    if (!this.on || frame % 50 !== 25 || (phase !== 'stand' && phase !== 'walk')) return null;
    const group = this.bow.group;
    const hips = this.lab.joints.hips.getWorldPosition(new THREE.Vector3());
    const move = group.parent!.worldToLocal(hips).sub(group.position);
    group.position.add(move);
    group.updateMatrixWorld(true);
    return () => {
      group.position.sub(move);
      group.updateMatrixWorld(true);
    };
  }
}

/** Runs the carry's round and measures every frame of it. */
export async function carry(lab: Lab, options: CarryOptions = {}): Promise<CarryReport> {
  const bow = bowOf(lab);
  if (!bow) throw new Error("lab: carry: the hero has no bow with a lab handle (the ranger's, models/ranger.ts)");
  if (lab.player.nocked < 1) throw new Error('lab: carry: no arrow on the string to carry (set up with nocked)');
  const measure = new CarryMeasure(lab, bow);
  const canary = new Canary(lab, bow, !!options.canary);
  const rows: FrameMeasure[] = [];
  let frame = 0;
  const measureFrame = (phase: string) => {
    const undo = canary.plant(frame, phase);
    rows.push(measure.measure(phase, undo !== null));
    undo?.();
    frame++;
  };

  const player = lab.player;
  const start = player.pos.clone();
  const projectilesBefore = G.projectiles.length;
  let drew = false;
  let loosed = false;
  for (const phase of ROUND) {
    const phaseStart = player.pos.clone();
    const input = () => ({ keys: phase.keys, m0: phase.draw });
    await lab.step(phase.frames, input, () => {
      if (phase.name === 'draw' && player.casting) drew = true;
      if (G.projectiles.length > projectilesBefore) loosed = true;
      measureFrame(phase.name);
    });
    if (phase.name === 'walk' && player.pos.distanceTo(phaseStart) < 1) {
      throw new Error('lab: carry: the hero never walked');
    }
  }
  if (!drew) throw new Error('lab: carry: the draw never began');
  if (!loosed) throw new Error('lab: carry: the arrow was never loosed');

  const waitStart = frame;
  const putBack = () => player.nocked < 1 && !player.casting;
  await lab.until(() => {
    measureFrame('wait');
    return putBack();
  }, 900, 'carry: the next arrow was never put back');
  const waited = (frame - waitStart) / 60;
  await lab.step(STOW_FRAMES, undefined, () => measureFrame('stow'));

  const report = summarize(rows);
  report.checks.push(
    `walked ${player.pos.distanceTo(start).toFixed(1)} m, drew and loosed, ` +
    `then stood ${waited.toFixed(1)} s with the next arrow before putting it back`,
  );
  return report;
}

function isClip(row: FrameMeasure): boolean {
  return row.string.size + row.limbs.size + row.arrows.size > 0 || row.forearm < 0;
}

function emptySummary(): PhaseSummary {
  return {
    frames: 0,
    clipFrames: 0,
    forearm: Infinity,
    forearmInto: 0,
    upperArm: Infinity,
    elbowSide: [Infinity, -Infinity],
    string: {},
    limbs: {},
    arrows: {},
    pastRange: {},
  };
}

function addPartClips(into: Record<string, PartClips>, crossings: Map<string, Crossing>): void {
  for (const [label, crossing] of crossings) {
    const part = into[label] ?? { deepest: 0, frames: 0 };
    part.deepest = Math.max(part.deepest, centimetres(crossing.inside));
    part.frames++;
    into[label] = part;
  }
}

/** Sums the frames by phase, and counts what a canary planted. */
function summarize(rows: FrameMeasure[]): CarryReport {
  const phases: Record<string, PhaseSummary> = {};
  let clipFrames = 0;
  let planted = 0;
  let caught = 0;
  for (const row of rows) {
    if (row.planted) {
      planted++;
      if (isClip(row)) caught++;
      continue;
    }
    const summary = phases[row.phase] ??= emptySummary();
    summary.frames++;
    if (isClip(row)) {
      summary.clipFrames++;
      if (row.phase !== 'shot') clipFrames++;
    }
    summary.forearm = Math.min(summary.forearm, row.forearm);
    if (row.forearm < 0) summary.forearmInto++;
    summary.upperArm = Math.min(summary.upperArm, row.upperArm);
    summary.elbowSide = [Math.min(summary.elbowSide[0], row.elbowSide), Math.max(summary.elbowSide[1], row.elbowSide)];
    addPartClips(summary.string, row.string);
    addPartClips(summary.limbs, row.limbs);
    addPartClips(summary.arrows, row.arrows);
    for (const [joint, degrees] of Object.entries(row.pastRange)) {
      summary.pastRange[joint] = Math.max(summary.pastRange[joint] ?? 0, degrees);
    }
  }
  const report: CarryReport = { phases, clipFrames, checks: [] };
  if (planted > 0) report.canary = [caught, planted];
  return report;
}

function describeParts(parts: Record<string, PartClips>): string {
  const entries = Object.entries(parts);
  if (entries.length === 0) return 'clear';
  const depth = (clip: PartClips) => (clip.deepest > 0 ? `${clip.deepest.toFixed(1)} cm` : 'crossing');
  return entries.map(([label, clip]) => `${label} ${depth(clip)} on ${clip.frames} f`).join(', ');
}

/** The report as text, a few lines a phase. */
export function describeCarry(report: CarryReport): string {
  const lines = [`frames with a clip (the shot's own frames aside): ${report.clipFrames}`, ...report.checks];
  if (report.canary) {
    const [caught, planted] = report.canary;
    const missed = caught < planted ? '  <-- THE MEASURE MISSES CLIPS' : '';
    lines.push(`canary: caught ${caught} of ${planted} planted frames${missed}`);
  }
  for (const [name, phase] of Object.entries(report.phases)) {
    const pastRange = Object.entries(phase.pastRange).map(([joint, by]) => `${joint} +${by}°`).join(', ') || 'none';
    const [elbowFrom, elbowTo] = phase.elbowSide.map((cm) => cm.toFixed(0));
    lines.push(
      `${name}: ${phase.clipFrames} of ${phase.frames} frames clip`,
      `  forearm ${phase.forearm.toFixed(1)} cm clear of the string (into it on ${phase.forearmInto} f), ` +
        `upper arm ${phase.upperArm.toFixed(1)} cm; elbow ${elbowFrom} to ${elbowTo} cm off the bow's plane`,
      `  string: ${describeParts(phase.string)}`,
      `  limbs: ${describeParts(phase.limbs)}`,
      `  arrow: ${describeParts(phase.arrows)}`,
      `  past a range: ${pastRange}`,
    );
  }
  return lines.join('\n');
}
