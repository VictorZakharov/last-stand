// A tapped item's sheet drawn by the engine (ui/kit's sheet; #973): its card (and the worn one's beside it) scrolling
// inside the box, its buttons under them always in view. It was `#item-sheet`, styled by `_modals.scss`; the page's
// stays, out of sight, written by `menus.ts` (`openItemSheet`) as before. Sizes are px of the lobby's scale.
import { SHORT } from './controlsSheet';
import { drawModal, windowShare } from './modalSheet';
import { CARDS } from './tooltipPanel';
import type { Sheet } from './kit/sheet';

/** a card's width on a short screen: two side by side across the room (`min(440px, (94vw / --ui - 44px) / 2)`) */
const shortCard = (): number => Math.min(440, (windowShare(0.94).w - 44) / 2);
/** a card's width elsewhere (`.tt-card`), the gap between two, and the box's padding and frame across */
const CARD = 280;
const APART = 6;

/** The box's width: its cards side by side, as wide as they ask (a scrolling part asks for none of its own, and the
 *  box stood 25 px wide), held to the window. */
function boxWidth(box: Element): number {
  const cards = box.querySelectorAll('.is-card .tt-card').length || 1;
  const across = SHORT() ? 16 * 2 + 2 * 2 : 26 * 2 + 2 * 2;
  const wanted = cards * (SHORT() ? shortCard() : CARD) + (cards - 1) * APART + across;
  return Math.min(wanted, windowShare(0.96).w);
}

const SHEET: Sheet = [
  ...CARDS,
  { at: '#item-sheet .modal-box', box: (element) => ({ width: boxWidth(element), maxWidth: windowShare(0.96).w }) },
  { at: '#item-sheet .is-card', flex: true, scrolls: true,
    box: { direction: 'row', justify: 'center', shrink: 1, minHeight: 0, overflow: 'scroll' }, text: { align: 'start' } },
  { at: '#item-sheet .tt-cards', box: { wrap: true, justify: 'center' } },
  // (the cards' inline `flex: none` kept, which the page writes as `0 0 auto`, as the page's: they no longer shrink to scroll, the lab's canary)
  { at: '#item-sheet .is-card[style*="flex: 0 0"]', box: { shrink: 0, overflow: 'visible' } },
  // (a block of a given height among the cards: the lab's card longer than the window, px of the zoomed box)
  { at: '#item-sheet .is-card > div[style*="height"]', box: (element) =>
    ({ height: parseFloat((element as HTMLElement).style.height) || 0, shrink: 0 }) },
  { at: '#item-sheet .modal-box', when: SHORT, box: { padding: [12, 16], gap: 10 } },
  { at: '#item-sheet .tt-card', when: SHORT, box: () => ({ width: shortCard() }), text: { size: 13 } },
  { at: '#item-sheet .tt-name', when: SHORT, text: { size: 16 } },
  { at: '#item-sheet :is(.tt-desc, .tt-block)', when: SHORT, box: { maxWidth: 'auto' },
    text: { size: 11, line: 1.3 } },
];

/** The item's sheet drawn by the engine from now on. */
export function drawItemSheet(): void {
  drawModal('item-sheet', SHEET);
}
