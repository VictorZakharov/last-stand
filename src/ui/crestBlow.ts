// The lobby's crest blown away (ui/logoWind.ts): the logo over the village stays a few seconds, then the wind takes
// its letters as sand, its tagline fading with them, and leaves the town to look at. It comes back each time the lobby
// does (from a run, the hero selection screen). With reduced motion, Low quality or the wind switched off, it fades.
import { logoWindOff, prepareBlow } from './logoWind';

/** how long the crest stays over the village before the wind takes it (s) */
const STAYS = 8;

let crest: HTMLElement, art: HTMLElement;
/** how long the village has been shown with the crest up, and where the crest stands */
let shownFor = 0, state: 'up' | 'blowing' | 'gone' = 'up';

/** The crest found. */
export function initCrestBlow(): void {
  crest = document.querySelector<HTMLElement>('.menu-crest')!;
  art = crest.querySelector<HTMLElement>('.logo .logo-art')!;
}

/** Its frame: counting while the village is `showing`, the crest blown away once it has stayed; put back up as the
 *  lobby goes (`showing` false), for the next time it shows. */
export function updateCrestBlow(dt: number, showing: boolean): void {
  if (!showing) {
    if (state !== 'up') putBack();
    shownFor = 0;
    return;
  }
  if (state !== 'up') return;
  shownFor += dt;
  if (shownFor >= STAYS) void blowAway();
}

async function blowAway(): Promise<void> {
  state = 'blowing';
  crest.classList.add('blowing');
  showLetters();
  const plain = logoWindOff() || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const blow = plain ? null : await prepareBlow(art, null);
  if (state !== 'blowing') {
    blow?.cancel();
    return;
  }
  if (!blow) {
    gone();
    return;
  }
  blow.start(() => undefined, gone);
}

function gone(): void {
  if (state !== 'blowing') return;
  state = 'gone';
  crest.classList.add('blown');
}

/** The letters as themselves: the loading screen's exit may have left their picture in their place. */
function showLetters(): void {
  art.querySelectorAll('canvas').forEach((c) => c.remove());
  art.querySelectorAll<SVGSVGElement>('svg').forEach((s) => { s.style.visibility = ''; });
}

/** The crest whole again, nothing of the wind's left on it. */
function putBack(): void {
  state = 'up';
  crest.classList.remove('blowing', 'blown');
  art.querySelectorAll<SVGSVGElement>('svg').forEach((s) => s.getAnimations().forEach((a) => a.cancel()));
}
