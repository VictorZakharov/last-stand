// A hero's page of the guide as the kit draws it (#973, `guideSheet.ts`), rule for rule from `styles/_guide.scss`:
// his skills as their tooltips' cards beside their keys and icons, a key's cap (the mouse's a drawn mouse), a
// loadout's keys as the skill bar's slots in a framed tray (one row where the page has room, else two), the weapon
// styles and loadouts each down a coloured edge, the combos' cards (their steps beside their words, over them on a
// narrow page), the styles' and the staffs' tables, and the gear's bases. Sizes are px of the lobby's scale.
import { accent } from '../diagFrame';
import { FRAME, HIGHLIGHT, INK, INK_DIM, alpha } from '../kit/theme';
import { scrolledAcross } from '../kit/scroll';
import { measure, type TextStyle } from '../overlay/paint';
import { BODY } from '../kit/sheetRules';
import { NARROW, SKINNY, autoFill, colourOf, innerOf, pageWidth } from './guideRoom';
import { RAISED } from './guidePageSheet';
import { skillArt } from './guidePaint';
import type { Panel } from '../kit/panel';
import type { Sheet } from '../kit/sheet';

/** a loadout's slot, the gap between two, and the tray's padding and frame either side (`$key-slot`, ...) */
const KEY = { slot: 100, gap: 4, tray: 24, indent: 18 };
/** the side of a slot's icon, and of a table's skill's picture, wide and on a narrow page (`$cell-art`) */
const ART = 52;
const CELL = { wide: 92, narrow: 80 };
/** a combo's steps' column and the room past it (`grid-template-columns: 330px ...`, `column-gap`) */
const COMBO = { steps: 330, gap: 20, slot: 11 + ART + 8 + 14 * 1.2 };
/** a page too narrow for a combo's steps beside its words, or six pictures across (`@container (max-width: 640px)`) */
const NARROW_PAGE = (): boolean => pageWidth() <= 640;

/** A loadout tray's columns: its slots on one row while the page has room for them, else on two (`data-n`). */
function columns(tray: Element | null): number {
  const n = Number((tray as HTMLElement | null)?.dataset.n) || 7;
  const row = n * KEY.slot + (n - 1) * KEY.gap + KEY.tray + KEY.indent;
  return pageWidth() > row ? n : Math.ceil(n / 2);
}

/** A table's columns: its row labels' as wide as the widest, the others sharing what's left, a styles' table's
 *  pictures at their size on a narrow page (scrolled across). */
function cellWidth(cell: Element, round: Panel | null): number {
  const table = cell.closest('.gd-compare');
  const keys = !!table?.classList.contains('keys');
  const row = cell.parentElement;
  const count = row?.children.length ?? 1;
  const first = keys ? 46 : labelsWidth(table) + 20;
  if (row?.firstElementChild === cell) return first;
  if (keys && NARROW_PAGE()) return 88;
  return Math.max(0, (innerOf(round) - first) / Math.max(1, count - 1) - 0.01);
}
const LABEL: TextStyle = { ...BODY, size: 13, color: INK_DIM };
const labelsWidth = (table: Element | null): number => Math.max(0,
  ...[...(table?.querySelectorAll('tbody th') ?? [])].map((th) => measure(th.textContent ?? '', LABEL).w)) + 1;

/** A table's skill's picture's side: its cell's width, at most its size. */
function cellArt(element: Element, round: Panel | null): number {
  const cell = element.closest('td');
  const most = NARROW_PAGE() ? CELL.narrow : CELL.wide;
  return cell ? Math.min(most, cellWidth(cell, round?.parent ?? null) - 8) : most;
}

/** A table's name's size: every name of the table one size, its longest's fitted to the picture's width (`--len`). */
function nameSize(element: Element): number {
  const table = element.closest('.gd-compare') as HTMLElement | null;
  const len = Number(table?.style.getPropertyValue('--len')) || 15;
  const side = NARROW_PAGE() ? CELL.narrow : CELL.wide;
  return Math.min(13, (190 * side) / 100 / len);
}

/** the words over a picture: a dark outline */
const OVER_ART = [{ x: 0, y: 0, blur: 2, color: '#000' }, { x: 0, y: 1, blur: 2, color: '#000' }];

/** The skills' cards, their icons and keys' caps. */
const SKILLS: Sheet = [
  { at: '.gd-skills', flex: true, box: { direction: 'row', wrap: true, gap: 10 } },
  { at: '.gd-skill', flex: true, box: (element, round) => ({ direction: 'row', gap: 10, padding: 10, border: 1,
    minWidth: 0, ...(NARROW() ? { width: innerOf(round), shrink: 0 } : autoFill(340, 10)(element, round)) }),
  look: { fill: RAISED, border: alpha(FRAME, 0.25) } },
  { at: '.gd-skey', flex: true, box: { direction: 'column', alignItems: 'center', gap: 6, shrink: 0 } },
  { at: '.gd-scard', flex: true, box: { direction: 'column', grow: 1, basis: 0, minWidth: 0 } },
  // (a tooltip's card laid in the page: its frame and size left to the page)
  { at: '.gd-scard .tt-card', box: { width: 'auto', padding: 0, border: 0 }, ring: () => '',
    look: { fill: 'rgba(0,0,0,0)', border: 'rgba(0,0,0,0)', shadow: undefined } },
  { at: '.gd-scard .tt-block', box: { maxWidth: 'auto' } },
  { at: '.gd-tip', box: { margin: [6, 0, 0, 0], padding: [6, 0, 0, 0], border: [1, 0, 0, 0] },
    look: { border: alpha(FRAME, 0.25) }, text: { size: 14, color: HIGHLIGHT } },
  // a skill's icon: its painted art, or its glyph
  { at: '.gd-ic', flex: true, box: { shrink: 0 } },
  { at: '.gd-ic i', box: { width: 24, height: 24, shrink: 0 },
    text: { size: 16, line: 24 / 16, align: 'center', italic: false } },
  { at: '.gd-ic i.art', paint: skillArt(false) },
  { at: '.gd-ic.big i', box: { width: ART, height: ART, border: 1 },
    look: { fill: 'rgba(0,0,0,.4)', border: alpha(FRAME, 0.5) }, text: { size: 32, line: (ART - 2) / 32 } },
  // a key's cap: a raised gilt-rimmed cap, the mouse's keys a drawn mouse with its button lit
  { at: '.gd-key', box: { minWidth: 26, height: 26, padding: [0, 7], border: 1, shrink: 0 },
    look: { fill: ['#3d3228', '#17120e'], border: alpha(FRAME, 0.8), radius: 5,
      shadow: { blur: 6, y: 4, color: 'rgba(0,0,0,.6)' } },
    text: () => ({ face: 'display', weight: 900, size: 14, line: 24 / 14, color: accent(), whole: true,
      align: 'center' }) },
  { at: '.gd-key.mouse', flex: true, box: { padding: 0, alignItems: 'center', justify: 'center' } },
  { at: '.gd-mouse', picture: [15, 21] },
];

/** A loadout's keys as the skill bar: the tray, its slots, each slot's art, cap and name. */
const KEYS: Sheet = [
  { at: '.gd-keys', flex: true, box: (element, round) => {
    const n = columns(element);
    const wanted = n * KEY.slot + (n - 1) * KEY.gap + KEY.tray;
    return { direction: 'row', wrap: true, justify: 'center', gap: [KEY.gap, 14], width: Math.min(innerOf(round),
      wanted), margin: [14, 0], padding: 10, border: 2, shrink: 0 };
  }, look: { fill: ['#1a1614', '#0a0909'], border: '#4a3620', radius: 4,
    shadow: { blur: 10, y: 4, color: 'rgba(0,0,0,.45)' } }, ring: alpha(FRAME, 0.4) },
  { at: '.gd-keys > .gd-kslot', box: (element, round) => {
    const n = columns(element.parentElement);
    return { width: Math.max(0, (innerOf(round) - (n - 1) * KEY.gap) / n - 0.01), shrink: 0 };
  } },
  { at: '.gd-seq > .gd-kslot', box: { basis: KEY.slot, grow: 0, shrink: 1 } },
  { at: '.gd-kslot', flex: true, box: { direction: 'column', alignItems: 'center', gap: 8, minWidth: 0,
    padding: [11, 0, 0, 0] } },
  { at: '.gd-kart', flex: true, box: { width: ART, height: ART, shrink: 0 },
    look: { fill: 'rgba(0,0,0,.45)', radius: 3 } },
  { at: '.gd-kart .gd-ic', box: { width: ART, height: ART } },
  { at: '.gd-kart .gd-ic i', box: { width: ART, height: ART }, look: { radius: 3 },
    text: { size: 30, line: ART / 30 } },
  { at: '.gd-kart .gd-ic i.art', paint: skillArt(true) },
  { at: '.gd-kart .gd-key', box: { position: 'absolute', inset: [-11, 'auto', 'auto', -8] } },
  { at: '.gd-kname', box: { alignSelf: 'stretch' }, text: (element) => ({ size: 14, line: 1.2, align: 'center',
    color: colourOf(element.closest('.gd-kslot'), INK), shadows: [{ x: 0, y: 1, blur: 2, color: '#000' }] }) },
  { at: '.gd-kslot.none .gd-kname', text: { color: INK_DIM, italic: true } },
];

/** The styles, loadouts and combos. */
const WAYS: Sheet = [
  { at: '.gd-style, .gd-load', flex: true, box: { direction: 'column', margin: [12, 0], padding: [4, 0, 4, 14],
    border: [0, 0, 0, 2] }, look: (element) => ({ border: colourOf(element, alpha(FRAME, 0.6)) }) },
  { at: '.gd-pros', flex: true, box: () => ({ direction: SKINNY() ? 'column' : 'row', gap: 18 }) },
  { at: '.gd-pros > .gd-points', box: { grow: 1, basis: 0, minWidth: 0 } },
  { at: '.gd-held', flex: true, box: { direction: 'column', margin: [6, 0] } },
  { at: '.gd-bases', flex: true, box: { direction: 'row', wrap: true, gap: [12, 4], margin: [4, 0] } },
  { at: '.gd-base', flex: true, box: { direction: 'row', alignItems: 'center', gap: 5 },
    text: { size: 13, color: INK } },
  { at: '.gd-bic', flex: true, box: { width: 28, height: 28, shrink: 0 } },
  { at: '.gd-bic svg', picture: [28, 28] },
  { at: '.gd-gear', flex: true, box: { direction: 'row', wrap: true, gap: [18, 6] } },
  { at: '.gd-gslot', flex: true, box: (element, round) => ({ direction: 'column', ...autoFill(260, 18)(element,
    round) }) },
  // the combos: a card a row, its steps beside its words (over them on a narrow page)
  { at: '.gd-combos', flex: true, box: { direction: 'column', gap: 8, margin: [8, 0, 4, 0] } },
  { at: '.gd-combo', flex: true, box: () => (NARROW_PAGE()
    ? { direction: 'column', padding: [10, 14], border: 1, minWidth: 0 }
    : { direction: 'column', justify: 'center', padding: [8, 16, 8, 12 + COMBO.steps + COMBO.gap], border: 1,
      minWidth: 0, minHeight: COMBO.slot + 10 + 16 + 2 }),
  look: { fill: RAISED, border: alpha(FRAME, 0.3), radius: 4 } },
  { at: '.gd-combo h4', box: { margin: 0 } },
  { at: '.gd-combo .gd-p', box: { margin: [4, 0, 0, 0] }, text: { size: 14, line: 1.4, color: INK } },
  { at: '.gd-seq', flex: true, box: { direction: 'row', alignItems: 'start', margin: [6, 0, 4, 0] } },
  { at: '.gd-combo .gd-seq', box: () => (NARROW_PAGE() ? {}
    : { position: 'absolute', inset: [8, 'auto', 'auto', 12], width: COMBO.steps, margin: 0 }) },
  { at: '.gd-seq-arrow', box: () => ({ width: NARROW() ? 24 : 34, height: 18, shrink: 0, margin: [28, 0, 0, 0] }),
    picture: () => [NARROW() ? 24 : 34, 18] },
];

/** The tables side by side: the styles' keys, the staffs' schools. */
const TABLES: Sheet = [
  { at: '.gd-compare', flex: true, box: { direction: 'column', margin: [10, 0, 14, 0], border: 1, overflow: 'hidden' },
    look: { fill: 'rgba(0,0,0,.25)', border: alpha(FRAME, 0.35) } },
  { at: '.gd-compare.keys', when: NARROW_PAGE, scrolls: 'across', box: { alignItems: 'start' } },
  { at: '.gd-compare.keys table', when: NARROW_PAGE,
    box: (_element, round) => ({ margin: [0, 0, 0, -scrolledAcross(round)], shrink: 0 }) },
  { at: '.gd-compare tr', box: { border: [0, 0, 1, 0] }, look: { border: alpha(FRAME, 0.18) }, text: { size: 13 } },
  { at: '.gd-compare thead tr', look: { fill: alpha(FRAME, 0.1), border: alpha(FRAME, 0.5) } },
  { at: '.gd-compare tr.differs', look: { fill: 'rgba(240,200,96,.06)' } },
  { at: '.gd-compare :is(th, td)', box: (element, round) => ({ width: cellWidth(element, round), padding: [6, 10],
    shrink: 0, minWidth: 0 }) },
  { at: '.gd-compare thead th', text: () => ({ face: 'display', weight: 700, size: 12, spacing: 1, color: accent() }) },
  { at: '.gd-compare tbody th', text: { ...LABEL, weight: 400, whole: true } },
  { at: '.gd-compare td:has(.gd-cell-bar)', flex: true, box: { direction: 'column', alignItems: 'start' } },
  { at: '.gd-compare.keys thead th', text: { align: 'center' } },
  { at: '.gd-compare.keys td', flex: true, box: { padding: [9, 4], alignItems: 'center' } },
  { at: '.gd-compare.keys tbody th', flex: true, box: { padding: [0, 8], alignItems: 'center' } },
  // each skill its picture, its name over its foot on a shade
  { at: '.gd-compare.keys .gd-chip', flex: true, box: (element, round) => {
    const side = cellArt(element, round);
    return { width: side, height: side, shrink: 0, overflow: 'hidden' };
  }, look: { radius: 3 } },
  { at: '.gd-compare.keys .gd-chip .gd-ic', box: { position: 'absolute', inset: 0 } },
  { at: '.gd-compare.keys .gd-chip .gd-ic i', box: (element, round) => {
    // (its round the picture's place in the chip, the chip's in the cell)
    const side = cellArt(element, round?.parent?.parent ?? null);
    return { width: side, height: side };
  }, look: { fill: 'rgba(0,0,0,.45)' }, text: { size: 44 } },
  { at: '.gd-compare.keys .gd-chip .gd-ic i.art', paint: skillArt(true) },
  { at: '.gd-compare.keys .gd-cn', box: { position: 'absolute', inset: ['auto', 0, 0, 0], padding: [18, 3, 5, 3] },
    look: { fill: ['rgba(0,0,0,0)', 'rgba(0,0,0,.85)'] },
    text: (element) => ({ size: nameSize(element), line: 1.1, align: 'center', whole: true,
      color: colourOf(element.closest('.gd-chip'), INK), shadows: OVER_ART }) },
  { at: '.gd-compare.keys .gd-chip.none', box: { border: 1, alignItems: 'center', justify: 'center' },
    look: { border: alpha(FRAME, 0.45) } },
  { at: '.gd-compare.keys .gd-chip.none .gd-cn', box: { position: 'relative', inset: 'auto', padding: 0 },
    look: { fill: 'rgba(0,0,0,0)' }, text: { color: INK_DIM, italic: true } },
];

export const HERO_PAGE: Sheet = [...SKILLS, ...KEYS, ...WAYS, ...TABLES];
