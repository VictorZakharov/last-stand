// Loading screen. The markup and styles are inline in index.html so it paints before the
// bundle has loaded; boot() reports its steps here and yields so each one gets painted.
import { TIPS } from '../data/tips';
import { prepareBlow, type LogoBlow } from './logoWind';

const el = (): HTMLElement => document.getElementById('loading')!;
const sub = (): HTMLElement => el().querySelector<HTMLElement>('.ld-sub')!;

let tipTimer = 0, tipIndex = Math.floor(Math.random() * TIPS.length);
function showTip(): void {
  const t = el().querySelector<HTMLElement>('.ld-tip')!;
  t.innerHTML = `<b>TIP</b>${TIPS[tipIndex++ % TIPS.length]}`;
  t.classList.add('on');
}

/** Show a step, then wait until the browser has painted it: the work that follows blocks the main thread. */
export async function loadingStep(label: string, progress: number): Promise<void> {
  if (!tipTimer) { showTip(); tipTimer = window.setInterval(showTip, 6000); }
  sub().textContent = label;
  el().style.setProperty('--p', String(progress));
  await new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r)));
}

// the game runs behind the loading screen until this many frames in a row come in under
// SMOOTH_MS: the very first frames can still stall on work the driver or browser does on first
// use (on a first visit its shader cache is cold), and that should not be seen as a stutter
const SMOOTH_FRAMES = 8, SMOOTH_MS = 70, MAX_WAIT_MS = 4000;

/** Call when the game loop starts; once the lobby renders smoothly, calls `onReveal` and leaves. */
export function loadingDone(onReveal: () => void): void {
  const l = el();
  l.style.setProperty('--p', '1');
  // the logo's particle field is built meanwhile (reduced motion: a plain fade instead); it
  // gathers into the lobby's logo
  let blow: LogoBlow | null | undefined = matchMedia('(prefers-reduced-motion: reduce)').matches ? null : undefined;
  let left = false;
  if (blow === undefined) {
    prepareBlow(l.querySelector<HTMLElement>('.ld-logo')!, document.querySelector<HTMLElement>('#menu .logo-art'))
      .then((b) => { if (left) b?.cancel(); else blow = b; }, () => { blow = null; });
  }
  const start = performance.now();
  let last = start, smooth = 0;
  const reveal = (): void => { l.classList.add('done'); onReveal(); };
  const tick = (now: number): void => {
    smooth = now - last < SMOOTH_MS ? smooth + 1 : 0;
    last = now;
    const waiting = smooth < SMOOTH_FRAMES || blow === undefined;
    if (waiting && now - start < MAX_WAIT_MS) { requestAnimationFrame(tick); return; }
    left = true;
    clearInterval(tipTimer);
    l.querySelector('.ld-tip')!.classList.remove('on');
    if (blow) {
      // the logo blows away over the loading backdrop first; the lobby shows a moment later
      l.classList.add('blowing');
      blow.start(reveal, () => l.remove());
    } else {
      l.classList.add('plain');
      reveal();
      l.addEventListener('transitionend', () => l.remove(), { once: true });
    }
  };
  requestAnimationFrame(tick);
}

export function loadingFailed(err: unknown): void {
  clearInterval(tipTimer);
  el().classList.add('failed');
  const noWebgl = !document.createElement('canvas').getContext('webgl2');
  sub().textContent = noWebgl
    ? 'Your browser or device does not support WebGL 2, which Last Stand needs to run.'
    : `Something went wrong while loading: ${err instanceof Error ? err.message : String(err)}`;
}
