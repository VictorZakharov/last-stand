// The crosshair of the close views as the player sees it (tools/lab `draw`; `#crosshair`, src/main.ts and
// src/ui/styles/_hud.scss): its lines' thickness as drawn, read from the page's own styles every frame, and the beats
// it swelled with (its animations). A drawn shot held at full draw shows it bold, swelling into it once as a heart
// knocks and never pulsing on; nothing else does. It swells about its middle, which stays where it was. With motion
// reduced it comes to bold with no beat. The beat runs on the page's clock, not the lab's, and the lab opens a page
// with its motion reduced: `draw` lets it run.
import type { Clip, Lab, Pictured } from './lab';

/** how much thicker than regular its lines must be to count as bold */
const BOLD_RATIO = 1.3;
/** css px round its middle a picture of it takes in (it swells to half as big again at its beat's height) */
const AROUND = 32;
/** the most its middle may move through its beat (css px) */
const DRIFT_MOST = 0.5;

/** What a shot did to the crosshair: the frames it was bold idle, drawn short of full and held at full, and its
 *  beats. */
export interface CrosshairFrames {
  /** its lines' thickness with no shot drawn (css px): regular */
  regular: number;
  idleBold: number;
  drawingBold: number;
  fullBold: number;
  /** each beat it swelled with over the shot */
  beats: Beat[];
}

/** A beat of the crosshair's: how many times it runs, its length (ms), and its largest swell (its scale). */
export interface Beat {
  runs: number;
  length: number;
  swell: number;
}

/** The crosshair's element. */
function crosshair(): HTMLElement {
  const element = document.getElementById('crosshair');
  if (!element) throw new Error('lab: draw: the page has no #crosshair');
  return element;
}

/** Whether the crosshair shows now (the close views: none from above). */
export function crosshairShown(): boolean {
  return crosshair().checkVisibility();
}

/** Its lines' thickness as drawn now (css px). */
function thickness(): number {
  return parseFloat(getComputedStyle(crosshair(), '::before').width);
}

/** A beat as its numbers. */
function beatOf(animation: Animation): Beat {
  const effect = animation.effect as KeyframeEffect;
  const timing = effect.getComputedTiming();
  let swell = 1;
  for (const keyframe of effect.getKeyframes()) {
    const scale = parseFloat(String(keyframe.scale ?? 1));
    if (Number.isFinite(scale)) swell = Math.max(swell, scale);
  }
  return { runs: timing.iterations ?? 1, length: Number(timing.duration), swell };
}

/** The crosshair watched over a shot, frame by frame. */
export class CrosshairWatch {
  readonly frames: CrosshairFrames;
  private readonly seen = new Set<Animation>();

  /** Watched from now, its lines as they're drawn now taken as regular. */
  constructor() {
    this.frames = { regular: thickness(), idleBold: 0, drawingBold: 0, fullBold: 0, beats: [] };
  }

  /** Whether its lines are drawn bold now. */
  bold(): boolean {
    return thickness() > this.frames.regular * BOLD_RATIO;
  }

  /** A frame of the shot: idle, drawn short of full, or held at full. */
  frame(phase: 'idle' | 'drawing' | 'full'): void {
    for (const animation of crosshair().getAnimations()) {
      if (this.seen.has(animation)) continue;
      this.seen.add(animation);
      this.frames.beats.push(beatOf(animation));
    }
    if (!this.bold()) return;
    if (phase === 'idle') this.frames.idleBold++;
    if (phase === 'drawing') this.frames.drawingBold++;
    if (phase === 'full') this.frames.fullBold++;
  }
}

/**
 * The crosshair made bold or regular by hand, as the canary plants it (the game sets it again next frame), its styles
 * worked out at once (taken off and put back before they were, it would be as if never changed: no beat).
 */
export function forceBold(bold: boolean): void {
  crosshair().classList.toggle('full', bold);
  crosshair().getAnimations();
}

/** The crosshair come to full draw with motion reduced: whether it's bold, and the beats it swelled with. */
export interface Reduced {
  bold: boolean;
  beats: number;
}

/**
 * The crosshair brought to bold with the page's motion reduced, as a player who asks for less motion has it (`watch`
 * knows its regular lines), and back to regular; the motion is let run again after. With `canary`, it's left running,
 * a fault the checks must catch.
 */
export async function boldWithMotionReduced(lab: Lab, watch: CrosshairWatch, canary: boolean): Promise<Reduced> {
  await lab.reduceMotion(!canary);
  try {
    forceBold(true);
    const reduced = { bold: watch.bold(), beats: crosshair().getAnimations().length };
    forceBold(false);
    return reduced;
  } finally {
    await lab.reduceMotion(false);
  }
}

/** The crosshair with motion reduced, as words. */
export function describeReduced(reduced: Reduced): string {
  return `with motion reduced, the crosshair at full draw: ${reduced.bold ? 'bold' : 'regular'}, `
    + counted(reduced.beats, 'beat');
}

/** What's wrong with the crosshair with motion reduced. */
export function reducedProblems(reduced: Reduced): string[] {
  const problems: string[] = [];
  if (!reduced.bold) problems.push('the crosshair not bold at full draw with motion reduced');
  if (reduced.beats) problems.push(`the crosshair beat ${reduced.beats} times with motion reduced (none: it's still)`);
  return problems;
}

/** The area round the crosshair's middle a picture takes in. */
function crosshairArea(): Clip {
  const box = crosshair().getBoundingClientRect();
  const x = box.left + box.width / 2;
  const y = box.top + box.height / 2;
  return { x: x - AROUND, y: y - AROUND, width: AROUND * 2, height: AROUND * 2 };
}

/** The crosshair pictured as the player sees it now. */
export function pictureCrosshair(lab: Lab, label: string): Promise<Pictured> {
  return lab.screen(label, [], crosshairArea());
}

/**
 * The crosshair's beat under way pictured at its height, and then run to its end and pictured bold (none: bold
 * alone). The beat runs on the page's clock, not the lab's, so it's held there to be seen.
 */
export async function pictureBeat(lab: Lab, label: string): Promise<Pictured[]> {
  const pictures: Pictured[] = [];
  for (const animation of crosshair().getAnimations()) {
    holdAtHeight(animation);
    pictures.push(await pictureCrosshair(lab, `${label}, at its beat's height`));
    animation.finish();
  }
  pictures.push(await pictureCrosshair(lab, `${label}, bold`));
  return pictures;
}

/** A beat held at its height, where it swells most. */
function holdAtHeight(animation: Animation): void {
  const effect = animation.effect as KeyframeEffect;
  animation.pause();
  animation.currentTime = swellOffset(effect) * Number(effect.getComputedTiming().duration);
}

/** The middle of the crosshair's box as drawn (css px), its transforms with it. */
function middle(): { x: number; y: number } {
  const box = crosshair().getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}

/**
 * How far the crosshair's middle moves through its beat (css px): brought to bold, held at its beat's height and at
 * rest after, against its middle before (scaled about its box before that was centred, it swelled up and left by a
 * quarter of its size). With `canary`, it swells about its top left corner, a fault the check must catch. Run with
 * the page's motion on; it's left regular, for the game to set again.
 */
export function driftThroughBeat(canary: boolean): number {
  const element = crosshair();
  forceBold(false);
  const before = middle();
  const away = () => Math.hypot(middle().x - before.x, middle().y - before.y);
  if (canary) element.style.transformOrigin = '0 0';
  forceBold(true);
  let drift = 0;
  for (const animation of element.getAnimations()) {
    holdAtHeight(animation);
    drift = Math.max(drift, away());
    animation.finish();
  }
  drift = Math.max(drift, away());
  element.style.transformOrigin = '';
  forceBold(false);
  return drift;
}

/** The crosshair's drift through its beat, as words. */
export function describeDrift(drift: number): string {
  return `the crosshair's middle through its beat: ${drift.toFixed(2)} css px from where it was`;
}

/** What's wrong with the crosshair's drift through its beat. */
export function driftProblems(drift: number): string[] {
  if (drift <= DRIFT_MOST) return [];
  return [`the crosshair's middle moves ${drift.toFixed(1)} css px through its beat (${DRIFT_MOST} at most: it `
    + 'swells about its middle)'];
}

/** Where through its beat the crosshair swells most (0 to 1). */
function swellOffset(effect: KeyframeEffect): number {
  let largest = 1;
  let offset = 0;
  for (const keyframe of effect.getKeyframes()) {
    const scale = parseFloat(String(keyframe.scale ?? 1));
    if (!(scale > largest)) continue;
    largest = scale;
    offset = keyframe.computedOffset;
  }
  return offset;
}

/** the share of the frames held at full draw it must be bold on */
const BOLD_SHARE = 0.9;

/** The frames a shot drew in each phase, to judge the crosshair's against. */
export interface ShotFrames {
  idle: number;
  drawing: number;
  full: number;
}

/** What the crosshair did over a shot, as words. */
export function describeCrosshair(frames: CrosshairFrames | null, shot: ShotFrames): string {
  if (!frames) return '  the crosshair: not shown in this view';
  const beats = frames.beats.map(describeBeat).join('; ');
  return `  the crosshair: bold idle on ${frames.idleBold} of ${shot.idle} frames, drawn short of full on `
    + `${frames.drawingBold} of ${shot.drawing}, held at full on ${frames.fullBold} of ${shot.full}; `
    + `${counted(frames.beats.length, 'beat')}${beats ? ` (${beats})` : ''}`;
}

/** `count` of `thing`, in words. */
const counted = (count: number, thing: string): string => `${count} ${thing}${count === 1 ? '' : 's'}`;

/** A beat as words. */
function describeBeat(beat: Beat): string {
  const runs = beat.runs === Infinity ? 'on and on' : beat.runs === 1 ? 'once' : `${beat.runs} times`;
  return `running ${runs}, ${beat.length.toFixed(0)} ms, swelling to ${beat.swell.toFixed(2)} times its size`;
}

/** What's wrong with the crosshair over a shot: a problem for each check it failed (none in a view without it). */
export function crosshairProblems(frames: CrosshairFrames | null, shot: ShotFrames): string[] {
  if (!frames) return [];
  const problems: string[] = [];
  if (frames.idleBold) problems.push(`the crosshair bold with no shot drawn on ${frames.idleBold} frames`);
  if (frames.drawingBold) {
    problems.push(`the crosshair bold before the draw was full on ${frames.drawingBold} of ${shot.drawing} frames`);
  }
  if (frames.fullBold < shot.full * BOLD_SHARE) {
    problems.push(`the crosshair bold on only ${frames.fullBold} of ${shot.full} frames held at full draw`);
  }
  if (frames.beats.length !== 1) {
    problems.push(`the crosshair beat ${frames.beats.length} times over the shot (once, as it came to full draw)`);
  }
  for (const beat of frames.beats) {
    if (beat.runs !== 1) problems.push(`the crosshair's beat runs ${beat.runs} times (once: it never pulses on)`);
    if (beat.swell <= 1) problems.push('the crosshair\'s beat never swells');
  }
  return problems;
}
