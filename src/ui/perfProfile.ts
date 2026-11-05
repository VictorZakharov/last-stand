// The perf overlay's Profile: where this device's frame goes, measured on the device itself (from play: phones at 16 to
// 39 frames a second, a frame of 25 ms on an S25 Edge whether it drew 440k triangles or 600k, and no desktop GPU nor
// a software one able to stand in for a phone's). The view and the quality held, one thing switched off at a time,
// each for `TAKE` frames after `SKIP` to settle: what the frame's interval and our own work drop by with it off is its
// cost there. Nothing switched compiles a program: each is a pass left out, a part hidden, a size changed. The result
// goes into the overlay's copied report. Phones time no GPU (WebGL's timer isn't there), so the frame's interval says
// it; the GPU's time is listed where the browser gives it.
import * as THREE from 'three';
import { G } from '../state';
import { holdBloom, holdCanvasAtScene, overFrame, scenePixels } from '../core/renderer';
import { holdAuto, qualityBudget, qualityLevel, useQuality } from '../core/quality';
import { particles } from '../fx/particles';
import { perfListen, setProfiled } from './perfHud';

/** A thing the profile switches off: its label, and what switches it off, returning what puts it back (null where
 *  it's off already, or not here). */
interface Step {
  label: string;
  off(): (() => void) | null;
}

/** A step's frames: the interval's median and mean, our work's mean, the GPU's mean (NaN untimed), ms. */
interface Sampled {
  median: number;
  mean: number;
  ours: number;
  gpu: number;
}

/** the frames let go after a switch (the targets resized, the shadow map's last draw), and the frames taken */
const SKIP = 30;
const TAKE = 90;
/** how long a step waits for a frame before it gives up (ms): a hidden page draws none */
const NO_FRAME_MS = 3000;

const median = (values: number[]): number => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? NaN;
const mean = (values: number[]): number => values.reduce((sum, v) => sum + v, 0) / (values.length || NaN);
const fixed = (value: number): string => (Number.isFinite(value) ? value.toFixed(1) : '--').padStart(6);

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
    { label: 'half the scene\'s pixels', off: () => {
      const level = qualityLevel();
      const budget = qualityBudget();
      useQuality(level, scenePixels() / 2);
      return () => useQuality(level, budget);
    } },
  ];
}

/** The next `SKIP` frames let go and the `TAKE` after them sampled. */
function sample(): Promise<Sampled> {
  return new Promise((resolve, reject) => {
    const intervals: number[] = [];
    const ours: number[] = [];
    const gpu: number[] = [];
    let seen = 0;
    let timer = setTimeout(() => reject(new Error('no frames came')), NO_FRAME_MS);
    perfListen.gpu = (ms) => { if (seen > SKIP) gpu.push(ms); };
    perfListen.frame = (interval, work) => {
      clearTimeout(timer);
      timer = setTimeout(() => reject(new Error('the frames stopped')), NO_FRAME_MS);
      if (++seen <= SKIP) return;
      intervals.push(interval);
      ours.push(work);
      if (intervals.length < TAKE) return;
      clearTimeout(timer);
      perfListen.frame = perfListen.gpu = null;
      resolve({ median: median(intervals), mean: mean(intervals), ours: mean(ours), gpu: mean(gpu) });
    };
  });
}

/** A step's line: its frames, and what it saves against the baseline's (the median interval less this one's, a
 *  frame held up once moving a mean by 11 ms; and our own work's mean less this one's). */
function line(label: string, taken: Sampled, base: Sampled | null): string {
  const saves = base ? `  saves ${fixed(base.median - taken.median)} (ours ${fixed(base.ours - taken.ours)})` : '';
  return `  ${label.padEnd(30)} frame ${fixed(taken.median)} (mean ${fixed(taken.mean)})  ours ${fixed(taken.ours)}`
    + `  GPU ${fixed(taken.gpu)}${saves}`;
}

let running = false;

/** The profile run: each step's progress told to `told`; the result kept for the copied report. */
async function profile(told: (text: string) => void): Promise<void> {
  const all = steps();
  holdAuto(true);
  const lines = [
    `Profile (the view and quality held, ${TAKE} frames each after ${SKIP}; ms; saves = the baseline's median less`
      + ' this; a frame at the screen\'s rate shows no saving):',
  ];
  try {
    told(`Profiling: baseline (1/${all.length + 1})`);
    const base = await sample();
    lines.push(line('baseline', base, null));
    for (const [i, step] of all.entries()) {
      told(`Profiling: ${step.label} (${i + 2}/${all.length + 1})`);
      const undo = step.off();
      if (!undo) {
        lines.push(`  ${step.label.padEnd(30)} (off already, or not here)`);
        continue;
      }
      try {
        lines.push(line(step.label, await sample(), base));
      } finally {
        undo();
      }
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
