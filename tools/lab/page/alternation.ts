// The legs' alternation judged as gait analysis judges it, continuously and step by step, for `lab gait`: each
// thigh's swing along the way the body goes, frame by frame, and the stretches both swing forward at once (a
// person's never do, walking or running: one thigh drives forward while the other goes back), and the steps'
// evenness, each step's time from the other foot's landing against the next one's (a runner's are within 1 to 2% of
// each other). The gallops, a foot leaving within a share of a stride of the other's, say yes or no at one moment of
// a stride: a stride a little inside the share's edge passes, where the eye sees both legs driving forward together.
//
// The measure is run over a runner's own thighs too (`runner.ts`'s curves, after Novacheck 1998 and Fukuchi et al.
// 2017), at a jog and a fast run: half a stride apart it must find them never together, and a quarter of a stride
// apart, a gallop's, about a sixth of the stride (its canary, `runnerCanary`).
import * as THREE from 'three';
import type { Joints } from '../../../src/entities/models/rig';
import { runnerAt } from './runner';

/** a thigh swings forward when faster than this share of the fastest either thigh swung forward lately (a runner's
 *  thighs half a stride apart never swing forward together by 0.35 of their peak at a jog or a fast run; 0.4 of a
 *  stride apart, 2% of the stride; a quarter apart, 17%) */
const FORWARD_SHARE = 0.4;
/** how long the fastest swing forward is remembered (s: more than a walk's cycle) */
const PEAK_SPAN = 1.2;
/** slower than this (deg/s) a thigh isn't swinging, however slow the rest are (a body coming to a stop) */
const SWING_LEAST = 40;
/** a step's time against the next's differing by more than this share of their mean is uneven: one step 0.4 of the
 *  two, the other 0.6 */
const UNEVEN = 0.4;
/** a step taking longer than this isn't one of a walk's or a run's (s: a slow walk's is about 0.55) */
const STEP_MOST = 0.65;
/** the runner's speeds the canary runs at (m/s, a man's), how many cycles, and its frames a second */
const CANARY_SPEEDS = [3.5, 6.5];
const CANARY_CYCLES = 3;
const CANARY_RATE = 60;
/** a gallop's legs, a quarter of a stride apart, swing forward together at least this share of the stride */
const CANARY_LEAST = 0.08;

/** The frames both thighs swung forward at once, out of the frames the body moved. */
export class TogetherWatch {
  /** the frames the body moved, and those of them with both thighs swinging forward at once */
  moving = 0;
  readonly together: number[] = [];
  private readonly peaks: { at: number; speed: number }[] = [];

  /** A frame: each thigh's swing forward (deg/s, along the way the body goes), or none with the body standing. */
  observe(frame: number, seconds: number, swings: [number, number] | null): void {
    if (!swings) return;
    this.moving++;
    const now = frame * seconds;
    this.peaks.push({ at: now, speed: Math.max(swings[0], swings[1]) });
    while (this.peaks.length && this.peaks[0].at < now - PEAK_SPAN) this.peaks.shift();
    const peak = Math.max(...this.peaks.map((each) => each.speed));
    const least = Math.max(SWING_LEAST, FORWARD_SHARE * peak);
    if (swings[0] > least && swings[1] > least) this.together.push(frame);
  }
}

/** Each thigh's swing forward along the way the body goes, from its line hip to knee a frame apart. */
export class ThighSwings {
  private readonly last: (THREE.Vector3 | null)[] = [null, null];

  /**
   * This frame's swings (deg/s, forward along `way` positive), or none while the body stands (`way` null) or on the
   * first frame. Both frames' lines are read along this frame's way, so the way turning isn't read as a swing.
   */
  read(joints: Joints, way: THREE.Vector2 | null, seconds: number): [number, number] | null {
    const lines = [lineOf(joints.thighL, joints.kneeL), lineOf(joints.thighR, joints.kneeR)];
    const before = [...this.last];
    this.last[0] = lines[0];
    this.last[1] = lines[1];
    if (!way || !before[0] || !before[1]) return null;
    const swing = (side: number, was: THREE.Vector3) => {
      return (thighAngle(lines[side], way) - thighAngle(was, way)) / seconds;
    };
    return [swing(0, before[0]), swing(1, before[1])];
  }
}

/** A thigh's line in the world, hip to knee. */
function lineOf(thigh: THREE.Object3D, knee: THREE.Object3D): THREE.Vector3 {
  const hip = thigh.getWorldPosition(new THREE.Vector3());
  return knee.getWorldPosition(new THREE.Vector3()).sub(hip);
}

/** A thigh's line against straight down, along `way` (deg, forward positive): as the runner's curves have it. */
function thighAngle(line: THREE.Vector3, way: THREE.Vector2): number {
  const along = line.x * way.x + line.z * way.y;
  return THREE.MathUtils.radToDeg(Math.atan2(along, -line.y));
}

/** The stretches of frames a frame apart in `frames`: each one's first frame and how many. */
function stretchesOf(frames: number[]): { from: number; length: number }[] {
  const stretches: { from: number; length: number }[] = [];
  for (const frame of frames) {
    const last = stretches[stretches.length - 1];
    if (last && frame === last.from + last.length) last.length++;
    else stretches.push({ from: frame, length: 1 });
  }
  return stretches;
}

/** A stretch as a report lists it: its frames, first to last. */
function stretchText(stretch: { from: number; length: number }): string {
  return stretch.length > 1 ? `${stretch.from}-${stretch.from + stretch.length - 1}` : `${stretch.from}`;
}

/** The legs swinging together as the report says it: how many frames, the stretches, the longest. */
export function togetherLine(watch: TogetherWatch): string {
  const frames = watch.together.length;
  const share = watch.moving ? Math.round((100 * frames) / watch.moving) : 0;
  const head = `both thighs swinging forward at once (a person's never do): ${frames} of ${watch.moving} frames moving`
    + ` (${share}%)`;
  if (!frames) return head;
  const stretches = stretchesOf(watch.together);
  const longest = stretches.reduce((best, each) => (each.length > best.length ? each : best));
  const listed = stretches.map(stretchText);
  return `${head}, ${stretches.length} stretches, the longest ${longest.length} frames from ${longest.from}:`
    + ` ${listed.join(', ')}`;
}

/** A landing, for the steps' evenness: its foot, its frame, and whether it closed a stop. */
export interface Landing {
  foot: number;
  landed: number;
  closing: boolean;
}

/** One step against the next: the frame the second landed, both steps' times (s), and how uneven (a share). */
export interface StepPair {
  landed: number;
  first: number;
  second: number;
  uneven: number;
}

/**
 * Each step's time (the other foot's landing to this one's) against the next one's, for the steps of a walk or a run:
 * landings of alternating feet, neither step longer than `STEP_MOST` (the body stood between) nor closing a stop.
 */
export function stepPairsOf(landings: Landing[], seconds: number): StepPair[] {
  const sorted = [...landings].sort((a, b) => a.landed - b.landed);
  const pairs: StepPair[] = [];
  for (let k = 2; k < sorted.length; k++) {
    const [before, middle, last] = [sorted[k - 2], sorted[k - 1], sorted[k]];
    const alternate = before.foot !== middle.foot && middle.foot !== last.foot;
    if (!alternate || middle.closing || last.closing) continue;
    const first = (middle.landed - before.landed) * seconds;
    const second = (last.landed - middle.landed) * seconds;
    if (first <= 0 || second <= 0 || first > STEP_MOST || second > STEP_MOST) continue;
    pairs.push({ landed: last.landed, first, second, uneven: Math.abs(first - second) / ((first + second) / 2) });
  }
  return pairs;
}

/** The steps uneven by more than `UNEVEN`. */
export function unevenOf(pairs: StepPair[]): StepPair[] {
  return pairs.filter((pair) => pair.uneven > UNEVEN);
}

/** The steps' evenness as the report says it: the median, and each uneven pair. */
export function evennessLine(pairs: StepPair[]): string {
  const sorted = pairs.map((pair) => pair.uneven).sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  const uneven = unevenOf(pairs);
  const listed = uneven.map((pair) => `${pair.landed}: ${pair.first.toFixed(2)} s then ${pair.second.toFixed(2)}`);
  const which = uneven.length ? ` (${listed.join(', ')})` : '';
  return `the steps' evenness, each step's time landing to landing against the next's (a runner's within 1 to 2%):`
    + ` the median ${Math.round(100 * median)}% apart, ${uneven.length} of ${pairs.length} over`
    + ` ${Math.round(100 * UNEVEN)}%${which}`;
}

/** The share of a runner's stride both thighs swing forward at once, the legs `apart` of a stride apart. */
function runnerTogether(speed: number, apart: number): number {
  const form = runnerAt(speed);
  const cycle = 2 / form.cadence;
  const frames = Math.round(CANARY_CYCLES * cycle * CANARY_RATE);
  const seconds = 1 / CANARY_RATE;
  const watch = new TogetherWatch();
  const thighs = (frame: number) => {
    const u = (frame * seconds) / cycle;
    return [form.leg('thigh', u), form.leg('thigh', u + apart)];
  };
  for (let frame = 1; frame < frames; frame++) {
    const now = thighs(frame);
    const before = thighs(frame - 1);
    watch.observe(frame, seconds, [(now[0] - before[0]) / seconds, (now[1] - before[1]) / seconds]);
  }
  return watch.together.length / Math.max(1, watch.moving);
}

/**
 * The measure over a runner's own thighs: half a stride apart never together, a quarter apart (a gallop's) at
 * least `CANARY_LEAST` of the stride. Returns what it found, and what it missed (none when it holds).
 */
export function runnerCanary(): { said: string; missed: string[] } {
  const missed: string[] = [];
  const found = CANARY_SPEEDS.map((speed) => {
    const alternating = runnerTogether(speed, 0.5);
    const galloping = runnerTogether(speed, 0.25);
    if (alternating > 0) missed.push(`a runner's thighs at ${speed} m/s swung forward together ${pct(alternating)}`);
    if (galloping < CANARY_LEAST) missed.push(`a runner's thighs a quarter apart at ${speed} m/s: ${pct(galloping)}`);
    return `at ${speed} m/s ${pct(alternating)}, a quarter of a stride apart ${pct(galloping)}`;
  });
  return { said: `both thighs forward at once, a runner's: ${found.join('; ')}`, missed };
}

/** A share as a whole percentage. */
function pct(share: number): string {
  return `${Math.round(100 * share)}%`;
}
