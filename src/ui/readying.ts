// The fight's loading bar. The lobby shows before the fight's and the other heroes' programs are compiled
// (game/warmup.ts warmTheRest): pressed before they are, Start (or a class, save slot, biome or co-op pick) shows how
// far along their warm-up is, in the middle of the dimmed lobby, and goes ahead once it's done (game/warm.ts).
import { isReadying, onReadying, readyingShare } from '../game/warm';

const el = (): HTMLElement => document.getElementById('readying')!;

function paint(): void {
  const bar = el();
  bar.classList.toggle('on', isReadying());
  bar.style.setProperty('--p', String(readyingShare()));
}

export function initReadying(): void { onReadying(paint); }
