// Play together drawn by the engine (ui/kit's sheet; #973), rule for rule from `styles/_coop.scss`: the box, its
// head (the title and the tabs, or the room's code), its status line, the rooms browser, the create page, the hero's
// column and the foot (Quick join, the network log's line, the code and Join, Close). The room as its players are in
// it and the Friends tab are `coopRoomSheet.ts`. The dialog is `coop.ts`'s markup, written and listened to there as
// before. Sizes are px of the lobby's scale. A grid is laid out as flex rows here, its columns' shares as each
// item's grow (the rooms' rows and their head alike, so they line up). Not drawn: a tab's badge as a pill (its
// number in the badge's colour), the colours' and the network log's line moved under the rest on a short screen
// (CSS's `order`), an ellipsis where a name is cut.
import { SHORT, TOUCH, mediaQuery } from './controlsSheet';
import { accent } from './diagFrame';
import { COLOUR_PICKER } from './colourPickerSheet';
import { ALLY, ALLY_TEXT, COOP_ROOM, HERO_COLUMN, SMALL, dotOf } from './coopRoomSheet';
import { HELP_TEXT } from './helpTextSheet';
import { drawModal, finger, windowShare } from './modalSheet';
import { DANGER, FRAME, HIGHLIGHT, INK, INK_DIM, WELL, WELL_LIT, alpha } from './kit/theme';
import type { Sheet, SheetTree } from './kit/sheet';
import type { PanelStyle } from '../engine/ui';

/** a window under 1100 px wide: the tabs narrower, the network log's line gone from the foot */
const UNDER_1100 = mediaQuery('(max-width: 1100px)');
/** a phone held sideways with the browser's bars (`(max-height: 340px)`) */
const SHORTEST = mediaQuery('(max-height: 340px)');
const FIELD_INK = '#ffe7b0';
/** a finger's least height on touch (css px) */
const FINGER = 36;
/** the share of a room's row its host, its map and its players take (`1.5fr 1fr 110px`; small: `1.4fr 1fr auto`) */
const HOST_SHARE = (): number => (SMALL() ? 1.4 : 1.5);
const SIZE_COLUMN = 110;

/** a field's words on touch, 16 css px (under it a phone zooms the page into the field) */
const fieldSize = (size: number): number => (TOUCH() ? finger(16) : size);

/**
 * The box as what it shows has it (`#coop .modal-box:has(.coop-main)` and the rest, read here: the kit matches a rule
 * again as an element's markup or its ancestors' changes, never what's inside it, and the box kept the size it had out
 * of a room in one): the pages a fixed size, a room as tall as its party, a short screen's nearly all of it.
 */
function boxOf(element: Element): PanelStyle {
  const pages = !!element.querySelector('.coop-main');
  const room = !!element.querySelector('.coop-in-room');
  const box: PanelStyle = { width: pages ? 1000 : 680 };
  if (pages) {
    const tall = SHORT() ? windowShare(0.96).h : Math.min(700, windowShare(0.92).h);
    box.height = room ? 'auto' : tall;
    if (SHORT()) box.maxHeight = tall;
    box.padding = SHORT() || SHORTEST() ? [8, 14, 8, 14] : [18, 22, 14, 22];
  } else if (SHORTEST()) box.padding = [12, 26, 12, 26];
  if (SHORT() && TOUCH()) box.width = windowShare(0.94).w;
  return box;
}

/** The body: its pages filling the box (`.coop-body:has(.coop-main)`), in a room as tall as what's in it (grown from
 *  nothing, it filled the window's height). */
function bodyOf(element: Element): PanelStyle {
  const gap = SHORTEST() ? 4 : SHORT() ? 6 : 10;
  const body: PanelStyle = { direction: 'column', gap, alignItems: 'center' };
  if (!element.querySelector('.coop-main')) return body;
  const room = !!element.querySelector('.coop-in-room');
  return { ...body, grow: 1, shrink: 1, basis: room ? 'auto' : 0, minHeight: 0, alignItems: 'stretch',
    gap: SHORT() ? 5 : 8 };
}

/** The box and its head: the title beside the tabs, or the room's code. */
const FRAMEWORK: Sheet = [
  ...HELP_TEXT,
  { at: '#coop .modal-box', box: boxOf },
  { at: '#coop .modal-box > .sm-title', box: (element) =>
    ({ display: element.parentElement?.querySelector('.coop-head') ? 'none' : 'flex' }) },
  { at: '#coop .sm-title', when: SHORT, text: { size: 24 } },
  { at: '#coop .sm-title', when: SHORTEST, text: { size: 20 } },
  { at: '.coop-body', flex: true },
  { at: '.coop-body', box: bodyOf },
  { at: '.coop-head', flex: true, box: () => ({ direction: 'row', alignItems: 'end', gap: SMALL() || UNDER_1100()
    ? 10 : 18, shrink: 0, minWidth: UNDER_1100() ? 0 : undefined, border: [0, 0, 1, 0] }),
  look: { border: alpha(FRAME, 0.5) } },
  { at: '.coop-head .coop-room', flex: true, box: { direction: 'row', alignItems: 'baseline', gap: 8,
    margin: [0, 0, 0, 'auto'], padding: [0, 0, 6, 0] } },
  {
    at: '.coop-title',
    box: () => ({ margin: [0, 6, SMALL() ? 6 : 8, 0], display: SHORT() ? 'none' : 'flex' }),
    text: () => ({ face: 'display', weight: 700, size: UNDER_1100() ? 21 : SMALL() ? 18 : 26, spacing: 2,
      color: accent(), whole: true, shadows: [{ x: 0, y: 0, blur: 12, color: 'rgba(240,190,90,.3)' }] }),
  },
  // the tabs, to the right of the title
  { at: '.coop-tabs', flex: true, box: { direction: 'row', gap: 2, shrink: 0, border: [0, 0, 1, 0] },
    look: { border: alpha(FRAME, 0.5) } },
  { at: '.coop-head .coop-tabs', box: { border: 0, margin: [0, 0, 0, 'auto'] } },
  {
    at: '.coop-tab',
    flex: true,
    box: () => ({ direction: 'row', alignItems: 'center', justify: 'center', border: [1, 1, 0, 1],
      padding: UNDER_1100() ? [7, 11] : SMALL() ? [6, 12] : [8, 18],
      minHeight: TOUCH() ? finger(FINGER) : undefined }),
    look: { fill: WELL, border: 'rgba(0,0,0,0)', radius: [3, 3, 0, 0] },
    text: () => ({ face: 'display', weight: 600, size: UNDER_1100() || SMALL() ? 13 : 15,
      spacing: UNDER_1100() ? 1 : 1.5, color: INK_DIM, whole: true }),
    hover: { text: { color: INK } },
  },
  { at: '.coop-tab.on', look: { fill: WELL_LIT, border: alpha(FRAME, 0.7) }, text: () => ({ color: accent() }),
    hover: { text: { color: accent() } } },
  { at: '.coop-tab-hero', box: () => ({ display: SMALL() ? 'flex' : 'none' }) },
  { at: '.coop-badge', box: { minWidth: 18, margin: [0, 0, 0, 6], padding: [0, 5] },
    text: { face: 'body', weight: 700, size: 12, line: 1.5, spacing: 0, color: HIGHLIGHT, align: 'center' } },
  { at: '.coop-badge.blank', look: { opacity: 0 } },
];

/** What the dialog says over its pages, and its words round them. */
const LINES: Sheet = [
  { at: '.coop-intro', box: { margin: 0 }, text: () => ({ size: SHORT() ? 13 : 15, line: 1.4, color: INK_DIM }) },
  // (its link in its words: the words before it a box of their own, wrapped at the column's width, the link and the
  // words after it under them)
  { at: '.coop-intro:has(.link)', flex: true, box: { direction: 'row', wrap: true, alignItems: 'baseline',
    gap: [4, 0] } },
  { at: '.coop-intro .link', box: { padding: 0 }, text: { size: 15, color: ALLY_TEXT } },
  { at: '.coop-error', box: { margin: 0 }, text: { color: DANGER } },
  { at: '.coop-checking', box: { margin: 0 }, text: { color: INK_DIM } },
  { at: '.coop-checking b', text: { color: INK } },
  { at: '.coop-offline', flex: true, box: { direction: 'row', alignItems: 'center', gap: 14, padding: [10, 14],
    alignSelf: 'stretch', border: 1 }, look: { fill: alpha(DANGER, 0.08), border: alpha(DANGER, 0.45) },
  text: { align: 'start' } },
  { at: '.coop-offline p', box: { margin: 0, grow: 1, basis: 0 }, text: { color: DANGER } },
  { at: '.coop-offline .btn', box: { shrink: 0 } },
  { at: '.coop-choice.off', look: { opacity: 0.45 } },
  { at: '.coop-choice.busy .btn.pressed:disabled', look: { opacity: 0.85 } },
  { at: '.coop-netlog', flex: true, box: { margin: 0, direction: 'row', wrap: true, alignItems: 'baseline',
    justify: 'center', gap: [4, 0] }, text: { size: 13, color: INK_DIM } },
  { at: '.coop-netlog .link', box: { padding: 0 }, text: { size: 13, color: ALLY_TEXT } },
  { at: '.coop-wait', text: { color: INK_DIM } },
  { at: '.coop-room', text: { size: 16, color: INK_DIM } },
  { at: '.coop-code', text: () => ({ face: 'display', size: SHORT() ? 24 : 30, spacing: 5, color: ALLY_TEXT }) },
  // (the head's room code after the plain one's: the kit takes the later of two rules, never the more specific)
  { at: '.coop-head .coop-room .coop-code', text: { size: 24, spacing: 4 } },
  { at: '.coop-room-kind', box: { margin: [-4, 0, 0, 0] }, text: { size: 14, color: INK_DIM } },
  { at: '.coop-pass-ask', flex: true, box: { direction: 'row', gap: 6, alignSelf: 'center', width: 420,
    maxWidth: '100%' } },
];

/** The fields and the name tag. */
const FIELDS: Sheet = [
  { at: '.coop-tag', flex: true, hits: true, box: { direction: 'row', alignItems: 'center', gap: 10,
    alignSelf: 'stretch', justify: 'center', wrap: true } },
  { at: '.coop-tag span', text: () => ({ face: 'display', size: 16, color: accent() }) },
  {
    at: '.coop-tag input',
    hits: true,
    box: { width: 12 * 17, maxWidth: '100%', padding: [7, 10], border: 1 },
    look: { fill: '#0a0909', border: alpha(FRAME, 0.55), radius: 3 },
    // (an input's words stand at its start whatever the text round it: the dialog's are centred)
    text: { face: 'body', weight: 600, size: 17, color: FIELD_INK, align: 'start' },
  },
  { at: '.coop-tag.taken input', look: { border: DANGER, shadow: { blur: 0, color: alpha(DANGER, 0.5) } } },
  { at: '.coop-tag.off', look: { opacity: 0.45 } },
  { at: '.coop-tag-note', box: { margin: [-4, 0, 0, 0] }, text: { size: 14, color: DANGER } },
  {
    at: '#coop-search, .coop-field input, .coop-pass-ask input, #coop-room-pass, #coop-friend-code',
    hits: true,
    box: { grow: 1, shrink: 1, basis: 200, minWidth: 0, padding: [7, 10], border: 1 },
    look: { fill: '#0a0909', border: alpha(FRAME, 0.5), radius: 3 },
    text: () => ({ face: 'body', size: fieldSize(15), color: INK, align: 'start' }),
  },
  { at: '#coop-friend-code', text: { spacing: 1 } },
  { at: '.coop-field input', box: { grow: 0, shrink: 0, basis: 'auto' } },
  { at: '.coop-room-more #coop-room-pass', box: { grow: 0, shrink: 1, basis: 220 } },
  { at: '.coop-join', flex: true, box: { direction: 'row', gap: 6 } },
  {
    at: '.coop-join input, .coop-link input',
    hits: true,
    box: () => ({ width: 7.5 * fieldSize(18), padding: [7, 8], border: 1 }),
    look: { fill: '#0a0909', border: alpha(FRAME, 0.55), radius: 3 },
    text: () => ({ face: 'display', weight: 700, size: fieldSize(18), spacing: 3, upper: true, color: FIELD_INK,
      align: 'center' }),
  },
  { at: '.coop-link', flex: true, box: { direction: 'row', gap: 6, alignSelf: 'stretch' } },
  { at: '.coop-link input', box: { grow: 1, minWidth: 0, width: 'auto' },
    text: { face: 'body', weight: 400, size: 14, spacing: 0, upper: false, color: INK, align: 'start' } },
  { at: '.coop-party .coop-link', box: { shrink: 0 } },
];

/** The pages side by side, the hero's column beside them; one at a time on a small screen. */
const PAGES: Sheet = [
  { at: '.coop-main', flex: true, box: () => ({ direction: SMALL() ? 'column' : 'row', gap: 14, grow: 1,
    shrink: 1, basis: 0, minHeight: 0, alignItems: 'stretch' }), text: { align: 'start' } },
  { at: '.coop-pane', flex: true, scrolls: true, box: { direction: 'column', gap: 10, minHeight: 0,
    overflow: 'scroll', grow: 1, basis: 0, minWidth: 0 } },
  { at: '.coop-pane.off', look: { opacity: 0.45 } },
  {
    at: '.coop-main[data-pane="browse"] .coop-create, .coop-main[data-pane="create"] .coop-browse,'
      + ' .coop-main[data-pane="hero"] .coop-create, .coop-main[data-pane="friends"] .coop-browse,'
      + ' .coop-main[data-pane="friends"] .coop-create, .coop-main:not([data-pane="friends"]) .coop-friends',
    box: { display: 'none' },
  },
  { at: '.coop-main[data-pane]:not([data-pane="hero"]) .coop-hero, .coop-main[data-pane="hero"] .coop-browse',
    when: SMALL, box: { display: 'none' } },
  { at: '.coop-hero', box: () => ({ padding: 12, border: 1, alignItems: 'stretch', grow: SMALL() ? 1 : 0,
    width: SMALL() ? 'auto' : HERO_COLUMN, basis: SMALL() ? 0 : 'auto', shrink: 0 }),
  look: { fill: 'rgba(0,0,0,.3)', border: alpha(FRAME, 0.35) } },
  { at: '.coop-hero :is(.coop-tag, .coop-colour)', box: { justify: 'start' } },
  { at: '.coop-hero .coop-tag input', box: { width: '100%' } },
];

/** The rooms browser: its filters, the column heads and the rows. */
const BROWSE: Sheet = [
  { at: '.coop-tools', flex: true, box: { direction: 'row', gap: 8, wrap: true, alignItems: 'center',
    shrink: 0 } },
  { at: '.coop-chips', flex: true, box: { direction: 'row', gap: 6, wrap: true } },
  {
    at: '.coop-chip',
    box: () => ({ padding: [6, 11], border: 1, minHeight: TOUCH() ? finger(FINGER) : undefined,
      justify: 'center' }),
    look: { fill: WELL, border: alpha(FRAME, 0.3), radius: 3 },
    text: { weight: 600, size: 14, color: INK_DIM, whole: true },
    hover: { text: { color: INK } },
  },
  { at: '.coop-chip.on', look: { fill: WELL_LIT, border: alpha(FRAME, 0.9) }, text: () => ({ color: accent() }) },
  { at: '.coop-rooms-head', flex: true, box: () => ({ direction: 'row', gap: 10, alignItems: 'center',
    padding: [0, 10], margin: [0, 86, 0, 0], shrink: 0, display: SMALL() ? 'none' : 'flex' }),
  text: { face: 'display', weight: 600, size: 11, spacing: 1.5, upper: true, color: INK_DIM } },
  { at: '.coop-rooms-head > span:nth-child(1)', box: () => ({ grow: HOST_SHARE(), basis: 0, minWidth: 0 }) },
  { at: '.coop-rooms-head > span:nth-child(2)', box: { grow: 1, basis: 0, minWidth: 0 } },
  { at: '.coop-rooms-head > span:nth-child(3)', box: { width: SIZE_COLUMN, shrink: 0 } },
  { at: '.coop-rooms-head > span:nth-child(4)', box: { display: 'none' } },
  { at: '.coop-rooms', flex: true, scrolls: true, box: { direction: 'column', margin: 0, padding: 0,
    overflow: 'scroll', grow: 1, basis: 0, minHeight: 0, border: [1, 0, 0, 0] }, look: { border: alpha(FRAME, 0.3) } },
  { at: '.coop-rooms-empty', box: { padding: [28, 12] }, text: { align: 'center', color: INK_DIM } },
  { at: '.coop-room-row', flex: true, box: { direction: 'row', wrap: true, alignItems: 'center', gap: [8, 0],
    padding: [4, 6, 4, 0], border: [0, 0, 1, 0] }, look: { border: alpha(FRAME, 0.18) } },
  { at: '.coop-room-row.picked', look: { fill: alpha(HIGHLIGHT, 0.08) },
    marks: [{ inset: [0, 'auto', 0, 0], bar: { width: 3, fill: HIGHLIGHT } }] },
  { at: '.coop-room-row.full', look: { opacity: 0.6 } },
  {
    at: '.coop-room-pick',
    flex: true,
    hits: true,
    box: () => ({ direction: 'row', gap: SMALL() ? 8 : 10, alignItems: 'center', padding: SHORT() ? [3, 8] : [6, 10],
      grow: 1, basis: 0, minWidth: 0 }),
    text: { color: INK, align: 'start' },
    hover: { look: { fill: alpha(HIGHLIGHT, 0.05) } },
  },
  { at: '.coop-room-pick > .coop-room-host', box: () => ({ grow: HOST_SHARE(), basis: 0 }) },
  { at: '.coop-room-pick > .coop-room-map', box: { grow: 1, basis: 0 } },
  { at: '.coop-room-pick > .coop-room-size', box: () => (SMALL() ? { shrink: 0 } : { width: SIZE_COLUMN,
    shrink: 0 }) },
  { at: '.coop-room-pick small', text: { size: 13, color: INK_DIM, whole: true } },
  { at: '.coop-room-host', flex: true, box: { direction: 'row', alignItems: 'center', gap: 9, minWidth: 0 } },
  { at: '.coop-room-names', flex: true, box: { direction: 'column', minWidth: 0, overflow: 'hidden' } },
  { at: '.coop-room-names b', box: { overflow: 'hidden' }, text: { size: 16, whole: true } },
  { at: '.coop-room-names small', box: { overflow: 'hidden' } },
  {
    at: '.coop-cls',
    box: { width: 24, height: 24, shrink: 0, alignItems: 'center', justify: 'center' },
    look: (element) => ({ fill: dotOf(element), radius: 12 }),
    text: { face: 'display', weight: 700, size: 12, color: '#120e0a', align: 'center' },
  },
  { at: '.coop-lock', box: { shrink: 0 }, text: { size: 13, color: HIGHLIGHT } },
  { at: '.coop-room-map', flex: true, box: { direction: 'column', minWidth: 0, overflow: 'hidden' } },
  { at: '.coop-room-size', flex: true, box: { direction: 'row', alignItems: 'center', gap: 8 } },
  { at: '.coop-pips', flex: true, box: () => ({ direction: 'row', gap: 3, display: SMALL() ? 'none' : 'flex' }) },
  { at: '.coop-pips i', box: { width: 8, height: 14 }, look: { fill: '#2a2a30', radius: 2 } },
  { at: '.coop-pips i.on', look: { fill: ALLY } },
  { at: '.coop-room-join', box: () => ({ minWidth: 78, padding: [6, 12], shrink: 0, justify: 'center',
    minHeight: TOUCH() ? finger(FINGER) : undefined }) },
  { at: '.coop-room-more', flex: true, box: { basis: '100%', direction: 'row', alignItems: 'center', gap: 10,
    wrap: true, padding: [2, 10, 8, 43] }, text: { size: 14, color: INK_DIM } },
];

/** The create page: the kind of room, its name, its password, how many it holds, Open the room. */
const CREATE: Sheet = [
  { at: '.coop-create', box: () => ({ gap: SHORT() ? 6 : 10 }) },
  { at: '.coop-kinds', flex: true, box: { direction: 'row', shrink: 0 } },
  {
    at: '.coop-kind, .coop-size',
    flex: true,
    hits: true,
    box: () => ({ direction: 'column', alignItems: 'center', justify: 'center', padding: [10, 6], border: 1,
      minHeight: TOUCH() ? finger(FINGER) : undefined }),
    look: { fill: WELL, border: alpha(FRAME, 0.3) },
    text: { color: INK_DIM, align: 'center' },
  },
  { at: '.coop-kind', box: () => ({ grow: 1, basis: 0, minWidth: 0, padding: SHORT() ? [6, 4] : [10, 6] }) },
  { at: ':is(.coop-kind, .coop-size) b', text: { face: 'display', weight: 600, size: 16, color: INK } },
  { at: '.coop-kind small', box: () => ({ margin: [2, 0, 0, 0], display: SHORT() ? 'none' : 'flex' }),
    text: { size: 13 } },
  { at: ':is(.coop-kind, .coop-size).on', look: { fill: WELL_LIT, border: alpha(FRAME, 0.95) } },
  { at: '.coop-kind.on b', text: () => ({ color: accent() }) },
  { at: '.coop-field', flex: true, hits: true, box: { direction: 'column', gap: 4, shrink: 0 } },
  { at: '.coop-field span', text: { size: 14, color: INK_DIM } },
  { at: '.coop-sizes-row', flex: true, box: { direction: 'row', alignItems: 'center', gap: 12, shrink: 0 } },
  { at: '.coop-sizes-row > span', text: { size: 14, color: INK_DIM } },
  { at: '.coop-sizes', flex: true, box: { direction: 'row' } },
  { at: '.coop-sizes .coop-size', box: { width: 48, padding: [8, 0] },
    text: { face: 'display', weight: 600, size: 16 } },
  { at: '.coop-size.on', text: () => ({ color: accent() }) },
  { at: '.coop-pass-note', box: { margin: [-4, 0, 0, 0] }, text: { size: 14, color: DANGER } },
  { at: '.coop-create #btn-coop-host', box: { alignSelf: 'start', minWidth: 200, justify: 'center' } },
  { at: '.coop-create .coop-intro', box: () => ({ display: SHORT() ? 'none' : 'flex' }), text: { size: 14 } },
  { at: '.coop-check', flex: true, hits: true, box: { direction: 'row', alignItems: 'center', gap: 6 },
    text: { size: 14, color: INK_DIM } },
  { at: '.coop-check input', box: { width: 16, height: 16, shrink: 0 } },
  { at: '.coop-sizes-row .coop-check', box: { margin: [0, 0, 0, 'auto'] } },
];

/** The foot: its own controls, the network log's line, the code and Join, Close. */
const FOOT: Sheet = [
  { at: '.coop-choice', flex: true, box: { direction: 'row', gap: 14, alignSelf: 'stretch' } },
  { at: '.coop-foot', box: { gap: 10, alignItems: 'center', shrink: 0, padding: [8, 0, 0, 0], border: [1, 0, 0, 0] },
    look: { border: alpha(FRAME, 0.35) } },
  { at: '.coop-foot > .coop-netlog', box: () => ({ grow: 1, basis: 0, minWidth: 0,
    display: SHORT() || UNDER_1100() ? 'none' : 'flex' }), text: { size: 12, line: 1.3 } },
  { at: '.coop-foot .coop-netlog .link', text: { size: 12 } },
  { at: '.coop-close-slot', flex: true, box: { direction: 'row', shrink: 0 } },
  { at: '.coop-foot .coop-join', box: { margin: [0, 0, 0, 'auto'] } },
  { at: '.coop-close-slot', box: (element) =>
    (element.closest('.coop-foot')?.querySelector('#btn-coop-leave') ? { margin: [0, 0, 0, 'auto'] } : {}) },
  // (its width in its own ems: a touch screen's smaller words make it narrower)
  { at: '.coop-foot .coop-join input', box: () => ({ width: 10.5 * fieldSize(18) }), text: { spacing: 2 } },
  { at: '.coop-foot .coop-join .btn', box: { minWidth: 7.5 * 15, justify: 'center' } },
  { at: '.coop-foot .btn', box: () => ({ minHeight: TOUCH() ? finger(FINGER) : undefined }) },
  { at: '#btn-coop-copy', box: { minWidth: 8.2 * 15, justify: 'center' } },
];

/** the dialog's tree, once it's drawn by the engine */
let tree: SheetTree | null = null;

/** `rules` laid over the dialog's own until the call it returns takes them out (a lab canary's fault, drawn where the
 *  engine draws the dialog); none before it's drawn. */
export const plantInCoop = (rules: Sheet): (() => void) | null => tree?.plant(rules) ?? null;

/** Play together drawn by the engine from now on, the page's out of sight. */
export function drawCoop(): void {
  tree = drawModal('coop', [...FRAMEWORK, ...LINES, ...FIELDS, ...PAGES, ...BROWSE, ...CREATE, ...FOOT, ...COLOUR_PICKER,
    ...COOP_ROOM]);
}
