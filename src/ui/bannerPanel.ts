// The run's banner drawn by the engine (ui/kit; #973): a wave's or a run's title over a line under it, a fifth of the
// way down the screen, rising into place as it fades in and fading out after (`banner` in `hud.ts`). It was
// `#banner`, styled by `_hud.scss` (its `banner` keyframes, 2.8 s: in over its first 12%, out over its last 20%,
// each step eased). The page's `#banner` stays, out of sight (`.kit-mirror`): `banner()` writes its words and counts
// each showing (`data-shown`), which begins the panel's again, and hides it as its time is up.
import { Panel, onFrame } from './kit/panel';
import { standIn } from './kit/press';
import { along, ease, keyframed, now } from './kit/motion';
import type { TextStyle } from './overlay/paint';

const TITLE: TextStyle = {
  face: 'display', size: 54, weight: 900, spacing: 4, color: '#f3e1b0', shadows: [
    { x: 0, y: 0, blur: 20, color: 'rgba(0,0,0,.9)' }, { x: 0, y: 4, blur: 6, color: '#000' },
    { x: 0, y: 0, blur: 40, color: 'rgba(240,190,90,.35)' },
  ],
};
const SUB: TextStyle = {
  face: 'body', size: 20, spacing: 2, color: '#9a8f7c', shadows: [{ x: 0, y: 2, blur: 4, color: '#000' }],
};
/** its time (s), and its fade and rise as shares of it: the keyframes' (`@keyframes banner`) */
const TIME = 2.8;
const OPACITY: [number, number][] = [[0, 0], [0.12, 1], [0.8, 1], [1, 0]];
const RISE: [number, number][] = [[0, 10], [0.12, 0], [1, 0]];
/** how far down the screen it stands (`top: 22%`) */
const TOP = '22%';

interface Banner { root: Panel; block: Panel; title: Panel; sub: Panel }

let drawn: Banner | null = null;
/** the showing it's drawn for (`data-shown`), and when that began (s of the page's clock) */
let shownCount = '';
let begun = -Infinity;

/** its showing held at a share of its time (the lab's picture of it half way), or none */
export const BANNER_HOLD: { share: number | null } = { share: null };

function make(page: HTMLElement): Banner {
  const root = new Panel(null, {
    position: 'absolute', inset: [TOP, 0, 'auto', 0], direction: 'column', alignItems: 'center',
  });
  // (its block centred, its two lines centred in it: `text-align: center`)
  const block = new Panel(root, { direction: 'column', alignItems: 'center' });
  const title = new Panel(block);
  const sub = new Panel(block);
  standIn(page, block);
  return { root, block, title, sub };
}

/** The banner brought up to the page's: its words, and where its fade and rise stand. */
function follow(): void {
  const page = document.getElementById('banner');
  if (!page) return;
  const shows = page.checkVisibility();
  if (!drawn && !shows) return;
  drawn ??= make(page);
  const count = page.dataset.shown ?? '';
  if (count !== shownCount) {
    shownCount = count;
    begun = now();
  }
  const t = BANNER_HOLD.share ?? along(begun, TIME);
  const seen = shows && t < 1;
  drawn.root.show(seen);
  if (!seen) return;
  drawn.title.say(page.querySelector('.b-title')?.textContent ?? '', TITLE);
  drawn.sub.say(page.querySelector('.b-sub')?.textContent ?? '', SUB);
  drawn.block.look({ opacity: keyframed(OPACITY, t, ease) });
  drawn.block.style({ margin: [keyframed(RISE, t, ease), 0, 0, 0] });
}

/** The banner drawn by the engine from now on, the page's own out of sight. */
export function drawBanner(): void {
  document.getElementById('banner')?.classList.add('kit-mirror');
  onFrame(follow);
}
