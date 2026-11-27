// The lobby's equipment and stash as the kit's sheet takes them (#973: `styles/_lobby.scss`, `_items.scss` and
// `_responsive.scss`, rule for rule): the paper doll and its slots, the stash's head, its chips and its stat filter
// (lifted over the doll, as its `z-index` laid it), the stash's items, and the slot focus's light. Sizes are px of the
// lobby's scale. What the kit doesn't draw of it: the stash's fade where a row is cut, the glow's chasing arc and its
// sheen (motion alone), an item's glow beyond its border, and a picture's filters (an item's hover brightness, the
// filter's grey): its fill and border are lit in their place.
import { SHORT_OR_UPRIGHT } from './controlsSheet';
import { accent } from './diagFrame';
import { SIDEWAYS, sidewaysRoom } from './lobbySheet';
import { DANGER, FRAME, HIGHLIGHT, INK, INK_DIM, WELL_LIT, alpha, mix } from './kit/theme';
import { uiScales } from './scale';
import type { Panel } from './kit/panel';
import type { Rule, Sheet } from './kit/sheet';
import type { PanelLook, PanelStyle } from '../engine/ui';

/** a slot's side and the doll's grid's gaps (px: `repeat(3, 64px)`, `gap: 8px 14px`) */
const SLOT = 64;
const APART = { across: 14, down: 8 };
/** the doll's grid, three slots by three */
const EQUIP = { w: SLOT * 3 + APART.across * 2, h: SLOT * 3 + APART.down * 2 };
/** the silhouette: 16 px taller than the grid, as wide as its view box makes it */
const DOLL_H = EQUIP.h + 16;
const DOLL_W = (DOLL_H * 240) / 340;
/** where each slot stands in the doll's grid: its row and column */
const PLACES: Record<string, [number, number]> = {
  amulet: [0, 0], head: [0, 1], ring: [0, 2], weapon: [1, 0], chest: [1, 1], offhand: [1, 2], hands: [2, 1],
};
/** the stash's padding (px), the gap between its items, and how many to a row */
const STASH_PAD = 9;
const STASH_GAP = 4;
const perRow = (): number => (SHORT_OR_UPRIGHT() ? 10 : 5);
/** what an item's share is held under its row's width by (px) */
const ROUNDING = 0.01;
/** a short screen's stash column (`minmax(360px, 600px)`), and the room the doll takes beside it */
const COLUMN = { least: 360, most: 600, doll: EQUIP.w + 18 };

/** An item's colour, as the page writes it (`--c`), or `fallback`. */
const colourOf = (element: Element, fallback = '#555'): string =>
  (element as HTMLElement).style.getPropertyValue('--c').trim() || fallback;

/** A panel's width in px of the lobby's scale, as drawn (0 till it's laid out). */
const widthOf = (panel: Panel | null): number => (panel?.rect()?.w ?? 0) / uiScales.ui;

/** A stash item's side: the stash's width shared out among a row's items (`repeat(5, 1fr)`). */
function itemSide(stash: Panel | null): number {
  const room = widthOf(stash) - STASH_PAD * 2;
  // (a hair under the share: a row that fills its width exactly wrapped its last item by a fraction of a px)
  return Math.max(0, (room - STASH_GAP * (perRow() - 1)) / perRow() - ROUNDING);
}

/** The stash's column on a phone held sideways: the room beside the doll, held to its least and most. */
const column = (): number => Math.min(COLUMN.most, Math.max(COLUMN.least, sidewaysRoom() - COLUMN.doll));

/** Where the doll's grid starts across its box (px): centred in it, as `justify-content: center` stands it. */
const gridLeft = (equip: Panel | null): number => Math.max(0, (widthOf(equip) - EQUIP.w) / 2);

/** An equipment slot's place in the doll's grid, in `equip`. */
function slotBox(element: Element, equip: Panel | null): PanelStyle {
  const [row, col] = PLACES[(element as HTMLElement).dataset.slot ?? ''] ?? [0, 0];
  const left = gridLeft(equip) + col * (SLOT + APART.across);
  return { position: 'absolute', inset: [row * (SLOT + APART.down), 'auto', 'auto', left],
    width: SLOT, height: SLOT, border: 1, alignItems: 'center', justify: 'center' };
}

/** An equipment slot's look: its fill lit by its item's colour, the item's colour round it. */
function slotLook(element: Element): PanelLook {
  const empty = element.classList.contains('empty');
  const inner = empty ? 'rgba(28,26,28,.6)' : mix(colourOf(element, '#666'), 0.18, '#1c1a1c', 0.55);
  return { fill: [inner, 'rgba(10,9,10,.5)'], radial: { y: empty ? 0.5 : 0.42, stop: 1 }, border: '#000' };
}

/** the slot focus's light (`.glow-steady`, `.glow-bright`): their rings, the bright one pulsing over the steady */
const GLOW: Rule[] = [
  { at: '.slot-glow', box: { display: 'none' } },
  { at: ':is(.match, .focal) > .slot-glow', box: { display: 'flex', position: 'absolute', inset: -3 } },
  { at: '.glow-steady, .glow-bright', box: { position: 'absolute', inset: 0, border: 2 } },
  { at: '.glow-steady', look: { border: 'rgba(255,255,130,.75)' } },
  { at: '.glow-bright', look: { border: 'rgba(255,255,255,.8)', opacity: 0 } },
  { at: '.focal > .slot-glow .glow-bright', pulse: { period: 1.3, from: 0, to: 1 } },
  { at: '.sitem:not(.focal) > .slot-glow .glow-bright', look: { opacity: 0.5 } },
  { at: '.glow-arc, .glow-sheen', box: { display: 'none' } },
];

export const STASH: Sheet = [
  // the paper doll: its slots round the class's silhouette
  // (as wide as the panel, as the page's grid is, its slots centred in it)
  { at: '#equip', flex: true, box: { height: EQUIP.h, minWidth: EQUIP.w, shrink: 0 } },
  { at: '#equip .doll', box: (_element, equip) => ({ position: 'absolute', width: DOLL_W, height: DOLL_H,
    inset: [-8, 'auto', 'auto', gridLeft(equip) + (EQUIP.w - DOLL_W) / 2] }),
    picture: [DOLL_W, DOLL_H] },
  { at: '.eslot', flex: true, box: slotBox, look: slotLook,
    ring: (element) => (element.classList.contains('empty') ? alpha(FRAME, 0.5) : colourOf(element, '#666')),
    hover: { lit: 1.5 } },
  { at: '.eslot .item-icon', picture: [46, 46] },
  // (a placeholder's faintness is its own opacity, which its picture takes from the page's style: `svgArt`)
  { at: '.eslot .slot-lock', box: { position: 'absolute', inset: ['50%', 'auto', 'auto', '50%'],
    margin: [-12, 0, 0, -12] }, picture: [24, 24] },
  { at: '.eslot.droppable', look: { border: HIGHLIGHT }, ring: HIGHLIGHT },
  { at: '.eslot.over', look: { border: '#fff6d8' }, ring: '#fff6d8' },
  { at: '#menu.slot-focus .eslot:not(.match)', look: { opacity: 0.45 } },
  // the stash's head: its count, the chosen stats' chips, the filter's button
  { at: '.stash-head', flex: true, box: { direction: 'row', alignItems: 'center', gap: 8 } },
  { at: '.stash-head > span:first-child', text: { whole: true } },
  { at: '#stash-chips', flex: true, box: { direction: 'row', gap: 4, grow: 1, minWidth: 0, overflow: 'hidden' } },
  {
    at: '.sf-chip',
    flex: true,
    box: { direction: 'row', alignItems: 'center', gap: 5, minWidth: 0, padding: [1, 6, 1, 9], border: 1 },
    look: { fill: WELL_LIT, border: alpha('#e2c07e', 0.55), radius: 11 },
    text: { face: 'body', size: 13, color: '#f3e1b0' },
    hover: { look: { border: HIGHLIGHT } },
  },
  { at: '.sf-chip .l', box: { minWidth: 0, overflow: 'hidden' }, text: { whole: true } },
  { at: '.sf-chip .x', text: { size: 15, line: 1, color: INK_DIM } },
  { at: '.sf-chip:hover .x', text: { color: DANGER } },
  { at: '.sf-chip.more', box: { shrink: 0, padding: [1, 9] }, text: () => ({ color: accent() }) },
  { at: '#stash-filter-btn', box: { width: 26, height: 26, padding: 3, border: 1, shrink: 0, alignSelf: 'start' },
    look: { border: 'rgba(0,0,0,0)', radius: 3 }, text: { color: INK_DIM },
    hover: { look: { border: alpha(FRAME, 0.5), fill: 'rgba(240,200,96,.06)' } } },
  { at: '#stash-filter-btn[aria-expanded="true"]', look: { border: alpha(FRAME, 0.5), fill: 'rgba(240,200,96,.06)' } },
  { at: '#stash-filter-btn svg', picture: [18, 18] },
  // the filter: over the doll, its groups' names heading their rows of options
  {
    at: '#stash-filter',
    flex: true,
    lift: true,
    box: { position: 'absolute', inset: ['auto', 0, '100%', 'auto'], margin: [0, 0, 6, 0], width: 500,
      padding: [8, 12, 10, 12], border: 1, direction: 'row', wrap: true, gap: [10, 5], alignItems: 'start' },
    look: { fill: '#161418', border: alpha(FRAME, 0.6), shadow: { blur: 30, y: 10, color: 'rgba(0,0,0,.85)' } },
    text: { face: 'body', size: 14, color: INK },
  },
  { at: '#stash-filter', when: SIDEWAYS, box: { inset: ['100%', 0, 'auto', 'auto'], margin: [6, 0, 0, 0],
    width: '100%' } },
  { at: '#stash-filter', when: SHORT_OR_UPRIGHT, box: { width: '100%' } },
  { at: '.sf-top', flex: true, box: { direction: 'row', justify: 'between', alignItems: 'baseline', basis: '100%' },
    text: () => ({ face: 'display', size: 15, color: accent() }) },
  { at: '.sf-top .link', box: { padding: 0 }, text: { size: 13 } },
  { at: '.sf-grp', box: { width: 76, padding: [5, 0, 0, 0] },
    text: { size: 10, spacing: 1.2, upper: true, color: INK_DIM } },
  { at: '.sf-opts', flex: true, box: { direction: 'row', wrap: true, gap: 4, basis: '75%', grow: 1, minWidth: 0 } },
  {
    at: '.sf-opt',
    box: (_element, round) => ({ width: (widthOf(round) - 8) / 3, padding: [3, 5, 3, 20], border: 1,
      overflow: 'hidden', justify: 'start' }),
    look: { fill: 'rgba(255,255,255,.03)', border: alpha(FRAME, 0.3), radius: 3 },
    text: { face: 'body', size: 13, color: INK_DIM, whole: true },
    hover: { text: { color: INK }, look: { border: alpha(FRAME, 0.7) } },
  },
  { at: '.sf-opt[aria-pressed="true"]', look: { fill: WELL_LIT, border: HIGHLIGHT }, text: { color: '#f3e1b0' },
    marks: [{ inset: ['50%', 'auto', 'auto', 7], says: '✓', text: { size: 11, color: HIGHLIGHT, line: 0 } }] },
  { at: '.sf-note', box: { basis: '100%' }, text: { size: 12, line: 1.3, color: INK_DIM } },
  // the stash: five to a row (ten on a short screen), scrolling where they don't all fit
  {
    at: '#stash',
    flex: true,
    scrolls: true,
    box: { direction: 'row', wrap: true, gap: STASH_GAP, alignContent: 'start', grow: 1, basis: 'auto', minHeight: 0,
      overflow: 'scroll', padding: STASH_PAD, margin: [-STASH_PAD, -STASH_PAD, 4, -STASH_PAD] },
  },
  { at: '#stash.droppable', ring: alpha(HIGHLIGHT, 0.6) },
  {
    at: '.sitem',
    flex: true,
    box: (_element, round) => {
      const side = itemSide(round);
      return { width: side, height: side, padding: 3, border: 1, alignItems: 'center', justify: 'center' };
    },
    look: (element) => ({ fill: [mix(colourOf(element), 0.22, '#151315'), '#080708'], radial: { y: 0.45, stop: 0.78 },
      border: '#000' }),
    ring: (element) => colourOf(element),
    hover: { lit: 1.35 },
  },
  { at: '.sitem .item-icon', picture: (_element, round) => {
    const side = Math.max(1, widthOf(round) - 8);
    return [side, side];
  } },
  { at: '.sitem.new', marks: [{ inset: [3, 3, 'auto', 'auto'], dot: { side: 6, fill: HIGHLIGHT } }] },
  { at: '.sitem.up', marks: [{ inset: ['auto', 'auto', 0, 2], says: '▲', text: { size: 9, color: '#4cff6a' } }] },
  { at: '.sitem.filtered', look: { opacity: 0.3 } },
  { at: '.sitem.filtered', hover: { look: { opacity: 0.75 } } },
  { at: '#menu.discard .sitem[draggable="true"]', hover: { ring: DANGER } },
  { at: '#menu.slot-focus .sitem:not(.match)', look: { opacity: 0.28 } },
  { at: '.sitem.focal, #menu.slot-focus .sitem.match', look: { opacity: 1 } },
  ...GLOW,
  // the inventory by I: the hero's own, no stash
  { at: '#menu[data-open="inventory"] :is(.stash-head, #stash)', box: { display: 'none' } },
  // a phone held sideways: the doll beside the stash's column
  { at: '.menu-right .tab-page[data-page="gear"]', when: SIDEWAYS,
    box: () => ({ padding: [0, 0, 0, COLUMN.doll], width: COLUMN.doll + column() }) },
  { at: '.menu-right #equip', when: SIDEWAYS, box: { position: 'absolute', inset: [18, 'auto', 'auto', 0] } },
  { at: '.menu-right .stash-head', when: SIDEWAYS, box: { margin: [0, 0, 8, 0] } },
];
