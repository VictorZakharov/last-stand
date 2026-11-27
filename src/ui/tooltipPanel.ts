// The tooltip drawn by the engine (ui/kit's sheet; #973): an item's card (and the one worn beside it), a skill's, an
// attribute's breakdown, a slot's. It was `#tooltip`, styled by `_tooltip.scss` and `_items.scss`; the page's stays laid
// out and placed as before (`tooltip.ts`: its flip and clamp read its size), painting nothing (`.kit-ghost`), and the
// cards are drawn where it stands, over every other of the kit's screens (made after them). Sizes are px of the lobby's
// scale (its cards' `zoom: var(--ui)`).
import { Panel } from './kit/panel';
import { SheetTree, type Sheet } from './kit/sheet';
import { CONTROLS } from './controlsSheet';
import { DANGER, FRAME, HIGHLIGHT, INK, INK_DIM, alpha, mix } from './kit/theme';
import { uiScales } from './scale';
import type { PanelStyle } from '../engine/ui';

/** An element's own colour (an inline `color`), or none. */
const inlineColour = (element: Element): string => (element as HTMLElement).style.color;
/** A card's colour (`--c`), or the frame's. */
const cardColour = (element: Element): string =>
  (element as HTMLElement).style.getPropertyValue('--c').trim() || FRAME;
const GREEN = '#4cff6a';

/** the page's tooltip's place, as `tooltip.ts` writes it: `translate(xpx, ypx)` */
const TRANSLATE = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/;

/** The tooltip where the page placed it (its transform: read as its box, it would lay the page out each frame), in
 *  px of the lobby's scale. */
function placed(page: Element): PanelStyle {
  const at = TRANSLATE.exec((page as HTMLElement).style.transform);
  const k = uiScales.ui;
  const [x, y] = at ? [Number(at[1]), Number(at[2])] : [0, 0];
  return { position: 'absolute', inset: [y / k, 'auto', 'auto', x / k], direction: 'column', alignItems: 'start' };
}

/** the cards' rules (an item's, a skill's, an attribute's), shown by the tooltip and the item's sheet */
export const CARDS: Sheet = [
  { at: '.tt-cards', flex: true, box: { direction: 'row', gap: 6, alignItems: 'start' } },
  { at: '.tt-cards.stack', box: { direction: 'column' } },
  {
    at: '.tt-card',
    flex: true,
    box: { direction: 'column', width: 280, padding: [10, 12], border: 1 },
    look: { fill: 'rgba(8,7,8,.97)', border: '#000', shadow: { blur: 24, y: 8, color: 'rgba(0,0,0,.9)' } },
    ring: cardColour,
  },
  { at: '.tt-card.empty', ring: '#555', text: { color: INK_DIM } },
  { at: '.tt-cards .tt-card + .tt-card', look: { opacity: 0.85 } },
  { at: '.attr-card', box: { width: 300 } },
  { at: '[style*="color"]', text: (element) => ({ color: inlineColour(element) }) },
  { at: '.tt-header', box: { margin: [0, 0, 4, 0], padding: [0, 0, 4, 0], border: [0, 0, 1, 0] },
    look: { border: 'rgba(255,255,255,.08)' }, text: { size: 11, upper: true, spacing: 1.5, color: INK_DIM } },
  { at: '.tt-head', flex: true, box: { direction: 'row', alignItems: 'center', gap: 10, margin: [0, 0, 2, 0] } },
  {
    at: '.tt-icon',
    flex: true,
    box: { width: 52, height: 52, padding: 3, border: 1, shrink: 0, alignItems: 'center', justify: 'center' },
    look: (element) => ({ fill: [mix(cardColour(element), 0.25, '#151315'), '#080708'], radial: { y: 0.45, stop: 0.8 },
      border: mix(cardColour(element), 0.6, '#000000') }),
  },
  { at: '.tt-icon svg', picture: [44, 44] },
  { at: '.tt-name', text: { face: 'display', size: 17, weight: 700 } },
  { at: '.tt-name[style*="color"]', text: (element) => ({ face: 'display', size: 17, weight: 700,
    color: inlineColour(element) }) },
  { at: '.tt-type', box: { margin: [0, 0, 6, 0] }, text: { size: 12, color: INK_DIM } },
  { at: '.tt-stat', text: { color: '#8fb4ff' } },
  { at: '.tt-stat.implicit', text: { color: INK } },
  { at: '.tt-stat.implicit[style*="color"]', text: (element) => ({ color: inlineColour(element) }) },
  { at: '.tt-stat.lost', text: { color: '#6a6a74' } },
  { at: '.tt-delta', text: { weight: 700, size: 13 } },
  { at: '.tt-delta.up', text: { color: GREEN } },
  { at: '.tt-delta.down', text: { color: DANGER } },
  { at: '.tt-desc', box: { margin: [4, 0, 0, 0] }, text: { color: INK_DIM } },
  { at: '.tt-foot', box: { margin: [6, 0, 0, 0] }, text: { size: 12, color: INK_DIM } },
  { at: '.tt-foot.capped', text: { color: HIGHLIGHT } },
  { at: '.tt-block', box: { maxWidth: 300 }, text: { line: 1.35 } },
  { at: '.tt-dmg', flex: true, box: { direction: 'column', margin: [7, 0, 0, 0], padding: [6, 0, 0, 0],
    border: [1, 0, 0, 0] }, look: { border: alpha(FRAME, 0.25) }, text: { line: 1.35 } },
  { at: '.tt-hit', text: { color: INK } },
  { at: '.tt-hit b', text: { color: HIGHLIGHT, weight: 700 } },
  { at: '.tt-note', box: { margin: [0, 0, 2, 0] }, text: { size: 12, color: INK_DIM } },
  { at: '.tt-made, .tt-crit', box: { margin: [3, 0, 0, 0] }, text: { size: 12, color: INK_DIM } },
  { at: '.tt-crit b', text: { color: INK } },
  {
    at: '.tt-footbar',
    box: { margin: [4, 0, 0, 0], padding: [4, 10], border: 1, alignSelf: 'start' },
    look: { fill: 'rgba(8,7,8,.95)', border: alpha(FRAME, 0.4) },
    text: { size: 12, color: INK_DIM },
  },
  // an attribute's breakdown (`attributes.ts`)
  { at: '.attr-total', box: { margin: [2, 0, 8, 0] }, text: { face: 'display', size: 26, color: '#f3e1b0' } },
  { at: '.attr-rows', flex: true, box: { direction: 'column', gap: 4 } },
  { at: '.attr-row', flex: true, box: { direction: 'row', justify: 'between', alignItems: 'center', gap: 10 },
    text: { size: 13 } },
  { at: '.attr-row b', text: { weight: 700, whole: true } },
  { at: '.attr-row b.up', text: { color: GREEN } },
  { at: '.attr-src', flex: true, box: { direction: 'row', alignItems: 'center', gap: 6, minWidth: 0 } },
  { at: '.attr-src span', box: { minWidth: 0, overflow: 'hidden' }, text: { whole: true } },
  { at: '.attr-src .item-icon', box: { width: 24, height: 24, shrink: 0 }, picture: [24, 24] },
  { at: '.attr-src.base', text: { color: INK_DIM } },
  { at: '.attr-empty', text: { size: 12, color: INK_DIM, italic: true } },
];

const TOOLTIP: Sheet = [
  ...CONTROLS,
  { at: '#tooltip', flex: true, box: placed, text: { size: 14 } },
  ...CARDS,
];

let tooltip: SheetTree | null = null;

/** The tooltip drawn by the engine from now on, the page's laid out and placed as before, painting nothing. */
export function drawTooltip(): void {
  const page = document.getElementById('tooltip');
  if (!page || tooltip) return;
  page.classList.add('kit-ghost');
  const room = new Panel(null, { position: 'absolute', inset: 0 }, {}, 'ui');
  tooltip = new SheetTree(page, TOOLTIP, 'ui', room);
}
