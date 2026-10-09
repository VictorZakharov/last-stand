// The leg IK as the lab reads it (`models/ik.ts`): its plan and its walk cycle this frame, and a trace of it frame by
// frame (`--trace`, `--span`), which `lab gait` and `lab range` list after their scenarios: the way the body faces
// and goes, the pelvis, the hips' drop, the cycle, and each foot (down, in the air or in a timed step, dragged, out of
// reach, where in its window) with its ankle's move. What an A/B's older side doesn't keep is left out.
import * as THREE from 'three';
import type { Lab } from './lab';
import type { LegIK } from '../../../src/entities/models/ik';

/** The frames a trace lists, from the first to the last. */
export type TraceSpan = [number, number];

/** What a command is asked to trace: whether, and only which frames. */
export interface TraceOptions {
  trace?: boolean;
  span?: [number, number];
}

/** One traced frame: its number and its line. */
export interface TracedFrame {
  frame: number;
  line: string;
}

const cm = (metres: number) => (metres * 100).toFixed(1);
const degreesOf = (radians: number) => ((radians * 180) / Math.PI).toFixed(0);
const SIDES = ['L', 'R'] as const;

/** The frames to trace as the options ask, or none. */
export function traceSpanOf(options: TraceOptions): TraceSpan | null {
  if (!options.trace) return null;
  return options.span ?? [0, Infinity];
}

/** The leg IK's plan for this frame, as it keeps it: the share of the cycle a foot is down, and the cycle (s). */
export function planOf(legs: LegIK): { duty: number; cycle: number } {
  const frame = (legs as unknown as { frame?: { duty?: number; cycle?: number } }).frame;
  return { duty: frame?.duty ?? 0, cycle: frame?.cycle ?? 0 };
}

/** The walk cycle as the leg IK reads it, where it says (an A/B's older side may not). */
export function cycleOf(legs: LegIK): { phase: number; rate: number; backing: boolean } | null {
  return (legs as { cycleNow?: { phase: number; rate: number; backing: boolean } }).cycleNow ?? null;
}

/** A foot this frame, for a trace: planted (`_`, with how far its spot is from its hip over the ground, cm, `!` out
 *  of reach and `d` dragged), in the air (`^`, with its stride's progress) or in a timed step (`~`), and where it is
 *  in its window. */
function traceFoot(lab: Lab, legs: LegIK, side: number, motion: string): string {
  const foot = legs.feet[side];
  const window = (foot as { window?: number }).window;
  const where = window === undefined ? '' : ` w${window.toFixed(2)}`;
  const hip = (side === 0 ? lab.joints.thighL : lab.joints.thighR).getWorldPosition(new THREE.Vector3());
  const fromHip = Math.hypot(foot.P.x - hip.x, foot.P.z - hip.z);
  const dragged = (foot as { dragged?: boolean }).dragged ? 'd' : ' ';
  const planted = `_${cm(fromHip).padStart(5)}${foot.over ? '!' : ' '}${dragged}`;
  const mark = foot.state === 'timed' ? '~' : '^';
  const doing = foot.state === 'plant' ? planted : `${mark}${foot.t.toFixed(2)}`;
  return `${SIDES[side]}${doing.padEnd(9)}${where.padEnd(7)} ${motion}`;
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
 *  ground (`speed`, m/s), the hips' drop and the plan, the cycle's phase (a share of a cycle) and rate, backing or
 *  not, and each foot. */
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

/**
 * Follows the leg IK frame by frame and keeps a line for each frame of `span` (`frames`): set up once a scenario is,
 * and told each frame after the game has stepped (`observe`).
 */
export class LegTrace {
  /** the frames traced so far, in order */
  readonly frames: TracedFrame[] = [];
  /** each ankle where it was last frame and the frame before */
  private anklesWere: THREE.Vector3[] = [];
  private anklesBefore: THREE.Vector3[] = [];
  private lastAt: THREE.Vector3;
  private readonly seconds: number;

  constructor(private readonly lab: Lab, private readonly legs: LegIK, private readonly span: TraceSpan) {
    this.lastAt = new THREE.Vector3(lab.player.pos.x, 0, lab.player.pos.z);
    this.seconds = window.__labClock.frame / 1000;
  }

  /** Notes this frame (its number in the scenario): its line if it is one the span lists. */
  observe(frame: number): void {
    const lab = this.lab;
    const at = new THREE.Vector3(lab.player.pos.x, 0, lab.player.pos.z);
    const speed = at.distanceTo(this.lastAt) / this.seconds;
    this.lastAt.copy(at);
    const ankles = [lab.joints.ankleL, lab.joints.ankleR].map((ankle) => ankle.getWorldPosition(new THREE.Vector3()));
    const motions = ankles.map((ankle, side) => {
      return ankleMotion(ankle, this.anklesWere[side], this.anklesBefore[side], this.seconds);
    });
    if (frame >= this.span[0] && frame <= this.span[1]) {
      this.frames.push({ frame, line: traceLine(lab, frame, this.legs, speed, motions) });
    }
    this.anklesBefore = this.anklesWere;
    this.anklesWere = ankles;
  }
}
