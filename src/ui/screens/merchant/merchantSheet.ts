// Odo's trade drawn by the engine (ui/kit's sheet; #973), rule for rule from `_merchant.scss`: his face in its oval
// (`folkFaceSheet.ts`) beside his name and terms; under them two columns (the page's grid's areas, its columns
// wrapped in the markup), choosing and offering down the left, the deal, what he said, the buttons and his warning
// down the right; on an upright screen one column. The three steps numbered, the next to do lit and those before it
// ticked; each piece a button in its rarity's colour, its icon, name and value as a badge, a picked one edged in gold
// and ticked; the deal's card (the tooltip's), the bar of its value against his price. The modal is `merchant.ts`'s
// markup, written and listened to there as before. Sizes are px of the lobby's scale. Not drawn: a name's clamp to two
// lines, the steps' fade, the bar's gradient (a flat fill of its middle).
import { SHORT, TOUCH } from '../../controlsSheet';
import { FOLK_FACE, faceBox } from '../../folkFaceSheet';
import { HELP_TEXT } from '../../helpTextSheet';
import { drawModal, finger } from '../../modalSheet';
import { FRAME, INK, INK_DIM, alpha } from '../../kit/theme';
import { mediaQuery } from '../../controlsSheet';
import { CARDS } from '../../tooltipPanel';
import { uiScales } from '../../scale';
import type { Panel } from '../../kit/panel';
import type { Sheet } from '../../kit/sheet';

/** an upright screen (`(orientation: portrait) and (max-width: 1000px)`): one column */
const UPRIGHT = mediaQuery('(orientation: portrait) and (max-width: 1000px)');
const GOLD = '#ffd27a';
const PALE = '#ffe7b0';
/** a piece's least width and the gap between pieces (`repeat(auto-fill, minmax(124px, 1fr))`, `gap: 6px`) */
const PIECE = { least: 124, gap: 6 };
/** the stash's room to its scroll bar's right (`padding-right: 4px`) */
const STASH_PAD = 4;

/** A piece's rarity colour, as the page writes it (`--rc`). */
const rarityOf = (element: Element): string =>
  (element as HTMLElement).style.getPropertyValue('--rc').trim() || INK_DIM;

/** A piece's width in its list: as many to a row as `auto-fill` fits at their least, sharing the row. */
function pieceWidth(list: Panel | null, inStash: boolean): number {
  const pad = inStash ? STASH_PAD : 0;
  const room = (list?.rect()?.w ?? 0) / uiScales.ui - pad;
  const n = Math.max(1, Math.floor((room + PIECE.gap) / (PIECE.least + PIECE.gap)));
  return Math.max(0, (room - PIECE.gap * (n - 1)) / n - 0.01);
}

/** The stash's most height: a share of the window's height in the box's own px (its `40vh` inside the box zoomed by
 *  the lobby's scale, so the window's share times that scale on the screen). */
const stashMost = (): number => innerHeight * (UPRIGHT() ? 0.26 : SHORT() ? 0.34 : 0.4);

/** The box, its face and name, and the two columns. */
const FRAMEWORK: Sheet = [
  ...HELP_TEXT,
  ...FOLK_FACE,
  ...CARDS,
  { at: '.mc-box', box: () => ({ width: 1040, gap: SHORT() ? 5 : 8 }), text: { align: 'start' } },
  { at: '.mc-who', flex: true, box: { direction: 'row', alignItems: 'center', justify: 'center', gap: 16 } },
  { at: '.mc-face', box: () => (SHORT() ? faceBox(40, 47) : faceBox(64, 75)) },
  { at: '.mc-whom', flex: true, box: { direction: 'column', gap: 2 } },
  { at: '.mc-box .sm-title', box: { margin: 0 }, text: () => ({ size: SHORT() ? 22 : 28, align: 'start' }) },
  { at: '.mc-sub', box: () => ({ margin: 0, display: SHORT() ? 'none' : 'flex' }),
    text: { size: 14, italic: true, color: INK_DIM, align: 'start' } },
  { at: '.mc-cols', flex: true, box: () => (UPRIGHT()
    ? { direction: 'column', gap: SHORT() ? 5 : 8 }
    : { direction: 'row', gap: 12, alignItems: 'stretch' }) },
  { at: '.mc-left, .mc-right', flex: true, box: () => ({ direction: 'column', gap: SHORT() ? 5 : 8, minWidth: 0,
    basis: UPRIGHT() ? 'auto' : 0 }) },
  { at: '.mc-left', box: () => ({ grow: UPRIGHT() ? 0 : 1.55 }) },
  { at: '.mc-right', box: () => ({ grow: UPRIGHT() ? 0 : 1 }) },
];

/** The steps: framed, each with its numbered disc, the next lit, those before ticked. */
const STEPS: Sheet = [
  { at: '.mc-step', flex: true, box: () => ({ direction: 'column', padding: SHORT() ? [5, 8] : [8, 10], border: 1 }),
    look: { fill: 'rgba(255,255,255,.015)', border: alpha(FRAME, 0.25), radius: 4 } },
  // (the stash's step down to the column's foot; the deal as tall as it holds: the page's `align-self: stretch` on
  // a row of `auto` height)
  { at: '.mc-give', box: { grow: 1 } },
  { at: '.mc-step.now', look: { fill: alpha(GOLD, 0.05), border: alpha(GOLD, 0.7) } },
  { at: '.mc-head', flex: true, box: { direction: 'row', justify: 'between', alignItems: 'center', gap: 8 } },
  { at: '.mc-label', flex: true, box: { direction: 'row', alignItems: 'center', gap: 8 },
    text: { face: 'display', weight: 700, size: 15, spacing: 0.75, upper: true, color: PALE, whole: true } },
  { at: '.mc-num', box: { width: 22, height: 22, alignItems: 'center', justify: 'center', shrink: 0 },
    look: { fill: alpha(FRAME, 0.7), radius: 11 },
    text: { face: 'display', weight: 700, size: 13, color: '#1a120a', align: 'center', upper: false } },
  { at: '.mc-step.now .mc-num', look: { fill: GOLD } },
  { at: '.mc-step.done .mc-num', look: { fill: '#46a84a' }, says: '✓', text: { color: '#fff' } },
  { at: ':is(.mc-restock, .mc-count)', text: { size: 13, color: INK_DIM, whole: true } },
  { at: '.mc-hint', box: { margin: [4, 0, 0, 0] }, text: { size: 13, color: INK_DIM, align: 'start' } },
  { at: '.mc-give.waiting .mc-hint', text: { color: GOLD } },
];

/** The pieces: his wares and the stash, each a button in its rarity's colour. */
const PIECES: Sheet = [
  { at: ':is(.mc-wares, .mc-stash)', flex: true, box: { direction: 'row', wrap: true, gap: PIECE.gap,
    alignContent: 'start', margin: [6, 0, 0, 0] } },
  { at: '.mc-stash', scrolls: true, box: () => ({ overflow: 'scroll', maxHeight: stashMost(),
    padding: [0, STASH_PAD, 0, 0] }) },
  { at: '.mc-give.waiting .mc-stash', look: { opacity: 0.35 } },
  {
    at: '.mc-item',
    flex: true,
    hits: true,
    box: (element, list) => ({ direction: 'column', justify: 'center', gap: 2,
      width: pieceWidth(list, !!element.closest('.mc-stash')),
      minHeight: SHORT() ? 44 : 52, padding: [5, 6, 5, 6 + 36 + 6], border: 1 }),
    look: (element) => ({ fill: 'rgba(255,255,255,.03)', border: alpha(rarityOf(element), 0.45), radius: 3 }),
    text: { size: 13, color: INK, align: 'start' },
    hover: { look: { fill: 'rgba(255,231,176,.08)' } },
  },
  { at: '.mc-give.waiting .mc-item', hits: false },
  { at: '.mc-item.picked', look: { fill: alpha(GOLD, 0.12), border: GOLD }, ring: GOLD,
    marks: [{ inset: [2, 5, 'auto', 'auto'], says: '✓', text: { size: 14, weight: 700, color: GOLD } }] },
  { at: '.mc-icon', box: { position: 'absolute', inset: ['50%', 'auto', 'auto', 6], margin: [-18, 0, 0, 0],
    width: 36, height: 36 } },
  { at: '.mc-icon svg', picture: [36, 36] },
  // (two lines at most: `-webkit-line-clamp: 2`)
  { at: '.mc-name', box: { padding: [0, 12, 0, 0], maxHeight: 13 * 1.15 * 2, overflow: 'hidden' },
    text: (element) => ({ size: 13, line: 1.15, color: rarityOf(element.closest('.mc-item') ?? element) }) },
  { at: '.mc-line', flex: true, box: { direction: 'row', alignItems: 'center', gap: 4 },
    text: { size: 11, spacing: 0.44, upper: true, color: INK_DIM, whole: true } },
  { at: '.mc-value', box: { padding: [0, 6] }, look: { fill: '#d8b060', radius: 9 },
    says: (element) => `◆ ${element.textContent ?? ''}`,
    text: { size: 12, spacing: 0, upper: false, color: '#1a120a', whole: true } },
];

/** The deal: what's got beside what's given, the bar, what's missing; then what he said, the buttons, his warning. */
const DEAL: Sheet = [
  { at: '.mc-deal-row', flex: true, box: { direction: 'column', gap: 6, margin: [6, 0, 0, 0] } },
  { at: '.mc-side', box: { margin: [0, 0, 4, 0] },
    text: { size: 12, upper: true, spacing: 0.72, color: INK_DIM, align: 'start' } },
  { at: '.mc-got', flex: true, scrolls: true, box: () => ({ overflow: 'scroll', maxHeight: SHORT() ? 70 : 220 }) },
  { at: '.mc-got .tt-card', box: { width: 'auto', padding: [6, 8] }, text: { size: 12 } },
  { at: '.mc-none', box: { padding: [14, 8], border: 1 }, look: { border: alpha(FRAME, 0.4), radius: 3 },
    text: { size: 13, color: INK_DIM, align: 'center' } },
  { at: '.mc-swap', box: () => ({ alignSelf: 'center', display: SHORT() ? 'none' : 'flex' }),
    says: '⇅', text: { size: 22, line: 1, color: GOLD } },
  { at: '.mc-bar', flex: true, box: { height: 28, border: 1, justify: 'center' },
    look: { fill: 'rgba(0,0,0,.45)', border: alpha(FRAME, 0.6) } },
  { at: '.mc-fill', box: (element) => ({ position: 'absolute', inset: [0, 'auto', 0, 0],
    width: ((element as HTMLElement).style.width || '0%') as `${number}%` }), look: { fill: '#8d6222' } },
  { at: '.mc-bar.enough .mc-fill', look: { fill: '#389038' } },
  { at: '.mc-sum', text: { size: 14, line: 26 / 14, color: INK, align: 'center',
    shadows: [{ x: 0, y: 1, blur: 2, color: '#000' }] } },
  { at: '.mc-need', box: { margin: [4, 0, 0, 0], minHeight: 13 * 1.2 }, text: { size: 13, color: '#ffb27a',
    align: 'start' } },
  { at: '.mc-need.ok', text: { color: '#7ad87e' } },
  { at: '.mc-said', box: { margin: 0, minHeight: 14 * 1.2 }, text: { size: 14, color: PALE, align: 'center' } },
  { at: '.mc-row', flex: true, box: { direction: 'row', wrap: true, justify: 'center', alignItems: 'center', gap: 16 } },
  { at: '.mc-row .btn', box: () => ({ minHeight: TOUCH() ? finger(36) : undefined }) },
  { at: '.mc-trade', box: { minWidth: 150 }, text: { size: 18 } },
  { at: '.mc-warn', box: () => ({ margin: 0, display: SHORT() ? 'none' : 'flex' }),
    text: { size: 12, color: INK_DIM, align: 'center' } },
];

/** Odo's trade drawn by the engine from now on, the page's out of sight. */
export function drawMerchant(): void {
  drawModal('merchant', [...FRAMEWORK, ...STEPS, ...PIECES, ...DEAL]);
}
