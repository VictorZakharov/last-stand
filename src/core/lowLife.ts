// Low health on screen: as the local hero's Health runs low, the world's colour drains away and blood gathers in from
// the screen's edges, more the nearer it is to nothing, swelling with each beat of a heart that quickens as it goes
// (never past 1.5 beats a second: nothing large may pulse faster; still with reduced motion). The final grade draws it
// (`uLow`, `uBeat` in core/renderer.ts): uniforms alone, so nothing compiles as it comes and goes.
import { G } from '../state';
import { setLowLife } from './renderer';
import { damp } from '../util';

/** Health under this share of the most starts to show, and shows fully at nothing */
export const LOW_FROM = 0.5;
/** how fast what's shown follows the Health (1/s): a blow shows within a few frames, a draught eases it away */
const EASE = 5;
/** the heart's beats a second as it starts to show, and at nothing left */
const RATE_FROM = 0.9, RATE_TO = 1.4;
const still = typeof matchMedia !== 'undefined' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

let shown = 0, phase = 0, beat = 0;

/** How near to nothing a share of Health is shown: 0 from `LOW_FROM` up, 1 at nothing. */
export const lowOf = (share: number): number => Math.min(1, Math.max(0, (LOW_FROM - share) / LOW_FROM));

/** The local hero's Health as a share of his most, in a run (down or fallen: nothing; out of it: all). */
function lifeShare(): number {
  const p = G.player;
  if (G.mode !== 'run' || !p.inRun) return 1;
  return p.alive ? p.life / p.stats.maxLife : 0;
}

/** A heartbeat over one beat's phase (0..1): the two knocks of a heart, the second softer. */
const lubDub = (u: number): number => Math.exp(-(((u - 0.06) / 0.05) ** 2)) + 0.55 * Math.exp(-(((u - 0.27) / 0.05) ** 2));

/** The frame's low-health look, eased after the Health. */
export function updateLowLife(dt: number): void {
  shown = damp(shown, lowOf(lifeShare()), EASE, dt);
  if (shown < 1e-3) shown = 0;
  phase = (phase + dt * (RATE_FROM + (RATE_TO - RATE_FROM) * shown)) % 1;
  beat = still?.matches ? 0 : lubDub(phase) * shown;
  setLowLife(shown, beat);
}

/** What the frame shows now: how near to nothing, and the heart's beat (for the lab's `health`). */
export const lowLifeShown = (): { low: number; beat: number } => ({ low: shown, beat });
