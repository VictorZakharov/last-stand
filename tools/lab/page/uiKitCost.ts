// `lab ui --cost`: what the UI kit's screens cost the main thread each frame in a state, by the browser's own clock
// (the lab's fixed clock stands still). Each frame the kit runs its ticks (`frameTicks` in src/ui/kit/panel.ts):
// every screen drawn as a style sheet follows its page element, node by node (its key, its rules, the sizes sent
// where they changed), and each panel of code its own. Two times: standing still (a screen follows only when what it
// reads changes, src/ui/kit/sheetDirty.ts, so its ticks do next to nothing), and every screen told to follow again
// each round (a frame after a change: its every node keyed, matched and compared again, sending nothing new). Its
// canary plants a tick that waits a known time, which the measure must count.
import type { Found } from './uiKit';

/** The kit's ticks and its count of panels, where the tree has the kit's frame loop (main's side may not). */
interface KitFrames {
  frameTicks: () => ReadonlySet<() => void>;
  panelCount: () => number;
}
const KIT = Object.values(import.meta.glob<KitFrames>('../../../src/ui/kit/panel.ts', { eager: true }))[0];
/** Every screen told to follow its element again, where the tree has screens that follow only when told. */
interface KitDirty {
  followAll: () => void;
}
const DIRTY = Object.values(import.meta.glob<KitDirty>('../../../src/ui/kit/sheetDirty.ts', { eager: true }))[0];

/** the rounds of every tick timed, after the warm-up rounds left untimed (the JIT's first compiles) */
const ROUNDS = 60;
const WARM_ROUNDS = 10;
/** what the canary's planted tick waits each round (ms), and how much of it the measure must count */
const CANARY_MS = 3;
const CANARY_COUNTED = 0.8;

/** The browser's own clock (ms), as the lab gives it. */
const realNow = (): number => window.__labClock.realNow();

/** A tick that does nothing but wait `ms` (the canary's). */
const waiting = (ms: number) => (): void => {
  const until = realNow() + ms;
  while (realNow() < until) { /* waiting */ }
};

/** Every tick run once, every screen told to follow again first where `whole`. */
function runTicks(ticks: ReadonlySet<() => void>, whole: boolean): void {
  if (whole) DIRTY?.followAll();
  for (const tick of ticks) tick();
}

/** The kit's ticks' time a frame (ms): the fastest of `ROUNDS` rounds, each every tick run once (the median
 *  wandered by a millisecond on a shared PC, and the canary's wait went unseen in a state of 6 ms). */
function frameCost(ticks: ReadonlySet<() => void>, whole: boolean): number {
  for (let round = 0; round < WARM_ROUNDS; round++) runTicks(ticks, whole);
  const times: number[] = [];
  for (let round = 0; round < ROUNDS; round++) {
    const began = realNow();
    runTicks(ticks, whole);
    times.push(realNow() - began);
  }
  return Math.min(...times);
}

/** The state's cost a frame in the kit, as a line; with the canary, the planted wait counted, or a problem. */
export function kitCost(state: string, canary: boolean): Found {
  if (!KIT?.frameTicks) return { lines: ['  the kit\'s frame: none here (no UI kit)'], problems: [] };
  const ticks = KIT.frameTicks();
  const cost = frameCost(ticks, false);
  const whole = frameCost(ticks, true);
  const lines = [`  the kit's frame: ${cost.toFixed(2)} ms of the main thread standing still, ${whole.toFixed(2)} `
    + `with every screen followed again (${ticks.size} ticks, ${KIT.panelCount()} panels)`];
  if (!canary) return { lines, problems: [] };
  const planted = waiting(CANARY_MS);
  const all = new Set([...ticks, planted]);
  const withCanary = frameCost(all, false);
  const counted = withCanary - cost >= CANARY_MS * CANARY_COUNTED;
  lines.push(`  canary: a tick waiting ${CANARY_MS} ms ${counted ? 'counted' : 'went uncounted'}`);
  const problems = counted ? [] : [`${state}: the kit's cost missed a tick waiting ${CANARY_MS} ms`];
  return { lines, problems };
}
