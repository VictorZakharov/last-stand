// The bug report's form drawn by the engine (ui/kit's sheet; #973), rule for rule from `styles/_bugReport.scss`: what
// it's about and the picture on the left, what happened on the right, one column on a narrow window; on a short
// screen the kinds across the form and what happened down its left beside the rest. The form is `bugReport.ts`'s
// markup, written and bound there as before. Its box is a modal's, zoomed by the UI's scale, so what a finger presses
// or a phone types into is sized in real css px over it (`finger`). Sizes are px of the lobby's scale.
import { HELP_TEXT } from './helpTextSheet';
import { NARROW } from './pauseSheet';
import { SHORT, TOUCH } from './controlsSheet';
import { finger, typedAbove } from './modalSheet';
import { DANGER, FRAME, HIGHLIGHT, INK, INK_DIM, WELL, WELL_LIT, alpha } from './kit/theme';
import { accent } from './diagFrame';
import { shownBox } from './kit/press';
import { uiScales } from './scale';
import type { Panel } from './kit/panel';
import type { Painted, Sheet } from './kit/sheet';
import type { PanelStyle } from '../engine/ui';

/** the kinds' gap, and how many stand in a row (on a short screen, in two rows across the form) */
const KIND_GAP = 5;
const KINDS_ACROSS = 3;
const KINDS_ACROSS_SHORT = 6;
/** the columns' gap across (on a short screen, and otherwise) */
const COLUMNS_GAP = 22;
const COLUMNS_GAP_SHORT = 18;
/** the rows' gap on a short screen */
const ROWS_GAP_SHORT = 5;
/** the fields' words */
const FIELD_INK = '#ffe7b0';

/** A kind's width in its row: a column's share of the row's width (`grid-template-columns: repeat(n, 1fr)`), the
 *  last across two (eleven kinds: no row ends short). */
function kindBox(element: Element, round: Panel | null): PanelStyle {
  const across = SHORT() ? KINDS_ACROSS_SHORT : KINDS_ACROSS;
  const row = round?.rect();
  if (!row) return { basis: `${100 / across - 2}%` };
  const width = row.w / uiScales[round!.scaled];
  const column = (width - KIND_GAP * (across - 1)) / across;
  const last = !element.nextElementSibling;
  return { basis: last ? column * 2 + KIND_GAP : column, grow: 0, shrink: 0, minWidth: 0 };
}

/** The picture in its frame, whole inside it (`object-fit: contain`), once it's loaded. */
function shot(element: Element, w: number, h: number): Painted | null {
  const image = element as HTMLImageElement;
  if (!image.getAttribute('src') || !image.complete || !image.naturalWidth) return null;
  const scale = Math.min(w / image.naturalWidth, h / image.naturalHeight);
  const [drawnW, drawnH] = [image.naturalWidth * scale, image.naturalHeight * scale];
  return {
    key: `shot ${image.src.slice(-24)} ${w}x${h}`,
    paint: (c) => c.drawImage(image, (w - drawnW) / 2, (h - drawnH) / 2, drawnW, drawnH),
  };
}

/** The picture's place on a short screen: in the right column under what was expected (a grid's area of its own
 *  there), placed from where the field is drawn against the form's columns; its height kept under the field. */
function shotPlaced(element: Element): PanelStyle {
  const columns = element.closest('.br-cols');
  const expected = columns?.querySelector('#br-expected');
  const at = columns && shownBox(columns);
  const under = expected && shownBox(expected);
  const k = uiScales.ui;
  const top = at?.height && under?.height ? (under.bottom - at.top) / k + ROWS_GAP_SHORT : 0;
  return { position: 'absolute', inset: [top, 0, 'auto', `${50}%`], margin: [0, 0, 0, COLUMNS_GAP_SHORT / 2] };
}

/** The room the picture takes under what was expected on a short screen: its height and the gap after it. */
function roomForShot(element: Element): PanelStyle {
  const picture = element.closest('.br-cols')?.querySelector('.br-shot');
  const drawn = picture && shownBox(picture);
  const tall = drawn ? drawn.height / uiScales.ui : 0;
  return { margin: [0, 0, tall + ROWS_GAP_SHORT, 0] };
}

/** A field's border, the highlight's while it has the focus. */
const fieldBorder = (element: Element): string =>
  (document.activeElement === element ? HIGHLIGHT : alpha(FRAME, 0.55));

/** The form's rules, after the modals'. */
export const BUG_REPORT: Sheet = [
  ...HELP_TEXT,
  { at: '.br-box', box: { width: 820, gap: 10 }, text: { align: 'start' } },
  { at: '.br-box', when: SHORT, box: { padding: [10, 18], gap: 5 } },
  // (a height planted inline: the lab's canary, the form twice the window's height)
  { at: '.br-box[style*="min-height"]', box: (element) => ({ minHeight: parseFloat((element as HTMLElement).style.minHeight) }) },
  { at: '.br-box .sm-title', text: { size: 26, align: 'center' } },
  { at: '.br-box .sm-title', when: SHORT, text: { size: 19 } },
  { at: '.br-form, .br-done', flex: true, box: () => ({ direction: 'column', gap: SHORT() ? 5 : 10, minHeight: 0 }) },
  // the columns: side by side (one where it's narrow; on a short screen, the kinds across both)
  { at: '.br-cols', flex: true, box: () => ({ position: 'relative', direction: NARROW() && !SHORT() ? 'column' : 'row',
    gap: SHORT() ? [COLUMNS_GAP_SHORT, ROWS_GAP_SHORT] : [COLUMNS_GAP, 8], wrap: SHORT(), alignItems: 'stretch' }) },
  { at: '.br-col', flex: true, box: { direction: 'column', gap: 6, minWidth: 0, grow: 1, basis: 0 } },
  { at: '.br-col:first-child', when: SHORT, box: { basis: '100%', gap: ROWS_GAP_SHORT } },
  { at: '.br-col + .br-col', when: SHORT, box: { direction: 'row', gap: COLUMNS_GAP_SHORT } },
  { at: '.br-what, .br-more', flex: true, box: { direction: 'column', gap: 6, minWidth: 0 } },
  { at: '.br-what, .br-more', when: SHORT, box: { grow: 1, basis: 0, gap: ROWS_GAP_SHORT } },
  { at: '.br-box .br-label', flex: true, box: { direction: 'row', alignItems: 'end', justify: 'between', gap: 8 },
    text: () => ({ face: 'display', size: 15, color: accent() }) },
  { at: '.br-box .br-label small', text: { face: 'body', size: 12, color: INK_DIM } },
  // the kinds: one chosen, as a row of radio buttons
  { at: '.br-kinds', flex: true, box: { direction: 'row', wrap: true, gap: KIND_GAP, alignItems: 'stretch' } },
  {
    at: '.br-kind',
    hits: true,
    box: (element, round) => ({ padding: [6, 4], border: 1, justify: 'center', alignItems: 'center',
      minHeight: TOUCH() ? finger(36) : undefined, ...kindBox(element, round) }),
    look: { fill: WELL, border: alpha(FRAME, 0.45), radius: 3 },
    text: { face: 'body', weight: 600, size: 14, line: 1.15, color: INK, align: 'center' },
    hover: { look: { border: FRAME }, text: { color: '#ffffff' } },
  },
  { at: '.br-kind.on', look: { fill: WELL_LIT, border: HIGHLIGHT }, text: { color: HIGHLIGHT },
    ring: alpha(HIGHLIGHT, 0.35), hover: { look: { border: HIGHLIGHT }, text: { color: HIGHLIGHT } } },
  { at: '.br-hint', box: () => ({ minHeight: SHORT() ? 13 * 1.25 : 13 * 2.5 }),
    text: { size: 13, line: 1.25, color: INK_DIM } },
  // the picture taken as the form opened, and whether it goes along
  { at: '.br-shot, .br-done-shot', flex: true, box: { direction: 'row', alignItems: 'center', gap: 10 } },
  // (drawn over the column after it, as CSS paints a box placed absolutely over the boxes laid out after it: drawn in
  // the tree's order, what's more lay over the picture's tick and took its press; its column, the first, starts where
  // the columns do, so placed against it as against them)
  { at: '.br-shot', when: SHORT, lift: true, box: shotPlaced },
  { at: '.br-more #br-expected', when: SHORT, box: roomForShot },
  { at: '.br-shot-frame', flex: true, box: () => (SHORT()
    ? { width: 100, height: 57, shrink: 0, border: 1 } : { width: 150, height: 86, shrink: 0, border: 1 }),
  look: { fill: '#000000', border: alpha(FRAME, 0.55) } },
  { at: '.br-shot-frame img', box: () => (SHORT() ? { width: 98, height: 55 } : { width: 148, height: 84 }),
    paint: shot },
  { at: '.br-shot.off img', look: { opacity: 0.3 } },
  { at: '.br-shot-side', flex: true, box: { direction: 'column', gap: 4, minWidth: 0, grow: 1, basis: 0 },
    text: { size: 14 } },
  { at: '.br-shot-side small', text: { size: 12, line: 1.25, color: INK_DIM } },
  { at: '.br-shot .br-shot-side small', when: () => !SHORT(), box: { minHeight: 12 * 2.5 } },
  { at: '.br-check', flex: true, hits: true, box: { direction: 'row', alignItems: 'center', gap: 6 } },
  { at: '.br-check input', box: () => {
    const side = TOUCH() ? finger(20) : 13;
    return { width: side, height: side, margin: [3, 3, 3, 4], shrink: 0 };
  } },
  // the fields
  {
    at: '.br-box textarea, .br-box input[type="text"]',
    hits: true,
    box: { width: '100%', padding: [7, 9], border: 1, shrink: 0 },
    look: (element) => ({ fill: '#0a0909', border: fieldBorder(element), radius: 3 }),
    text: () => ({ face: 'body', size: TOUCH() ? Math.max(15, finger(16)) : 15, line: 1.3, color: FIELD_INK }),
  },
  // (four rows of its words, as `rows="4"` sizes it, and its least height)
  { at: '.br-box textarea', box: () => ({ height: Math.max(92, 4 * 15 * 1.3 + 16) }) },
  { at: '.br-box textarea', when: SHORT, box: { height: 'auto', grow: 1, minHeight: 0, basis: 0 } },
  // the report whole, as it will leave: text alone, wrapped
  { at: '.br-sent', flex: true, box: { direction: 'column' }, text: { size: 13, color: INK_DIM } },
  { at: '.br-sent summary', hits: true, box: () => ({ padding: TOUCH() ? [finger(6), 0] : 0 }),
    text: { underline: true }, hover: { text: { color: INK } }, before: { says: '▶  ', text: { size: 9 } } },
  { at: '.br-sent[open] summary', before: { says: '▼  ', text: { size: 9 } } },
  { at: '.br-sent:not([open]) > :not(summary)', box: { display: 'none' } },
  { at: '.br-sent pre', hits: true, scrolls: true,
    box: () => ({ margin: [6, 0, 0, 0], maxHeight: SHORT() ? 90 : 150, padding: [6, 8], border: 1, overflow: 'scroll',
      shrink: 0 }),
    look: { fill: '#0a0909', border: alpha(FRAME, 0.3) }, text: { face: 'mono', size: 12, line: 1.35, color: INK } },
  { at: '.br-privacy', text: { size: 12, line: 1.3, color: INK_DIM } },
  // (none while it says nothing: `:empty`, read each frame, as its words come and go)
  { at: '.br-note', box: (element) => (element.textContent ? { minHeight: 14 * 1.3 } : { display: 'none' }),
    text: { size: 14, color: HIGHLIGHT, align: 'center' } },
  { at: '.br-note.bad', text: { color: DANGER } },
  { at: '.br-actions', flex: true, box: { direction: 'row', justify: 'end', wrap: true, gap: 10 } },
  { at: '.br-actions #br-cancel', box: { margin: [0, 'auto', 0, 0] } },
  { at: '.br-actions .btn, .br-done-shot-actions .btn', when: TOUCH, box: () => ({ minHeight: finger(40) }) },
  // the last page: what was done, and the picture to add by hand
  { at: '.br-done', box: { alignItems: 'center' }, text: { align: 'center' } },
  { at: '.br-done-title', text: { face: 'display', size: 20, color: HIGHLIGHT } },
  { at: '.br-done p', box: { margin: 0, maxWidth: 560 }, text: { size: 15, line: 1.35 } },
  { at: '.br-thanks', text: { color: INK_DIM } },
  { at: '.br-done-shot', box: { maxWidth: 560 }, text: { align: 'start' } },
  { at: '.br-done-shot-actions', flex: true, box: { direction: 'row', wrap: true, gap: 8 } },
  { at: '.br-done-shot-actions .btn', box: { padding: [6, 12] }, text: { size: 14, underline: false } },
  { at: '.br-done .br-actions', box: { alignSelf: 'stretch', justify: 'center' } },
  // typed into on a phone: the form at the top of what the keyboard leaves (ui/aboveKeyboard.ts)
  ...typedAbove('bug-report'),
];
