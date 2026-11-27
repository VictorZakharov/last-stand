// The trade between two players drawn by the engine (ui/kit's sheet; #973), rule for rule from `_trade.scss`: the
// window (a modal: both offers side by side over our stash, the accepts under the offers, the line saying where it
// stands, Accept and Cancel), on a short screen the stash beside the offers and the wider; the ask and the last word
// at the top's middle of the screen, over the modals (Play together's list, where a trade is asked from). Each is
// `trade.ts`'s markup, written and listened to there as before. Sizes are px of the lobby's scale. Not drawn: a
// long name's ellipsis (cut at its box), a dimmed item's grey.
import { CONTROLS, SHORT, TOUCH } from '../../controlsSheet';
import { accent } from '../../diagFrame';
import { HELP_TEXT } from '../../helpTextSheet';
import { drawModal, finger, windowShare } from '../../modalSheet';
import { INK, INK_DIM, FRAME, alpha, mix } from '../../kit/theme';
import { Panel, LAYERS, layer } from '../../kit/panel';
import { SheetTree, type Sheet } from '../../kit/sheet';
import { uiScales } from '../../scale';

/** the colour healing is said in (`$heal`) */
const HEAL = '#4cff6a';
/** a grid's gap between squares, and its padding and border (px) */
const GRID = { gap: 3, pad: 4, border: 1 };
/** the ask and the last word: their top (px of the lobby's scale, under the room's bar), over the modals */
const ASK_TOP = 158;
const ASK_LAYER = LAYERS.modal + 2;

/** How many squares to a row of `grid`: an offer's six, the stash's twelve (eight on a short screen). */
function perRow(grid: Element | null): number {
  if (grid?.classList.contains('tr-offer')) return 6;
  return SHORT() ? 8 : 12;
}

/** A square's side in its grid (`repeat(n, 1fr)`), a hair under its share. */
function squareSide(grid: Panel | null, n: number): number {
  const width = (grid?.rect()?.w ?? 0) / uiScales.ui - (GRID.pad + GRID.border) * 2;
  return Math.max(0, (width - GRID.gap * (n - 1)) / n - 0.01);
}

/** An item's colour, as the page writes it (`--c`). */
const colourOf = (element: Element): string =>
  (element as HTMLElement).style.getPropertyValue('--c').trim() || '#555';

/** The window: its title, the offers, the stash, the line and the buttons. */
const WINDOW: Sheet = [
  ...HELP_TEXT,
  { at: '#trade .modal-box', box: () => ({ width: SHORT() ? 860 : 600, gap: SHORT() ? 4 : 8,
    padding: SHORT() ? [8, 12] : [16, 20] }) },
  { at: '#trade .sm-title', text: () => ({ size: SHORT() ? 18 : 24, anywhere: true }) },
  { at: '.tr-body', flex: true, box: () => (SHORT()
    ? { direction: 'row-reverse', gap: 12, minHeight: 0, alignItems: 'start' }
    : { direction: 'column', gap: 10, minHeight: 0 }) },
  // (a short screen: the stash 1.6 shares of the row, the offers 1)
  { at: '.tr-stash-side', flex: true, box: () => (SHORT() ? { grow: 1.6, basis: 0, minWidth: 0, minHeight: 0 }
    : { minHeight: 0 }) },
  { at: '.tr-offers', flex: true, box: () => (SHORT() ? { direction: 'column', gap: 6, grow: 1, basis: 0, minWidth: 0 }
    : { direction: 'row', gap: 14 }) },
  { at: '.tr-side', flex: true, box: { grow: 1, basis: 0, minWidth: 0 } },
  { at: '.tr-h', flex: true, box: () => ({ direction: 'row', justify: 'between', alignItems: 'center', gap: 10,
    margin: [0, 0, SHORT() ? 2 : 4, 0] }),
  text: () => ({ face: 'display', weight: 700, size: 12, spacing: 2, upper: true, color: accent(), align: 'start' }) },
  { at: '.tr-h > span:first-child', box: { minWidth: 0, overflow: 'hidden', shrink: 1 }, text: { whole: true } },
  { at: '.tr-count', box: { shrink: 0 },
    text: { face: 'body', weight: 400, size: 12, spacing: 0, upper: false, color: INK_DIM, whole: true } },
  // the grids of squares
  { at: '.tr-grid', flex: true, box: { direction: 'row', wrap: true, gap: GRID.gap, alignContent: 'start',
    padding: GRID.pad, border: GRID.border }, look: { fill: 'rgba(0,0,0,.35)', border: alpha(FRAME, 0.35) } },
  { at: '.tr-stash', scrolls: true, box: () => ({ overflow: 'scroll',
    maxHeight: SHORT() ? windowShare(0.64).h : 196 }) },
  {
    at: '.tr-grid > .sitem',
    flex: true,
    hits: true,
    box: (element, round) => {
      const side = squareSide(round, perRow(element.parentElement));
      return { width: side, height: side, padding: 3, border: 1, alignItems: 'center', justify: 'center' };
    },
    look: (element) => ({ fill: [mix(colourOf(element), 0.22, '#151315'), '#080708'], radial: { y: 0.45, stop: 0.78 },
      border: '#000' }),
    ring: colourOf,
    hover: { lit: 1.35 },
  },
  { at: '.tr-grid > .sitem .item-icon', picture: (element, round) => {
    const side = Math.max(1, squareSide(round?.parent ?? null, perRow(element.closest('.tr-grid'))) - 8);
    return [side, side];
  } },
  { at: '.tr-item.dim', look: { opacity: 0.35 } },
  { at: '.tr-empty', hits: false, look: { opacity: 0.5 } },
  // the accepts, the line, the buttons
  { at: '.tr-ok', box: () => ({ margin: [SHORT() ? 2 : 4, 0, 0, 0] }),
    text: () => ({ size: SHORT() ? 12 : 13, color: INK_DIM, align: 'start' }) },
  { at: '.tr-ok.on', text: { color: HEAL, weight: 700 } },
  { at: '.tr-line', box: () => ({ margin: 0, minHeight: SHORT() ? 0 : 14 * 1.3 * 2 }),
    text: () => ({ size: SHORT() ? 13 : 14, color: INK, align: 'center' }) },
  { at: '.tr-buttons', flex: true, box: { direction: 'row', justify: 'center', gap: 10 } },
  { at: '.tr-buttons .btn', box: () => ({ minWidth: 140,
    minHeight: TOUCH() ? finger(SHORT() ? 36 : 44) : undefined }) },
  { at: '.tr-buttons .btn:disabled', hits: false, look: { opacity: 0.45 } },
];

/** The ask (Trade or Decline; Cancel while asking) and the last word, a framed row at the top's middle. */
const ASK: Sheet = [
  ...CONTROLS,
  {
    at: ':is(#trade-ask, #trade-note)',
    flex: true,
    box: () => ({ direction: 'row', wrap: true, alignItems: 'center', justify: 'center', gap: [10, 6],
      maxWidth: (innerWidth - 16) / uiScales.ui, padding: [8, 10, 8, 14], border: 1, margin: [ASK_TOP, 0, 0, 0] }),
    look: () => ({ fill: ['rgba(20,17,16,.97)', 'rgba(8,7,8,.97)'], border: accent(),
      shadow: { blur: 18, y: 6, color: 'rgba(0,0,0,.7)' } }),
    text: { size: 14, color: INK },
  },
  { at: ':is(#trade-ask, #trade-note).hidden', box: { display: 'none' } },
  { at: '#trade-ask .btn', hits: true, box: () => ({ padding: [5, 12], minHeight: TOUCH() ? finger(40) : undefined }),
    text: { size: 13 } },
  { at: '#trade-ask-text', box: { minWidth: 0 } },
  { at: '.tr-cls', text: { color: INK_DIM } },
  { at: '#trade-note', box: { padding: [8, 14] } },
  { at: '#trade-note.done', look: { border: HEAL }, text: { color: HEAL } },
];

const asks: SheetTree[] = [];

/** The trade's window, ask and last word drawn by the engine from now on, the page's own out of sight. */
export function drawTrade(): void {
  if (asks.length) return;
  drawModal('trade', WINDOW);
  for (const id of ['trade-ask', 'trade-note']) {
    const page = document.getElementById(id);
    if (!page) continue;
    page.classList.add('kit-mirror');
    const room = new Panel(layer(ASK_LAYER),
      { position: 'absolute', inset: 0, direction: 'column', alignItems: 'center', justify: 'start' }, {}, 'ui');
    asks.push(new SheetTree(page, ASK, 'ui', room));
  }
}
