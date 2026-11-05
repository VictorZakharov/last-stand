// The perf overlay's Profile: where this device's frame goes, measured on the device itself (from play: phones at 16 to
// 39 frames a second, a frame of 25 ms on an S25 Edge whether it drew 440k triangles or 600k, and no desktop GPU nor
// a software one able to stand in for a phone's). The view and the quality held, each thing is switched off and on
// again in turn, `ROUNDS` times, `TAKE` frames each way after `SKIP` to settle, and each side compared with the one
// beside it: what the frames and our own work drop by with it off is its cost there. Run once, a baseline then each
// part off, the S25's own work rose step after step whatever was off (8.4 to 11.5 ms, the phone warming), and bloom
// off read 16 ms dearer; side by side, a drift is the same on both. A phone's frames are whole refreshes (16.7 or
// 33.3 ms), so its median says nothing of a part: what tells is how many frames missed a refresh, and the mean.
// Nothing switched compiles a program: each is a pass left out, a part hidden, a size changed. The result goes into
// the overlay's copied report. Phones time no GPU (WebGL's timer isn't there); the GPU's time is listed where the
// browser gives it.
import * as THREE from 'three';
import { G } from '../state';
import { holdBloom, holdCanvasAtScene, overFrame, scenePixels } from '../core/renderer';
import { holdAuto, qualityBudget, qualityLevel, useQuality } from '../core/quality';
import { particles } from '../fx/particles';
import { lampShadowsOn, lampsHeldOut, setLampShadows } from '../core/lamps';
import { holdSightOff } from '../core/sight';
import { setReliefSteps } from '../core/parallax';
import { QUALITY } from '../data/quality';
import { perfListen, setProfiled } from './perfHud';

/** A thing the profile switches off: its label, and what switches it off, returning what puts it back (null where
 *  it's off already, or not here). */
interface Step {
  label: string;
  off(): (() => void) | null;
}

/** A side's frames: their intervals, our work in each, and the GPU's times (none untimed), ms. */
interface Frames {
  intervals: number[];
  ours: number[];
  gpu: number[];
}

/** the frames let go after a switch (the targets resized, the shadow map's last draw), the frames taken each way,
 *  and how many times each way */
const SKIP = 10;
const TAKE = 30;
const ROUNDS = 4;
/** how long a step waits for a frame before it gives up (ms): a hidden page draws none */
const NO_FRAME_MS = 3000;
/** a frame missed a refresh when it took this many of the screen's refreshes or more */
const MISSED = 1.5;

const sorted = (values: number[]): number[] => [...values].sort((a, b) => a - b);
const mean = (values: number[]): number => values.reduce((sum, v) => sum + v, 0) / (values.length || NaN);
const fixed = (value: number): string => (Number.isFinite(value) ? value.toFixed(1) : '--').padStart(6);
const signed = (value: number): string => (Number.isFinite(value) ? (value >= 0 ? '+' : '') + value.toFixed(1) : '--')
  .padStart(6);

/** A flag switched off where it's on: what puts it back. */
const flag = (get: () => boolean, set: (on: boolean) => void) => (): (() => void) | null => {
  if (!get()) return null;
  set(false);
  return () => set(true);
};

/** What's under a root left undrawn by its layers (its `visible` is the game's to set each frame, as the meadow's
 *  is): what puts it back. */
const undrawn = (root: THREE.Object3D | null | undefined) => (): (() => void) | null => {
  if (!root) return null;
  const kept: [THREE.Object3D, number][] = [];
  root.traverse((part) => {
    kept.push([part, part.layers.mask]);
    part.layers.mask = 0;
  });
  return () => kept.forEach(([part, mask]) => { part.layers.mask = mask; });
};

/** The opaque in order of their depth alone, nearest first (three's own order groups them by program first). */
const nearestFirst = (a: THREE.RenderItem, b: THREE.RenderItem): number =>
  a.groupOrder - b.groupOrder || a.renderOrder - b.renderOrder || a.z - b.z;

/** What the profile switches off, in turn. */
function steps(): Step[] {
  const shadows = G.renderer.shadowMap;
  const meadow = G.arena.place === 'village' ? G.arena.village.meadow : null;
  return [
    { label: 'canvas at the scene\'s pixels', off: () => {
      holdCanvasAtScene(true);
      return () => holdCanvasAtScene(false);
    } },
    { label: 'bloom off', off: () => {
      holdBloom(true);
      return () => holdBloom(false);
    } },
    { label: 'shadow maps not drawn', off: flag(() => shadows.autoUpdate, (on) => {
      shadows.autoUpdate = on;
      shadows.needsUpdate = on;
    }) },
    { label: 'grass hidden', off: undrawn(meadow) },
    { label: 'hero hidden', off: undrawn(G.player.obj) },
    { label: 'particles hidden', off: () => {
      const glow = undrawn(particles.glow.points)();
      const smoke = undrawn(particles.smoke.points)();
      return () => { glow?.(); smoke?.(); };
    } },
    { label: 'overlays not drawn', off: () => {
      const draw = overFrame.draw;
      overFrame.draw = () => {};
      return () => { overFrame.draw = draw; };
    } },
    // (not a part: the opaque drawn nearest first, so the pixels behind are tested out before they're shaded, at the
    // cost of switching programs more often; at the S25's full res on a 4070 Ti, 4.05 to 3.11 ms of the GPU's frame)
    { label: 'nearest first (not 3\'s order)', off: () => {
      G.renderer.setOpaqueSort(nearestFirst);
      return () => G.renderer.setOpaqueSort(null);
    } },
    { label: 'lamps out', off: () => {
      lampsHeldOut(true);
      return () => lampsHeldOut(false);
    } },
    { label: 'lamps\' shadows not read', off: flag(lampShadowsOn, setLampShadows) },
    { label: 'fog of war off', off: () => {
      holdSightOff(true);
      return () => holdSightOff(false);
    } },
    { label: 'floors\' relief flat', off: flag(() => QUALITY[qualityLevel()].relief > 0, (on) => {
      setReliefSteps(on ? QUALITY[qualityLevel()].relief : 0);
    }) },
    { label: 'half the scene\'s pixels', off: () => {
      const level = qualityLevel();
      const budget = qualityBudget();
      useQuality(level, scenePixels() / 2);
      return () => useQuality(level, budget);
    } },
  ];
}

/** The next `SKIP` frames let go and the `count` after them taken. */
function take(count: number): Promise<Frames> {
  return new Promise((resolve, reject) => {
    const taken: Frames = { intervals: [], ours: [], gpu: [] };
    let seen = 0;
    let timer = setTimeout(() => reject(new Error('no frames came')), NO_FRAME_MS);
    perfListen.gpu = (ms) => { if (seen > SKIP) taken.gpu.push(ms); };
    perfListen.frame = (interval, work) => {
      clearTimeout(timer);
      timer = setTimeout(() => reject(new Error('the frames stopped')), NO_FRAME_MS);
      if (++seen <= SKIP) return;
      taken.intervals.push(interval);
      taken.ours.push(work);
      if (taken.intervals.length < count) return;
      clearTimeout(timer);
      perfListen.frame = perfListen.gpu = null;
      resolve(taken);
    };
  });
}

const joined = (all: Frames[]): Frames => ({
  intervals: all.flatMap((f) => f.intervals),
  ours: all.flatMap((f) => f.ours),
  gpu: all.flatMap((f) => f.gpu),
});

/** A side's figures: its mean frame, the share of its frames that missed a refresh (%), our work's and the GPU's
 *  means. `refresh` is the screen's interval. */
function figures(frames: Frames, refresh: number) {
  const missed = frames.intervals.filter((interval) => interval >= refresh * MISSED).length;
  return {
    mean: mean(frames.intervals),
    missed: 100 * missed / (frames.intervals.length || NaN),
    ours: mean(frames.ours),
    gpu: mean(frames.gpu),
  };
}

/** A step's frames on and off, `ROUNDS` times in turn (on first, so the switch's own frames are let go off). */
async function onAndOff(step: Step): Promise<{ on: Frames; off: Frames } | null> {
  const on: Frames[] = [];
  const off: Frames[] = [];
  for (let round = 0; round < ROUNDS; round++) {
    on.push(await take(TAKE));
    const undo = step.off();
    if (!undo) return null;
    try {
      off.push(await take(TAKE));
    } finally {
      undo();
    }
  }
  return { on: joined(on), off: joined(off) };
}

/** A step's line: with it on and off, and what off saves (on less off). */
function line(label: string, on: ReturnType<typeof figures>, off: ReturnType<typeof figures>): string {
  return `  ${label.padEnd(30)} frame ${fixed(on.mean)} > ${fixed(off.mean)}  missed% ${fixed(on.missed)} >`
    + ` ${fixed(off.missed)}  ours ${fixed(on.ours)} > ${fixed(off.ours)}  GPU ${fixed(on.gpu)} > ${fixed(off.gpu)}`
    + `  | saves frame ${signed(on.mean - off.mean)} missed ${signed(on.missed - off.missed)}`
    + ` ours ${signed(on.ours - off.ours)}`;
}

let running = false;

/** The profile run: each step's progress told to `told`; the result kept for the copied report. */
async function profile(told: (text: string) => void): Promise<void> {
  const all = steps();
  holdAuto(true);
  const lines: string[] = [];
  try {
    told('Profiling: the screen\'s rate');
    // (the screen's interval: the quickest tenth of the frames, as a frame never comes sooner than a refresh)
    const first = sorted((await take(60)).intervals);
    const refresh = first[Math.floor(first.length / 10)];
    lines.push(`Profile (the view and quality held; each part on and off in turn, ${ROUNDS} times ${TAKE} frames`
      + ` each way after ${SKIP}; mean ms on > off; missed% = frames of ${MISSED} refreshes or more, the refresh`
      + ` ${refresh.toFixed(1)} ms; saves = on less off):`);
    for (const [i, step] of all.entries()) {
      told(`Profiling: ${step.label} (${i + 1}/${all.length})`);
      const sides = await onAndOff(step);
      if (!sides) {
        lines.push(`  ${step.label.padEnd(30)} (off already, or not here)`);
        continue;
      }
      lines.push(line(step.label, figures(sides.on, refresh), figures(sides.off, refresh)));
    }
  } catch (error) {
    lines.push(`  stopped: ${(error as Error).message}`);
  } finally {
    perfListen.frame = perfListen.gpu = null;
    holdAuto(false);
  }
  setProfiled(lines.join('\n'));
}

/** The overlay's Profile button: a run at a time; its words say how far along, then that the report has it. */
export function initPerfProfile(): void {
  const button = document.querySelector<HTMLElement>('#perf [data-p="profile"]');
  if (!button) return;
  const idle = button.textContent ?? 'Profile';
  button.onclick = (event) => {
    // (the overlay's own click copies the report)
    event.stopPropagation();
    if (running) return;
    running = true;
    void profile((text) => { button.textContent = text; }).finally(() => {
      running = false;
      button.textContent = 'Profiled: tap the overlay to copy';
      setTimeout(() => { button.textContent = idle; }, 8000);
    });
  };
}
