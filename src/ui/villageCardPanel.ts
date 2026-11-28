// The card a village object opens drawn by the engine (ui/kit's sheet; #973): a portal's starting wave and Enter, the
// training grounds' battleground, the chronicle's records and save slots, the duel's menu and the great ledger. It
// was `#vcard`, styled by `_lobby.scss`, `_controls.scss`, `_training.scss` and `_responsive.scss`; the page's stays,
// out of sight (`.kit-mirror`), written by `villageCard.ts`, `menus.ts` and `pvpMenu.ts` as before, and the sheet
// here follows it each frame. Sizes are px of the lobby's scale.
import { Panel, onFrame, LAYERS, layer } from './kit/panel';
import { SheetTree, type Sheet } from './kit/sheet';
import { CONTROLS, SHORT, SHORT_OR_UPRIGHT, TOUCH } from './controlsSheet';
import { accent } from './diagFrame';
import { FRAME, FRAME_DARK, HIGHLIGHT, INK, INK_DIM, WELL, alpha } from './kit/theme';
import { uiScales } from './scale';

/** the card's foot over the screen's (px), and a short screen's */
const FOOT = 28;
const FOOT_SHORT = 12;
/** the room left either side of it (`max-width: calc(100vw / var(--ui) - 24px)`) */
const SIDES = 12;
/** a finger's height on touch (css px) */
const FINGER = 40;

const CREAM = '#ffe7b0';
const NOTE = '#f0c88a';
/** the ledger's boards: at least this wide (px), this far apart across, the card's padding and the book's, and how
 *  far under its share a board is held (a row filled exactly wrapped its last board by a fraction of a px) */
const BOARD = { least: 210, apart: 16, around: 22 * 2 + 2 * 2 + 4, rounding: 0.01 };
/** the ledger card's width (px) */
const LEDGER = 760;

/** A board's width: the book's width shared by as many as fit (`repeat(auto-fit, minmax(210px, 1fr))`). */
function boardWidth(): number {
  const book = Math.min(LEDGER, innerWidth / uiScales.ui - SIDES * 2) - BOARD.around;
  const columns = Math.max(1, Math.floor((book + BOARD.apart) / (BOARD.least + BOARD.apart)));
  return (book - BOARD.apart * (columns - 1)) / columns - BOARD.rounding;
}

/** the window's height in px of the lobby's scale */
const tall = (): number => innerHeight / uiScales.ui;

const CARD: Sheet = [
  ...CONTROLS,
  {
    at: '#vcard',
    flex: true,
    hits: true,
    box: { direction: 'column', gap: 12, padding: [18, 22, 14, 22], width: 380, maxWidth: '100%', border: 2 },
    look: { fill: ['rgba(8,7,9,.94)', 'rgba(8,7,9,.86)'], border: FRAME_DARK,
      shadow: { blur: 40, y: 10, color: 'rgba(0,0,0,.8)' } },
    text: { align: 'center' },
    ring: FRAME,
    brackets: true,
  },
  { at: '#vcard', when: SHORT_OR_UPRIGHT, box: { padding: [12, 18, 10, 18], gap: 8 } },
  { at: '.vc-title', text: { face: 'display', size: 24, color: CREAM,
    shadows: [{ x: 0, y: 0, blur: 10, color: alpha('#e2c07e', 0.3) }] } },
  { at: '.vc-sub', box: { margin: [-6, 0, 0, 0] }, text: { size: 14, color: INK_DIM, italic: true } },
  { at: '.vc-page', flex: true, box: { direction: 'column', gap: 12 } },
  { at: '.vc-row', flex: true, box: { direction: 'row', justify: 'center', gap: 10, wrap: true } },
  { at: '.vc-close', box: { alignSelf: 'center' } },
  // the battleground's and the wave's rows
  { at: '.biome-row', flex: true, box: { direction: 'row', alignItems: 'center', justify: 'between', gap: 10 } },
  { at: '.br-label', text: { size: 11, spacing: 1.5, upper: true, color: INK_DIM } },
  { at: '#opt-wave button', box: { padding: [5, 10] }, text: { size: 18, line: 1 } },
  { at: '#opt-wave button:disabled', look: { opacity: 0.35 }, hover: { text: { color: INK_DIM } } },
  {
    at: '#opt-wave .wv-val',
    box: { minWidth: 6.5 * 15, padding: [6, 8], border: [0, 0, 0, 1], justify: 'center', alignItems: 'center' },
    look: { fill: WELL, border: alpha(FRAME, 0.35) },
    text: { size: 15, color: CREAM, align: 'center' },
  },
  { at: '#opt-wave .wv-val small', text: () => ({ color: accent() }) },
  { at: '.vc-training', flex: true, box: { direction: 'column', gap: 10, alignItems: 'center' } },
  { at: '.vc-training p', text: { size: 14, color: NOTE } },
  // the chronicle's records, two to a row (four on a short screen), each its icon beside its figure and name
  { at: '.records', flex: true, box: { direction: 'row', wrap: true, gap: 8 } },
  {
    at: '.rec',
    flex: true,
    box: { direction: 'column', basis: '40%', grow: 1, padding: [8, 12, 8, 12 + 34 + 12], border: 1,
      justify: 'center' },
    look: { fill: ['rgba(40,32,22,.55)', 'rgba(12,10,12,.8)'], border: alpha(FRAME, 0.35) },
  },
  {
    at: '.rec-icon',
    box: { position: 'absolute', inset: ['50%', 'auto', 'auto', 12], margin: [-17, 0, 0, 0], width: 34, height: 34,
      border: 1, alignItems: 'center', justify: 'center' },
    look: { fill: ['#3a3024', '#0c0a0a'], radial: { y: 0.35, stop: 0.75 }, border: alpha(FRAME, 0.5), radius: 17 },
    text: () => ({ size: 20, color: accent(), shadows: [{ x: 0, y: 0, blur: 8, color: alpha('#f0be5a', 0.45) }] }),
  },
  { at: '.rec-icon svg', picture: [20, 20] },
  { at: '.rec-val', text: { face: 'display', size: 24, weight: 700, line: 1, color: '#f3e1b0' } },
  { at: '.rec-label', text: { size: 11, spacing: 1.5, upper: true, color: INK_DIM } },
  { at: '.rec', when: SHORT_OR_UPRIGHT, box: { basis: '20%', padding: [6, 4] } },
  { at: '.rec-icon', when: SHORT_OR_UPRIGHT, box: { display: 'none' } },
  // the great ledger's pages: its boards side by side, as many as fit, scrolled where the screen is short
  { at: '#vcard[data-page="records"]', box: () => ({ width: LEDGER, maxHeight: tall() - 40 }) },
  { at: '#vcard[data-page="records"] .vc-page[data-page="records"]', box: { minHeight: 0, grow: 1, shrink: 1 } },
  {
    at: '.rec-book',
    flex: true,
    scrolls: true,
    box: () => ({ direction: 'row', wrap: true, gap: [16, 10], overflow: 'scroll', minHeight: 0,
      maxHeight: tall() - 190, padding: [0, 4, 0, 0] }),
    text: { align: 'start' },
  },
  { at: '.rec-book section', flex: true, box: () => ({ direction: 'column', width: boardWidth(), shrink: 0,
    padding: [8, 10], border: 1 }),
    look: { fill: 'rgba(255,231,176,.05)', border: alpha(FRAME, 0.3) } },
  { at: '.rec-book h3', box: { margin: [0, 0, 6, 0] }, text: { face: 'display', size: 15, color: CREAM, spacing: 0.5 } },
  { at: '.rec-book dl', flex: true, box: { direction: 'row', wrap: true, gap: [10, 2] }, text: { size: 14 } },
  // (a row a word and its figure, as the grid's `1fr auto`: the word at least 60% wide, so the next can't follow it)
  { at: '.rec-book dt', box: { minWidth: '60%' }, text: { color: INK_DIM } },
  { at: '.rec-book dd', box: { basis: 0, grow: 1 }, text: { color: INK, align: 'end' } },
  // the duel's menu: its sides face to face, who watches under them
  { at: '.pvp-choices', flex: true, box: { direction: 'column', gap: 12 } },
  { at: '#pvp-sides', flex: true, box: { direction: 'row', wrap: true, gap: [10, 8], alignItems: 'start' } },
  {
    at: '.pvp-side',
    flex: true,
    box: { direction: 'column', gap: 6, minWidth: 0, basis: 0, grow: 1, padding: 8, border: 1 },
    look: { fill: 'rgba(255,255,255,.03)', border: alpha(FRAME, 0.35), radius: 3 },
  },
  { at: '.pvp-side[data-part="0"]', look: { border: 'rgba(208,96,60,.6)' } },
  { at: '.pvp-side[data-part="1"]', look: { border: 'rgba(106,184,255,.6)' } },
  { at: '.pvp-watch', box: { basis: '100%', direction: 'row', alignItems: 'center', justify: 'center', wrap: true,
    padding: [6, 8] } },
  { at: '.pvp-versus', box: { alignSelf: 'center' }, text: { face: 'display', weight: 700, size: 15, color: INK_DIM } },
  { at: '.pvp-list', flex: true, box: { direction: 'column', gap: 5, minWidth: 0 } },
  { at: '.pvp-watch .pvp-list', box: { direction: 'row', wrap: true, justify: 'center', alignItems: 'center' } },
  {
    at: '.pvp-place',
    box: { maxWidth: '100%', padding: [5, 10], border: 1, overflow: 'hidden' },
    look: { fill: WELL, border: alpha(FRAME, 0.55), radius: 3 },
    text: { face: 'body', size: 14, color: INK, whole: true },
  },
  { at: '.pvp-place:not(:disabled)', hover: { text: { color: CREAM }, look: { border: HIGHLIGHT } } },
  { at: '.pvp-open', text: { italic: true, color: INK_DIM } },
  { at: '.pvp-place.mine, .pvp-watcher.mine', look: { border: 'rgba(240,200,138,.8)' }, text: { color: CREAM } },
  { at: '.pvp-place.asked', look: { border: HIGHLIGHT }, ring: 'rgba(240,200,138,.5)' },
  { at: '.pvp-watcher', box: { padding: [2, 6] }, text: { size: 14, color: INK, whole: true } },
  { at: '.pvp-none', text: { size: 13, italic: true, color: INK_DIM } },
  { at: '.pvp-player.ready', after: { says: ' ✓', text: { color: '#8fd08a' } } },
  { at: '#pvp-note', text: { size: 14, color: NOTE } },
  { at: '#pvp-party', box: { alignSelf: 'center' } },
  { at: '.pvp-place, [data-page="pvp"] .seg button', when: TOUCH, box: () => ({ minHeight: FINGER / uiScales.ui }) },
  // a partner's ask for this player's place, in the card in place of its last line and button
  { at: '#duel-ask.inline', flex: true, box: { direction: 'row', wrap: true, alignItems: 'center', justify: 'center',
    gap: [8, 4] }, text: { size: 14, color: NOTE } },
  { at: '#duel-ask .btn', box: { padding: [5, 12] }, text: { size: 13 } },
  { at: '#duel-ask .btn', when: TOUCH, box: () => ({ minHeight: FINGER / uiScales.ui }) },
  { at: '.vc-page[data-page="pvp"].asking #pvp-note, .vc-page[data-page="pvp"].asking #pvp-go',
    box: { display: 'none' } },
  // a phone held sideways: the duel's choices beside its sides, its last line and button under both
  { at: '#vcard[data-page="pvp"]', when: SHORT, box: { width: 720 } },
  { at: '#vcard[data-page="pvp"] .vc-sub', when: SHORT, box: { display: 'none' } },
  { at: '.vc-page[data-page="pvp"]', when: SHORT, box: { direction: 'row', wrap: true, gap: [18, 6],
    alignItems: 'center' } },
  { at: '.vc-page[data-page="pvp"] .pvp-choices', when: SHORT, box: { gap: 6, basis: '40%', grow: 1, minWidth: 0 } },
  { at: '.vc-page[data-page="pvp"] #pvp-sides', when: SHORT, box: { basis: '50%', grow: 1.15, minWidth: 0 } },
  { at: '.vc-page[data-page="pvp"] .pvp-choices:has(+ #pvp-sides.hidden)', when: SHORT,
    box: { basis: '100%', margin: [0, '20%'] } },
  { at: '.vc-page[data-page="pvp"] :is(#pvp-note, #pvp-go, #pvp-party, #duel-ask)', when: SHORT,
    box: { basis: '100%' } },
  { at: '.vc-page[data-page="pvp"] #pvp-go', when: SHORT, box: { padding: [8, 30] }, text: { size: 17 } },
  { at: '.pvp-side', when: SHORT, box: { padding: [5, 8], gap: 4 } },
];

let card: SheetTree | null = null;
let room: Panel | null = null;

/** The card's room: the screen, the card stood at its foot's middle. */
function placeRoom(): void {
  room!.style({ padding: [0, SIDES, SHORT_OR_UPRIGHT() ? FOOT_SHORT : FOOT, SIDES] });
}

/** The village's card drawn by the engine from now on, its page element out of sight. */
export function drawVillageCard(): void {
  const page = document.getElementById('vcard');
  if (!page || card) return;
  page.classList.toggle('kit-mirror', true);
  room = new Panel(layer(LAYERS.lobby), { position: 'absolute', inset: 0, direction: 'column', justify: 'end',
    alignItems: 'center' },
    {}, 'ui');
  card = new SheetTree(page, CARD, 'ui', room);
  onFrame(() => {
    // (the room shows only with the lobby's menu and the card: it's inside `#menu`, hidden in a run)
    const menu = document.getElementById('menu');
    room!.show(!!menu && !menu.classList.contains('hidden') && !page.classList.contains('hidden'));
    placeRoom();
  });
}

/** The card's panel, once it's drawn (the lab reads it). */
export const villageCardPanel = (): Panel | null => card?.panel ?? null;
