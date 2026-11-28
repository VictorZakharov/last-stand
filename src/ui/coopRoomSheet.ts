// Play together's room as its players are in it, drawn by the engine (ui/kit's sheet; #973), rule for rule from
// `styles/_coop.scss`: a card a place (the portrait, the colour's dot, the name tag, the class in its accent, the gear's
// level and the best wave, the host's mark and a partner's Trade), the hero's colour folded into a dropdown, the
// portrait picker, and the Friends tab with a room's Invite list. The cards' columns line up as the page's subgrid
// lines them up: the stats' and the marks' widths are the widest any card needs, given to every card, and the narrow
// card's rules (the page's container queries) read the party's width as drawn. Sizes are px of the lobby's scale. Not
// drawn: the cards' fill across (a flat fill of its middle), an empty place's dashed edge (a solid one).
import { SHORT, TOUCH, mediaQuery } from './controlsSheet';
import { accent } from './diagFrame';
import { finger } from './modalSheet';
import { DANGER, FRAME, HIGHLIGHT, INK, INK_DIM, alpha } from './kit/theme';
import { measure, type TextStyle } from './overlay/paint';
import { uiScales } from './scale';
import type { Painted, Sheet } from './kit/sheet';

export const ALLY = '#6ab8ff';
export const ALLY_TEXT = '#9ccfff';
const CHOSEN = '#ffe7b0';
/** the hero's column beside the pages */
export const HERO_COLUMN = 290;
/** an upright tablet or a narrow tall window (`(max-width: 900px) and (min-height: 521px)`): the hero under the party */
const TALL_NARROW = mediaQuery('(max-width: 900px) and (min-height: 521px)');
/** a small screen (`(max-width: 760px), (max-height: 520px)`): one page at a time, the hero's a tab of its own */
export const SMALL = mediaQuery('(max-width: 760px), (max-height: 520px)');

/** the party's width as drawn last (px of the lobby's scale), which the narrow card's rules read */
let partyWidth = Infinity;
/** a narrow party (the page's `@container (max-width: n)`) */
const narrow = (most: number): boolean => partyWidth <= most;

/** An element's inline `--dot` colour (a class's accent), the ally's blue where none. */
export const dotOf = (element: Element): string =>
  (element as HTMLElement).style.getPropertyValue('--dot').trim() || ALLY;
/** An element's inline `--swatch` colour. */
const swatchOf = (element: Element): string =>
  (element as HTMLElement).style.getPropertyValue('--swatch').trim() || 'rgba(0,0,0,0)';

/** A picture filling its box, cut to it (`object-fit: cover`), once it's loaded. */
function covered(element: Element, w: number, h: number): Painted | null {
  const image = element as HTMLImageElement;
  if (!image.getAttribute('src') || !image.complete || !image.naturalWidth) return null;
  const scale = Math.max(w / image.naturalWidth, h / image.naturalHeight);
  const [drawnW, drawnH] = [image.naturalWidth * scale, image.naturalHeight * scale];
  return {
    key: `covered ${image.src.slice(-40)} ${w}x${h}`,
    paint: (c) => c.drawImage(image, (w - drawnW) / 2, (h - drawnH) / 2, drawnW, drawnH),
  };
}

/** the arrow's half width and its stroke (px of the art: the page's 6 px square turned, its two borders 1 px) */
const ARROW = { half: 4.2, stroke: 1.2, right: 14 };

/** A dropdown summary's arrow at its right, as the page turns a corner of two borders: down, or up while it's open
 *  (its face has no such glyph). */
function arrow(element: Element, w: number, h: number): Painted {
  const open = !!element.closest('details')?.open;
  const colour = accent();
  return {
    key: `arrow ${open} ${colour} ${w}x${h}`,
    paint: (c) => {
      const x = w - ARROW.right;
      const y = h / 2;
      const rise = (open ? -1 : 1) * ARROW.half / 2;
      c.strokeStyle = colour;
      c.lineWidth = ARROW.stroke;
      c.beginPath();
      c.moveTo(x - ARROW.half, y - rise);
      c.lineTo(x, y + rise);
      c.lineTo(x + ARROW.half, y - rise);
      c.stroke();
    },
  };
}

/** A stat's figure and its name, as a card shows them now. */
const statValue = (): TextStyle => ({ face: 'display', weight: 700, size: SHORT() ? 15 : 20, color: accent() });
const statName = (): TextStyle =>
  ({ face: 'body', size: SHORT() ? 9 : 11, spacing: 1, upper: true, color: INK_DIM });
/** a stat's least width, as the card's width leaves it */
const statLeast = (): number => (SHORT() ? 44 : narrow(420) ? 34 : narrow(560) ? 40 : 58);
/** whether a stat says its short name (a narrow card) */
const shortNames = (): boolean => narrow(560);
/** the gap between a card's stats */
const statsGap = (): number => (SHORT() || narrow(560) ? 8 : 18);

/** The widest of a card's stats: its name or its figure, at least its least width. */
function statWidth(card: Element): number {
  let widest = statLeast();
  for (const stat of card.querySelectorAll('.coop-stat')) {
    const name = stat.querySelector(shortNames() ? '.short' : '.long')?.textContent ?? '';
    const value = stat.querySelector('b')?.textContent ?? '';
    widest = Math.max(widest, measure(name, statName()).w, measure(value, statValue()).w);
  }
  return Math.ceil(widest);
}

/** The stats' column, as wide as the widest card's (none where the party is narrowest). */
function statsWidth(list: Element): number {
  let widest = 0;
  for (const card of list.querySelectorAll('.coop-card:not(.empty)')) {
    const count = card.querySelectorAll('.coop-stat').length;
    if (count) widest = Math.max(widest, count * statWidth(card) + (count - 1) * statsGap());
  }
  return widest;
}

/** The marks' column (the host's, a Trade), as wide as the card with the most, at least its least width. */
function marksWidth(list: Element): number {
  const [one, gap, least] = SHORT() ? [58, 6, 48] : [78, 8, 64];
  let most = 0;
  for (const mark of list.querySelectorAll('.coop-card-mark')) most = Math.max(most, mark.children.length);
  return Math.max(least, most * one + Math.max(0, most - 1) * gap);
}

/** The gap between a card's columns, as the party's width leaves it. */
const columnGap = (): number => (SHORT() ? 8 : narrow(420) ? 8 : narrow(560) ? 10 : 14);

/** The room's two columns, the party and the hero, or one. */
const ROOM: Sheet = [
  { at: '.coop-in-room', box: () => ({ direction: TALL_NARROW() ? 'column' : 'row' }) },
  { at: '.coop-in-room .coop-hero', box: () => (TALL_NARROW()
    ? { width: 'auto', grow: 0, basis: 'auto' }
    : { width: SHORT() ? 260 : HERO_COLUMN, minWidth: 0, shrink: SHORT() ? 1 : 0, grow: 0, basis: 'auto' }) },
  { at: '.coop-in-room', box: { basis: 'auto' } },
  { at: '.coop-in-room .coop-party', box: () => ({ grow: 1, basis: TALL_NARROW() ? 'auto' : 0 }) },
  { at: '.coop-in-room.joining', box: { direction: 'column', justify: 'center' }, text: { align: 'center' } },
  { at: '.coop-in-room.joining .coop-party', box: { alignItems: 'center', justify: 'center' } },
  { at: '.coop-party .coop-intro', when: SHORT, box: { display: 'none' } },
  { at: '.coop-dot', box: { width: 8, height: 8, margin: [0, 8, 0, 0], shrink: 0 },
    look: (element) => ({ fill: dotOf(element), radius: 4, shadow: { blur: 6, color: dotOf(element) } }) },
];

/** A card a place: one height for every card, its parts in columns as wide on every card. */
const CARDS: Sheet = [
  { at: '.coop-party .coop-list', flex: true, box: (_, party) => {
    const drawn = party?.rect();
    if (drawn) partyWidth = drawn.w / uiScales.ui;
    return { direction: 'column', gap: 6, margin: 0, padding: 0 };
  } },
  {
    at: '.coop-list > .coop-card',
    flex: true,
    box: () => {
      const tall = SHORT() ? (TOUCH() ? Math.max(46, finger(42)) : 46) : 72;
      const sides = SHORT() ? [8, 8] : narrow(420) ? [10, 8] : [16, 12];
      return { direction: 'row', alignItems: 'center', gap: columnGap(), height: tall, border: 1,
        padding: [0, sides[0], 0, sides[1]] };
    },
    look: { fill: 'rgba(26,22,20,.94)', border: alpha(FRAME, 0.35), radius: 3 },
  },
  { at: '.coop-list > .coop-card.own', marks: [{ inset: [0, 'auto', 0, 0], bar: { width: 3, fill: HIGHLIGHT } }] },
  { at: '.coop-list > .coop-card.empty', look: { fill: 'rgba(0,0,0,.22)' }, text: { color: INK_DIM } },
  {
    at: '.coop-card-face',
    flex: true,
    box: () => {
      const side = SHORT() ? 36 : narrow(420) ? 40 : 52;
      return { width: side, height: side, shrink: 0, border: 1, overflow: 'hidden', alignItems: 'center',
        justify: 'center' };
    },
    look: { fill: 'rgba(0,0,0,.35)', border: alpha(FRAME, 0.5), radius: 3 },
  },
  { at: '.coop-card.empty .coop-card-face', look: { fill: 'rgba(0,0,0,0)', border: alpha(FRAME, 0.25) } },
  { at: '.coop-card-face > *', box: { width: '100%', height: '100%', border: 0 }, look: { radius: 0 } },
  { at: '.coop-card-face > img', paint: covered },
  { at: '.coop-card-face > svg', picture: () => (SHORT() ? [34, 34] : narrow(420) ? [38, 38] : [50, 50]) },
  { at: '.coop-card-who', flex: true, box: { direction: 'column', gap: 3, grow: 1, basis: 0, minWidth: 0 } },
  { at: '.coop-card-who b', flex: true, box: { direction: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
    text: () => ({ face: 'body', weight: 700, size: SHORT() ? 14 : narrow(420) ? 16 : 18, spacing: 0.3,
      color: '#f3e7cf' }) },
  { at: '.coop-card-who .coop-dot', box: { margin: [0, 0, 0, 0] } },
  { at: '.coop-card-name', box: { minWidth: 0, overflow: 'hidden' }, text: { whole: true } },
  { at: '.coop-card-who small', box: { overflow: 'hidden' }, text: (element) => ({ face: 'display', weight: 600,
    size: SHORT() ? 10 : 12, spacing: 1.5, upper: true, whole: true,
    color: (element as HTMLElement).style.color || INK }) },
  { at: '.coop-card.empty .coop-card-who b', text: { face: 'display', weight: 600, size: 15, spacing: 1.5,
    color: INK_DIM } },
  { at: '.coop-card.empty .coop-card-who small', text: { face: 'body', weight: 400, size: 13, spacing: 0,
    upper: false, color: INK_DIM } },
  // (the stats' and the marks' columns as wide on every card: the page's subgrid)
  { at: '.coop-card-stats', flex: true, box: (element) => {
    const list = element.closest('.coop-list');
    const width = list ? statsWidth(list) : 0;
    return { direction: 'row', gap: statsGap(), width, shrink: 0, display: narrow(300) ? 'none' : 'flex' };
  } },
  { at: '.coop-stat', flex: true, box: (element) => ({ direction: 'column', alignItems: 'center',
    width: statWidth(element.closest('.coop-card') ?? element), shrink: 0 }) },
  { at: '.coop-stat b', text: () => ({ ...statValue(), line: 1.1 }) },
  { at: '.coop-stat small', says: (element) => element.querySelector(shortNames() ? '.short' : '.long')
    ?.textContent ?? '', text: () => ({ ...statName(), whole: true }) },
  { at: '.coop-card-mark', flex: true, box: (element) => {
    const list = element.closest('.coop-list');
    return { direction: 'row', justify: 'end', alignItems: 'center', gap: SHORT() ? 6 : 8, shrink: 0,
      width: list ? marksWidth(list) : 64 };
  } },
  {
    at: '.coop-card-mark > :is(.coop-card-host, .coop-trade)',
    box: () => ({ minWidth: SHORT() ? 58 : 78, height: SHORT() ? 22 : 28, padding: SHORT() ? [0, 8] : [0, 12],
      alignItems: 'center', justify: 'center', shrink: 0 }),
    look: { radius: 3 },
    text: () => ({ face: 'display', weight: 700, size: SHORT() ? 11 : 13, spacing: 1, line: 1, whole: true,
      align: 'center' }),
  },
  { at: '.coop-card-host', box: { border: 1 }, look: { fill: alpha(HIGHLIGHT, 0.08), border: alpha(HIGHLIGHT, 0.6) },
    text: { color: HIGHLIGHT } },
  { at: '.coop-card-mark > .coop-card-host', when: TOUCH, box: () => ({ minHeight: finger(36) }) },
  // (the trade screen's: a Trade that can't be asked now, dimmed; a finger's height on touch)
  { at: '.coop-trade:disabled', look: { opacity: 0.45 } },
  { at: '.coop-trade', when: TOUCH, box: () => ({ minHeight: finger(36) }) },
];

/** The hero's colour folded into a dropdown: the colour worn and its name, the palette under it as it opens. */
const COLOUR_DROP: Sheet = [
  // (no wrap: the picker's row wraps, and a column that wraps laid the open palette beside its summary in a short
  // column, where CSS sizes the column to its content)
  { at: '.colour-drop', box: { direction: 'column', alignItems: 'stretch', gap: 8, wrap: false } },
  {
    at: '.colour-drop summary',
    flex: true,
    hits: true,
    box: () => ({ direction: 'row', alignItems: 'center', gap: SHORT() ? 6 : 10, padding: [5, 26, 5, 8], border: 1 }),
    look: { border: alpha(FRAME, 0.35), radius: 3 },
    paint: arrow,
  },
  { at: '.colour-drop:not([open]) > :not(summary)', box: { display: 'none' } },
  { at: '.colour-drop .cc-label', text: () => ({ face: 'display', size: SHORT() ? 13 : 16, color: accent(),
    whole: true }) },
  {
    at: '.colour-drop .cc-now',
    box: { width: 26, height: 26, shrink: 0, border: 2, alignItems: 'center', justify: 'center' },
    look: (element) => ({ fill: swatchOf(element), border: CHOSEN, radius: 13 }),
    ring: 'rgba(0,0,0,.45)',
    text: { weight: 600, size: 11, color: INK, align: 'center' },
  },
  { at: '.colour-drop .cc-now.cc-any', look: { fill: '#0a0909' } },
  { at: '.colour-drop .cc-now-name', text: { color: INK } },
  { at: '.colour-drop .cc-swatches', box: { justify: 'start' } },
];

/** The portrait picker: the portrait worn and its words, five pictures a row under it as it opens, and None. */
const PORTRAITS: Sheet = [
  { at: '.portrait-picker', flex: true, box: { direction: 'column', width: '100%', maxWidth: 360 } },
  { at: '.portrait-picker summary', flex: true, hits: true, box: { direction: 'row', alignItems: 'center',
    justify: 'center', gap: 8, padding: [5, 22, 5, 5], border: 1 }, look: { border: alpha(FRAME, 0.35), radius: 3 },
  text: () => ({ size: 15, color: accent() }),
  paint: arrow },
  { at: '.portrait-picker:not([open]) > :not(summary)', box: { display: 'none' } },
  { at: '.party-portrait', box: { width: 36, height: 36, shrink: 0, border: 1 },
    look: { border: alpha(FRAME, 0.65), radius: 3 } },
  { at: 'img.party-portrait', paint: covered },
  { at: 'svg.party-portrait', picture: [34, 34] },
  { at: '.portrait-options', flex: true, box: { direction: 'row', wrap: true, gap: 5, margin: [8, 0, 0, 0] } },
  {
    at: '.portrait-option',
    hits: true,
    box: (_, options) => {
      const room = (options?.rect()?.w ?? 0) / uiScales.ui;
      const side = Math.max(40, (room - 4 * 5) / 5 - 0.01);
      return { width: side, height: side, padding: 0, border: 1, overflow: 'hidden' };
    },
    look: { fill: 'rgba(22,20,24,.95)', border: alpha(FRAME, 0.5), radius: 3 },
  },
  { at: '.portrait-option[aria-pressed="true"]', ring: accent },
  { at: '.portrait-option img', box: { width: '100%', height: '100%' }, paint: covered },
  { at: '.portrait-clear', flex: true, box: { direction: 'row', justify: 'end', margin: [6, 0, 0, 0] } },
  { at: '.portrait-none', box: () => ({ padding: [4, 10], minHeight: TOUCH() ? finger(40) : 30 }),
    text: { size: 14 } },
];

/** The Friends tab, and a room's Invite list. */
const FRIENDS: Sheet = [
  { at: '.coop-friend-add', flex: true, hits: true, box: { direction: 'row', gap: 8, shrink: 0 } },
  // (a line's height while it's blank: its no-break space is trimmed here, and the line under it moved as a note came)
  { at: '.coop-friend-note', box: { margin: [-4, 0, 0, 0], minHeight: 14 * 1.2 }, text: { size: 14,
    color: ALLY_TEXT } },
  { at: '.coop-friend-note.bad', text: { color: DANGER } },
  { at: '.coop-friend-note.blank', look: { opacity: 0 } },
  { at: '.coop-friend-me', flex: true, box: { direction: 'row', alignItems: 'center', gap: 10, wrap: true,
    shrink: 0 }, text: { size: 14, color: INK_DIM } },
  { at: '.coop-friend-me .coop-friend-code', text: () => ({ face: 'display', weight: 700, size: 18, spacing: 3,
    color: accent() }) },
  { at: '.coop-friend-me .coop-check', box: () => ({ margin: [0, 0, 0, SMALL() ? 0 : 'auto'] }) },
  { at: ':is(.coop-friend-add, .coop-friend-me) .btn, .coop-friend-act', when: TOUCH,
    box: () => ({ minHeight: finger(36) }) },
  { at: '.coop-copy-code', box: { minWidth: 6.6 * 15, justify: 'center' } },
  { at: '.coop-friends-sections', flex: true, scrolls: true, box: { direction: 'column', grow: 1, basis: 0,
    minHeight: 0, overflow: 'scroll' } },
  { at: '.coop-friends-head', box: { margin: [10, 0, 6, 0] }, text: { face: 'display', weight: 600, size: 12,
    spacing: 1.5, upper: true, color: INK_DIM } },
  { at: '.coop-invite-friends .coop-friends-head', box: { margin: [4, 0, 6, 0] } },
  { at: '.coop-invite-friends', flex: true, box: { direction: 'column' } },
  { at: '.coop-friends-list', flex: true, box: { direction: 'column', gap: 4, margin: 0, padding: 0 } },
  { at: '.coop-friend', flex: true, box: () => ({ direction: 'row', alignItems: 'center', gap: SMALL() ? 6 : 8,
    padding: SMALL() ? [3, 6] : [4, 6, 4, 8], border: 1 }),
  look: { fill: 'rgba(0,0,0,.3)', border: alpha(FRAME, 0.3), radius: 3 } },
  { at: '.coop-friend-who', flex: true, box: { direction: 'column', grow: 1, basis: 0, minWidth: 0 } },
  { at: '.coop-friend-who b', box: { overflow: 'hidden' }, text: { size: 15, line: 1.2, whole: true } },
  { at: '.coop-friend-who small', box: { overflow: 'hidden' }, text: { size: 13, line: 1.2, color: INK_DIM,
    whole: true }, before: { says: '● ', text: { size: 9, color: alpha(FRAME, 0.45) } } },
  { at: '.coop-friend-who small.on', text: { color: ALLY_TEXT }, before: { says: '● ', text: { size: 9,
    color: ALLY } } },
  { at: '.coop-friend-acts', flex: true, box: { direction: 'row', gap: 6, shrink: 0 } },
  { at: '.coop-friend-acts .btn', box: { padding: [3, 10], justify: 'center' }, text: { size: 13 } },
  { at: '.coop-friend-acts .btn.quiet', look: { opacity: 0.7 } },
  { at: '.coop-act-slot', flex: true, box: { direction: 'row', shrink: 0 } },
  { at: '.coop-act-slot .btn', box: { width: '100%' } },
  { at: '.coop-act-slot.first', box: () => ({ width: SMALL() ? 66 : 76 }) },
  { at: '.coop-act-slot.second', box: () => ({ width: SMALL() ? 74 : 84 }) },
  { at: '.coop-invite-friends .coop-act-slot.second', box: { display: 'none' } },
  { at: '.coop-friends-empty', box: { padding: [20, 8] }, text: { color: INK_DIM, align: 'center' } },
  { at: '.coop-friends-out', flex: true, box: { margin: 'auto', maxWidth: 460, direction: 'column',
    alignItems: 'center', gap: 12 }, text: { align: 'center' } },
  { at: '.coop-friends-out p', text: { line: 1.45, color: INK_DIM } },
  { at: '.coop-friends-out b', text: { color: INK } },
];

export const COOP_ROOM: Sheet = [...ROOM, ...CARDS, ...COLOUR_DROP, ...PORTRAITS, ...FRIENDS];
