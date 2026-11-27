// The run's summary drawn by the engine (ui/kit's sheet; #973): its title, what the run came to, and the bank's reveal,
// each item's chip opening in its turn, the most valuable first. It was `#summary`, styled by `_modals.scss` and
// `_coop.scss`; the page's stays, out of sight, written by `menus.ts` (`showSummary`) as before. A chip opens as its
// animation's delay has passed on the kit's clock (`motion.ts`: the page's own animation runs no more in a mirror),
// and at once where the reveal is skipped (`revealAllNow` takes the chips' `reveal` away). Sizes are px of the lobby's
// scale.
import { drawModal } from './modalSheet';
import { now } from './kit/motion';
import { INK, INK_DIM } from './kit/theme';
import { accent } from './diagFrame';
import type { Sheet } from './kit/sheet';

/** when each chip was first drawn (s, the kit's clock): its reveal's delay runs from then */
const made = new WeakMap<Element, number>();
/** a chip's pop's length (s): it's shown from half way through (`reveal .45s`) */
const POP = 0.45;

/** A revealed chip's opacity: none till its delay has passed, then its own (a lost one's dimmed). */
function revealed(chip: Element): number {
  if (!made.has(chip)) made.set(chip, now());
  const delay = parseFloat((chip as HTMLElement).style.animationDelay) || 0;
  const open = now() - made.get(chip)! >= delay + POP / 2;
  const own = chip.classList.contains('lost') ? 0.55 : 1;
  return open ? own : 0;
}

const SHEET: Sheet = [
  { at: '.sm-title', text: () => ({ face: 'display', size: 32, weight: 900, color: accent() }) },
  { at: '.sm-title.dead', text: { color: '#ff5040', shadows: [{ x: 0, y: 0, blur: 20, color: 'rgba(255,40,20,.4)' }] } },
  { at: '.sm-sub', text: { color: INK_DIM } },
  { at: '.sm-stats', flex: true, box: { direction: 'row', justify: 'center', gap: 26 } },
  { at: '.sm-stats div', text: { size: 12, color: INK_DIM, upper: true, spacing: 1, align: 'center' } },
  { at: '.sm-stats b', text: { face: 'display', size: 24, color: INK, upper: false, spacing: 0, block: true } },
  { at: '.sm-items', flex: true, box: { direction: 'row', wrap: true, gap: 4, justify: 'center' } },
  {
    at: '.sm-items .chip',
    box: { padding: [2, 7], border: 1 },
    look: { fill: 'rgba(0,0,0,.6)', border: 'rgba(255,255,255,.1)' },
    text: (chip) => ({ size: 13, color: (chip as HTMLElement).style.color || INK, whole: true }),
  },
  { at: '.sm-items .chip.lost', look: { opacity: 0.55 } },
  { at: '.sm-items .chip.reveal', look: (chip) => ({ opacity: revealed(chip) }) },
  { at: '.sm-items .chip[data-r="ascendant"]', look: { border: 'rgba(255,116,23,.6)' } },
  { at: '.sm-items .chip[data-r="ultimate"]', look: { border: 'rgba(255,43,69,.7)' } },
  { at: '.sm-note', text: { color: '#9ccfff' } },
  { at: '.sm-note:empty', box: { display: 'none' } },
];

/** The run's summary drawn by the engine from now on. */
export function drawSummary(): void {
  drawModal('summary', SHEET);
}
