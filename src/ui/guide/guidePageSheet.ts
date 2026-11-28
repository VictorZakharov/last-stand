// What every page of the guide has, as the kit draws it (#973, `guideSheet.ts`), rule for rule from
// `styles/_guide.scss`: its top (the portrait in its gilt frame, the name, the role and what it does), the headings
// between gilt rules, the words and their marks, the figures' tiles, the bars against the largest of their kind, the
// lists marked good or bad, the tables (laid out as rows, each column as wide as its widest, or shared out as a
// table across the page shares them), the traits and the drawings. Sizes are px of the lobby's scale.
import { accent } from '../diagFrame';
import { measure, type TextStyle } from '../overlay/paint';
import { DANGER, FRAME, FRAME_DARK, HIGHLIGHT, INK, INK_DIM, WELL, alpha } from '../kit/theme';
import { BODY, lit } from '../kit/sheetRules';
import { NARROW, SKINNY, autoFill, colourOf, innerOf, pageWidth } from './guideRoom';
import { headRules, portrait } from './guidePaint';
import type { Panel } from '../kit/panel';
import type { Sheet } from '../kit/sheet';
import type { Mark } from '../kit/sheetRules';

/** `$heal`, `$panel-raised` (a card on a panel) */
export const HEAL = '#4cff6a';
export const RAISED = 'rgba(22,20,24,.95)';

/** a heading's words (`.gd-h`), its rule's lead in and the gap either side of its words */
const HEAD: TextStyle = { face: 'display', weight: 700, size: 13, spacing: 3, upper: true, color: INK };
const RULE = { lead: 40, gap: 12 };
/** a heading's line height, a share of its size (the display face's normal line) */
const HEAD_LINE = 1.45;
/** the portrait's side, wide and narrow (its frame's 2 px in it) */
const PORTRAIT = { wide: 160, narrow: 110 };

/** A heading's style, at `size`, in the accent and its glow. */
const headStyle = (size: number): TextStyle =>
  ({ ...HEAD, size, color: accent(), shadows: [{ x: 0, y: 0, blur: 10, color: 'rgba(240,190,90,.35)' }] });

/** a plain list's disc: its side, and where it stands from its item's first line (px) */
const DISC = { side: 5, top: (15 * 1.45 - 5) / 2, left: -15 };

/** A list's marks (`li::marker`): a bullet, or a good point's plus and a bad one's minus in their colours. */
function marker(element: Element): Mark[] {
  const list = element.closest('.gd-list');
  const good = list?.classList.contains('good');
  const bad = list?.classList.contains('bad');
  if (!good && !bad) return [{ inset: [DISC.top, 'auto', 'auto', DISC.left], dot: { side: DISC.side, fill: INK } }];
  const text: TextStyle = { ...BODY, size: 15, line: 1.45, weight: 700, color: good ? HEAL : DANGER };
  const says = good ? '+' : '−';
  // (outside the item, its end against the words as CSS's marker stands: '+  ', its spaces as one)
  return [{ inset: [0, 'auto', 'auto', -measure(`${says} `, text).w], says, text }];
}

/** A bar's fill (`.gd-track b`): its share of the track (`--v`), lighter at its top, in its colour (`--c`). */
function barFill(element: Element) {
  const colour = colourOf(element, accent());
  return { fill: [lit(colour, 1.25), colour] as [string, string], shadow: { blur: 8, color: colour } };
}

/** The widest of every `selector` in the bars round `element`, in `style` (a grid's `auto` column). */
function columnOf(element: Element, selector: string, style: TextStyle): number {
  const bars = element.closest('.gd-bars');
  const all = bars ? [...bars.querySelectorAll(selector)] : [];
  return Math.max(0, ...all.map((cell) => measure(cell.textContent ?? '', style).w)) + 1;
}
const BAR_LABEL: TextStyle = { ...BODY, size: 12, spacing: 1.5, upper: true, color: INK_DIM };
const BAR_VALUE: TextStyle = { ...BODY, face: 'display', weight: 700, size: 14, color: INK };

/** a table's cell's padding at its right (px) */
const CELL_GAP = 12;

/** The style a table's cell's words are in: its head's row, a row's name, a figure. */
function cellStyle(cell: Element, row: number): TextStyle {
  if (row === 0) return TABLE_HEAD;
  return cell.tagName === 'TH' ? { ...TABLE_CELL, weight: 700 } : TABLE_CELL;
}

/** Each column's least width (its longest word) and most (its widest cell whole), padding in. */
function columnRange(table: Element): { least: number[]; most: number[] } {
  const least: number[] = [];
  const most: number[] = [];
  [...table.querySelectorAll('tr')].forEach((row, index) => {
    [...row.children].forEach((cell, at) => {
      const style = cellStyle(cell, index);
      const words = (cell.textContent ?? '').split(/\s+/).filter(Boolean);
      const longest = Math.max(0, ...words.map((word) => measure(word, style).w));
      least[at] = Math.max(least[at] ?? 0, longest + CELL_GAP + 1);
      most[at] = Math.max(most[at] ?? 0, measure(cell.textContent ?? '', style).w + CELL_GAP + 1);
    });
  });
  return { least, most };
}

/** A table's cell's column (`.gd-table`, laid out by its content, as CSS's automatic table layout): as wide as its
 *  widest cell where the table fits the page, else its longest word and a share of the room left as its cells'
 *  words would take more (an upright tablet's page: the loot table ran past it, its head's words wrapped on main's). */
function tableColumn(cell: Element): number {
  const table = cell.closest('table');
  if (!table) return 0;
  const at = [...(cell.parentElement?.children ?? [])].indexOf(cell);
  const { least, most } = columnRange(table);
  const room = pageWidth();
  const whole = most.reduce((sum, width) => sum + width, 0);
  if (room <= 0 || whole <= room) return most[at] ?? 0;
  const leastWhole = least.reduce((sum, width) => sum + width, 0);
  const spare = Math.max(0, room - leastWhole);
  const wanted = whole - leastWhole;
  return (least[at] ?? 0) + (wanted > 0 ? (spare * ((most[at] ?? 0) - (least[at] ?? 0))) / wanted : 0) - 0.01;
}
const TABLE_HEAD: TextStyle = { ...BODY, size: 12, spacing: 1, upper: true, color: INK_DIM };
const TABLE_CELL: TextStyle = { ...BODY, size: 14, color: INK };

/** The words of a page and its top. */
const WORDS: Sheet = [
  { at: '#guide :is(p, li, figcaption, .gd-dim) i', text: { italic: true } },
  { at: '#guide b', text: { weight: 700 } },
  { at: '#guide .gd-page b.gold', text: { color: HIGHLIGHT } },
  { at: '#guide .gd-page b.red', text: { color: DANGER } },
  { at: '#guide .gd-page [style*="color"]', text: (element) => ({ color: (element as HTMLElement).style.color }) },
  { at: '.gd-top', flex: true, box: () => ({ direction: SKINNY() ? 'column' : 'row', gap: 18, alignItems: 'start' }) },
  { at: '.gd-portrait', box: () => {
    const side = NARROW() ? PORTRAIT.narrow : PORTRAIT.wide;
    return { width: side, height: side, shrink: 0, border: 2 };
  }, look: { border: FRAME_DARK, shadow: { blur: 26, y: 10, color: 'rgba(0,0,0,.7)' } }, ring: FRAME, paint: portrait },
  { at: '.gd-title', flex: true, box: { direction: 'column', grow: 1, basis: 0, minWidth: 0 } },
  { at: '.gd-title h2', box: { margin: 0 }, text: () => ({ face: 'display', weight: 900, size: NARROW() ? 22 : 28,
    spacing: 1, line: 1.2, color: accent(), shadows: [{ x: 0, y: 2, blur: 0, color: '#000' }] }) },
  { at: '.gd-title h2[style*="color"]', text: (element) => ({ color: (element as HTMLElement).style.color }) },
  { at: '.gd-sub', text: { size: 13, spacing: 2, upper: true, color: INK_DIM } },
  { at: '.gd-p', box: { margin: [6, 0] } },
  { at: '.gd-ai', box: { margin: [4, 0, 0, 0] }, text: { size: 14, color: INK_DIM } },
  { at: '.gd-dim', text: { size: 14, color: INK_DIM } },
  { at: '.gd-note', box: { margin: [4, 0, 0, 0] }, text: { size: 12, color: INK_DIM } },
  { at: '#guide h4', box: { margin: [0, 0, 4, 0] }, text: () => ({ face: 'display', weight: 700, size: 16,
    color: accent() }) },
  { at: '#guide h4[style*="color"]', text: (element) => ({ color: (element as HTMLElement).style.color }) },
  // a heading between its rules (`.gd-h` and its `::before`, `::after`)
  { at: '.gd-h', box: (_element, round) => ({ width: innerOf(round), height: HEAD_LINE * 13, margin: [22, 0, 10, 0],
    shrink: 0 }), says: '', paint: headRules(() => headStyle(13), RULE.lead, RULE.gap) },
  { at: '.gd-pros .gd-h', box: { height: HEAD_LINE * 11, margin: [8, 0, 10, 0] },
    paint: headRules(() => headStyle(11), RULE.lead, RULE.gap) },
];

/** The figures: tiles, bars, traits, a list's points, the tables. */
const FIGURES: Sheet = [
  { at: '.gd-tiles', flex: true, box: { direction: 'row', wrap: true, gap: 6, margin: [14, 0, 8, 0] } },
  { at: '.gd-tile', flex: true, box: (element, round) => ({ direction: 'column', padding: [6, 10], border: 1,
    ...autoFill(150, 6)(element, round) }), look: { fill: RAISED, border: alpha(FRAME, 0.3) } },
  { at: '.gd-tl', text: { size: 11, spacing: 1.5, upper: true, color: INK_DIM } },
  { at: '.gd-tile b', text: { face: 'display', weight: 700, size: 18, color: INK } },
  { at: '.gd-tile small', text: { size: 12, line: 1.3, color: INK_DIM } },
  { at: '.gd-glance', box: { maxWidth: 720 } },
  // bars: a name, the track filled to its share (and the hero's own mark along it), the figure
  { at: '.gd-bars', flex: true, box: { direction: 'column', gap: 9 } },
  { at: '.gd-bar', flex: true, box: { direction: 'row', alignItems: 'center', gap: 12 } },
  { at: '.gd-bl', box: (element) => ({ width: columnOf(element, '.gd-bl', BAR_LABEL), shrink: 0 }), text: BAR_LABEL },
  { at: '.gd-bv', box: (element) => ({ width: columnOf(element, '.gd-bv', BAR_VALUE), shrink: 0 }),
    text: { ...BAR_VALUE, whole: true } },
  { at: '.gd-track', flex: true, box: { grow: 1, basis: 0, minWidth: 60, height: 10, border: 1 },
    look: { fill: WELL, border: alpha(FRAME, 0.35) } },
  { at: '.gd-track b', box: (element) => {
    const share = parseFloat((element as HTMLElement).style.getPropertyValue('--v')) || 0;
    return { position: 'absolute', inset: [0, 'auto', 0, 0], width: `${share}%` };
  }, look: barFill },
  { at: '.gd-mark', flex: true, box: (element) => {
    const at = parseFloat((element as HTMLElement).style.getPropertyValue('--at')) || 0;
    return { position: 'absolute', inset: [-5, 'auto', -5, `${at}%`], width: 2, margin: [0, 0, 0, -1] };
  }, look: { fill: INK } },
  { at: '.gd-mark span', box: { position: 'absolute', inset: ['auto', 'auto', '100%', -39], width: 80 },
    text: { size: 10, weight: 700, spacing: 1, upper: true, color: INK, align: 'center', whole: true } },
  // the traits, each a short bar (`--v` of five)
  { at: '.gd-traits', flex: true, box: { direction: 'row', wrap: true, gap: [22, 6], margin: [4, 0] },
    text: { size: 13, color: INK_DIM } },
  { at: '.gd-traits span', flex: true, box: { direction: 'row', alignItems: 'center', gap: 8 } },
  { at: '.gd-traits i', box: { width: 70, height: 5, shrink: 0 }, look: { fill: alpha(FRAME, 0.25) },
    marks: (element) => {
      const share = (parseFloat((element as HTMLElement).style.getPropertyValue('--v')) || 0) * 20;
      return [{ inset: [0, 'auto', 0, 0], bar: { width: `${Math.min(100, share)}%`, fill: accent } }];
    } },
  // lists of points, marked
  { at: '.gd-points', flex: true, box: { direction: 'column' } },
  { at: '.gd-list', flex: true, box: { direction: 'column', margin: [4, 0], padding: [0, 0, 0, 20] } },
  { at: '.gd-list li', box: { margin: [3, 0] }, marks: marker },
  { at: '.gd-caps', flex: true, box: { direction: 'row', wrap: true, gap: [16, 3] }, text: { size: 13, color: INK_DIM } },
  { at: '.gd-heal', text: { color: HEAL } },
  { at: '.gd-cell-bar', box: (element) => {
    const share = parseFloat((element as HTMLElement).style.getPropertyValue('--v')) || 0;
    return { width: `${share}%`, height: 4, margin: [4, 0, 0, 0] };
  }, look: { fill: DANGER } },
  // the tips' table of loot chances, each column as wide as its widest
  { at: '.gd-table', flex: true, box: { direction: 'column', margin: [6, 0], alignSelf: 'start' }, text: { size: 14 } },
  { at: '#guide :is(thead, tbody)', flex: true, box: { direction: 'column' } },
  { at: '#guide tr', flex: true, box: { direction: 'row', alignItems: 'center' } },
  { at: '.gd-table :is(th, td)', box: (element) => ({ width: tableColumn(element), padding: [3, CELL_GAP, 3, 0],
    shrink: 0 }), text: { align: 'start' } },
  { at: '.gd-table th', text: { weight: 700 } },
  { at: '.gd-table tr:first-child th', text: { ...TABLE_HEAD, weight: 400 } },
];

/** The drawings: a boss's calls for help along a minute. */
const DRAWINGS: Sheet = [
  { at: '.gd-fig', flex: true, box: { direction: 'column', margin: 0 } },
  { at: '.gd-fig figcaption', box: { margin: [6, 0, 0, 0] }, text: { size: 12, line: 1.4, color: INK_DIM } },
  { at: '.gd-timeline svg', box: (_element, round) => {
    const w = Math.min(innerOf(round as Panel | null), 640);
    return { width: w, height: (w * 72) / 600, shrink: 0 };
  }, picture: (_element, round) => {
    const w = Math.min(innerOf(round), 640);
    return [w, (w * 72) / 600];
  } },
];

export const PAGE: Sheet = [...WORDS, ...FIGURES, ...DRAWINGS];
