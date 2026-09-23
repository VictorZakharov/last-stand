// Loading screen. The markup and styles are inline in index.html so it paints before the
// bundle has loaded; boot() reports its steps here and yields so each one gets painted.
const el = (): HTMLElement => document.getElementById('loading')!;
const sub = (): HTMLElement => el().querySelector<HTMLElement>('.ld-sub')!;

/** Show a step, then wait until the browser has painted it: the work that follows blocks the main thread. */
export async function loadingStep(label: string, progress: number): Promise<void> {
  sub().textContent = label;
  el().style.setProperty('--p', String(progress));
  await new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r)));
}

// the game runs behind the loading screen until this many frames in a row come in under
// SMOOTH_MS: the very first frames can still stall on work the driver or browser does on first
// use (on a first visit its shader cache is cold), and that should not be seen as a stutter
const SMOOTH_FRAMES = 8, SMOOTH_MS = 70, MAX_WAIT_MS = 4000;

/** Call when the game loop starts; fades out once the lobby renders smoothly. */
export function loadingDone(): void {
  const l = el();
  l.style.setProperty('--p', '1');
  const start = performance.now();
  let last = start, smooth = 0;
  const tick = (now: number): void => {
    smooth = now - last < SMOOTH_MS ? smooth + 1 : 0;
    last = now;
    if (smooth < SMOOTH_FRAMES && now - start < MAX_WAIT_MS) { requestAnimationFrame(tick); return; }
    l.classList.add('done');
    l.addEventListener('transitionend', () => l.remove(), { once: true });
  };
  requestAnimationFrame(tick);
}

export function loadingFailed(err: unknown): void {
  el().classList.add('failed');
  const noWebgl = !document.createElement('canvas').getContext('webgl2');
  sub().textContent = noWebgl
    ? 'Your browser or device does not support WebGL 2, which Last Stand needs to run.'
    : `Something went wrong while loading: ${err instanceof Error ? err.message : String(err)}`;
}
