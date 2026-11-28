// Cloud saves drawn by the engine (ui/kit's sheet; #973), rule for rule from `styles/_saves.scss`: the bar under the
// save slots' title (signing in, the account's menu), slot 1's mark in its pane's head, and the two dialogs over the
// screen, deleting a save and the cloud's own (`cloudSaves.ts`: the cloud save chosen, a hero changed in two places,
// a sign-in code). The markup is `cloudSaves.ts`'s and `saves.ts`'s, written and bound there as before. Sizes are px
// of the screen's scale (the bar: the panes', `savesSheet.ts`; the dialogs: the lobby's, as every modal).
import { HELP_TEXT } from './helpTextSheet';
import { SHORT } from './controlsSheet';
import { typedAbove } from './modalSheet';
import { DANGER, FRAME, HIGHLIGHT, INK, INK_DIM, PANEL, alpha } from './kit/theme';
import { accent } from './diagFrame';
import { uiScales } from './scale';
import { shownBox } from './kit/press';
import type { Sheet } from './kit/sheet';
import type { TextStyle } from './overlay/paint';
import { BODY } from './kit/sheetRules';
import { columnOf, termsWidth } from './savesGrid';

/** a friend's words (`$ally-text`): the bar's note, an empty slot's */
export const ALLY_TEXT = '#9ccfff';
/** a card on a panel (`$panel-raised`) */
const PANEL_RAISED = 'rgba(22,20,24,.95)';
/** a short screen or a narrow one: the dialogs' grids closer */
const CRAMPED = (): boolean => SHORT() || innerWidth <= 560;

/** the line a field's words stand on, times their size (the face's normal line height) */
const FIELD_LINE = 1.33;

/** a list's term in the cloud's dialog, as measured for its column */
const termOf = (): TextStyle => ({ ...BODY, size: CRAMPED() ? 13 : 14 });

/** A field's border, `focused` while it has the focus. */
const borderOf = (rest: string, focused: () => string) => (element: Element): string =>
  (document.activeElement === element ? focused() : rest);

/** A wrapping row's width with all its items on one line (CSS's `max-content`, px of the panes' scale), from their
 *  drawn boxes: taffy sized the account's actions narrower than that, and on an upright tablet they wrapped where
 *  main's stood on one line under the state. Its share of the row's line is still held to the line's width. */
function rowOf(element: Element, gap: number): number | undefined {
  const items = [...element.children].map((child) => shownBox(child)).filter((box) => box && box.width > 0);
  if (!items.length) return undefined;
  const width = items.reduce((sum, box) => sum + box!.width, 0) / uiScales.panes;
  return width + gap * (items.length - 1) + 1;
}

/** The bar under the title, and slot 1's mark (in the save slots' tree). */
export const CLOUD_BAR: Sheet = [
  { at: '.sv-cloud', flex: true, box: () => ({ direction: 'column', width: '100%', maxWidth: 1100,
    margin: [SHORT() ? 0 : 6, 0, 0, 0] }) },
  { at: '.sc-row', flex: true, box: () => ({ direction: 'row', wrap: true, alignItems: 'center', justify: 'center',
    gap: SHORT() ? 6 : [10, 8] }) },
  { at: '.sc-actions', flex: true, box: (element) => ({ direction: 'row', wrap: true, alignItems: 'center',
    justify: 'center', minWidth: 0, gap: SHORT() ? 6 : [10, 8], basis: rowOf(element, SHORT() ? 6 : 10) }) },
  { at: '.sc-tail', flex: true, box: { direction: 'row', alignItems: 'center', gap: 10 } },
  { at: '.sc-row .btn', box: () => ({ padding: SHORT() ? [5, 10] : [7, 14] }),
    text: () => ({ size: SHORT() ? 13 : 14 }) },
  { at: '.sc-icon', flex: true, box: () => {
    const side = SHORT() ? 20 : 26;
    return { width: side, height: side, shrink: 0 };
  }, text: { color: INK_DIM } },
  { at: '.sc-icon.on', text: { color: HIGHLIGHT } },
  { at: '.sc-icon svg', picture: () => (SHORT() ? [20, 20] : [26, 26]) },
  // (kept whole, as CSS sizes it to its words: asking for no width, it left the actions beside it squeezed into a
  // column on an upright tablet)
  { at: '.sc-state', text: () => ({ size: SHORT() ? 13 : 15, color: INK_DIM, whole: true }) },
  { at: '.sc-state b', text: { weight: 600, color: INK } },
  // (kept whole, so its row's width counts it: a wrapped text asks for none, and the buttons beside it wrapped early)
  { at: '.sc-privacy', text: { size: 13, whole: true } },
  { at: '.sc-note', box: { margin: [6, 0, 0, 0] }, text: { size: 14, color: ALLY_TEXT, align: 'center' } },
  // the account's menu: a dropdown under its button, its chevron turned up while it's open
  { at: '.sc-more', flex: true, box: { position: 'relative' } },
  { at: '.sc-more > summary', hits: true, after: { says: '  ▾', text: { size: 12 } } },
  { at: '.sc-more[open] > summary', after: { says: '  ▴', text: { size: 12 } } },
  { at: '.sc-chevron', box: { display: 'none' } },
  { at: '.sc-more:not([open]) > :not(summary)', box: { display: 'none' } },
  {
    at: '.sc-menu',
    flex: true,
    lift: true,
    scrolls: true,
    box: () => ({ position: 'absolute', inset: ['100%', 0, 'auto', 'auto'], margin: [6, 0, 0, 0], minWidth: 230,
      maxHeight: (innerHeight * 0.65) / uiScales.ui, direction: 'column',
      gap: 6, padding: 10, border: 2, overflow: 'scroll' }),
    look: { fill: PANEL, border: '#4a3620', shadow: { blur: 30, y: 10, color: 'rgba(0,0,0,.8)' } },
    ring: alpha(FRAME, 0.7),
  },
  { at: '.sc-menu .btn', box: { width: '100%', shrink: 0 } },
  // who's signed in, and how
  { at: '.sv-account, .sc-account', box: { padding: [10, 18], minWidth: 0 }, text: { face: 'body', size: 14,
    color: INK, anywhere: true } },
  { at: '.sc-identity', flex: true, box: { direction: 'row', alignItems: 'center', gap: 8, minWidth: 0 } },
  { at: '.sc-identity > span', box: { minWidth: 0, shrink: 1 } },
  { at: '.sv-account b, .sc-account b', text: { weight: 700 } },
  { at: '.sc-google-logo', picture: [20, 20] },
  { at: '.sc-methods', box: { margin: [4, 0, 0, 0] }, text: { size: 13, color: INK_DIM } },
  { at: '.sc-methods, .sc-google:not([hidden]), .sc-glink:not([hidden]), .sc-gunlink', flex: true,
    box: { direction: 'row', alignItems: 'center', wrap: true, gap: 6 } },
  { at: '[hidden]', box: { display: 'none' } },
  { at: '.sc-methods .sc-google-logo', picture: [16, 16] },
  // slot 1, the cloud save: its mark in its pane's head
  { at: '.sv-cloud-mark', flex: true,
    box: { direction: 'row', alignItems: 'center', gap: 5, margin: [0, 0, 0, 'auto'] },
    text: { face: 'body', weight: 600, size: 13, spacing: 1, upper: true, color: HIGHLIGHT } },
  { at: '.sv-cloud-mark svg', picture: [24, 24] },
  { at: '.sv-cloud-info', flex: true, box: { direction: 'column', alignItems: 'end', gap: 4, grow: 1, shrink: 1,
    basis: 140, minWidth: 0 } },
  { at: '.sv-cloud-info .sv-account', box: { padding: 0, maxWidth: '100%' }, text: { size: 13, align: 'end' } },
  { at: '.sv-cloud-info .sc-identity', box: { justify: 'end' } },
  { at: '.sv-cloud-info .sc-methods', box: { justify: 'end' }, text: { size: 12 } },
];

/** Deleting a save: typing DELETE arms its button. */
export const SAVE_DELETE: Sheet = [
  ...HELP_TEXT,
  { at: '#save-delete .modal-box', box: { width: 470 } },
  { at: '.sd-what p', box: { margin: [0, 0, 8, 0] } },
  { at: '.sd-form', flex: true, box: { direction: 'column', alignItems: 'center', gap: 10 } },
  { at: '.sd-form label', text: { size: 14, color: INK_DIM } },
  { at: '.sd-form label b', text: { spacing: 2, color: DANGER } },
  {
    at: '#sd-input',
    hits: true,
    // (as tall as a line of its words while it says none: an empty text lays out no line, and it stood a strip)
    box: { width: 200, minHeight: FIELD_LINE * 20 + 8 * 2 + 2, padding: [8, 10], border: 1 },
    look: (element) => ({ fill: '#0a0909', radius: 3,
      border: borderOf(alpha(DANGER, 0.5), () => DANGER)(element),
      shadow: document.activeElement === element ? { blur: 12, color: alpha(DANGER, 0.35) } : undefined }),
    text: { face: 'display', weight: 700, size: 20, spacing: 4, color: '#ffd8cc', align: 'center' },
  },
  { at: '.sd-ok:disabled', look: { opacity: 0.6 }, text: { color: INK_DIM } },
];

/** The cloud's dialog: its slots to choose from, the two sides of a hero changed in both, a code. */
export const CLOUD_DIALOG: Sheet = [
  ...HELP_TEXT,
  { at: '#cloud-dialog .modal-box', box: { width: 560, gap: 12 } },
  { at: '.cd-body p', box: { margin: [0, 0, 8, 0] } },
  { at: '.cd-warn', text: { color: DANGER } },
  { at: '.cd-slots', flex: true, box: () => ({ direction: 'row', gap: CRAMPED() ? 6 : 8, margin: [10, 0, 0, 0] }) },
  { at: '.cd-slot', flex: true, box: { direction: 'column', gap: 3, padding: [10, 8], grow: 1, basis: 0,
    minWidth: 0 } },
  { at: '.cd-slot span', text: { size: 13, color: INK_DIM } },
  { at: '.cd-sides', flex: true, box: () => ({ direction: 'row', gap: CRAMPED() ? 6 : 10, margin: [6, 0, 10, 0],
    alignItems: 'stretch' }) },
  { at: '.cd-side', flex: true, box: () => ({ direction: 'column', grow: 1, basis: 0, minWidth: 0, border: 1,
    padding: CRAMPED() ? 8 : [10, 12] }), look: { fill: PANEL_RAISED, border: alpha(FRAME, 0.4) },
  text: { align: 'start' } },
  { at: '.cd-side h3', box: { margin: [0, 0, 4, 0] }, text: { face: 'display', weight: 700, size: 18, color: INK } },
  { at: '.cd-side .cd-dev', text: { size: 13, color: INK_DIM } },
  // (a list's terms beside what each is: two columns, the terms' as wide as the widest)
  { at: '.cd-side dl', flex: true, box: { direction: 'row', wrap: true, gap: [10, 3], margin: 0 },
    text: () => ({ size: CRAMPED() ? 13 : 14 }) },
  { at: '.cd-side dt', box: (element) => ({ width: termsWidth(element.parentElement, termOf()), shrink: 0 }),
    text: { color: INK_DIM } },
  { at: '.cd-side dd', box: (element, round) => ({ margin: 0, shrink: 0,
    width: Math.max(0, columnOf(round, 1, 0) - termsWidth(element.parentElement, termOf()) - 10) }) },
  {
    at: '.cd-code',
    hits: true,
    box: { width: 242, margin: [8, 0, 0, 0], padding: [8, 10], border: 1, alignSelf: 'center' },
    look: (element) => ({ fill: '#0a0909', radius: 3,
      border: borderOf(alpha(FRAME, 0.6), () => accent())(element) }),
    text: () => ({ face: 'display', weight: 700, size: 22, spacing: 3, color: INK, align: 'center' }),
  },
  { at: '.cd-shown', box: { margin: [6, 0, 12, 0] }, text: { face: 'display', weight: 900, size: 34, spacing: 5,
    color: HIGHLIGHT, align: 'center' } },
  ...typedAbove('cloud-dialog'),
  { at: '#cloud-dialog.typing .modal-box', box: { padding: [12, 26, 22, 26], gap: 6 } },
  { at: '#cloud-dialog.typing .cd-code', box: { margin: 0 } },
];
