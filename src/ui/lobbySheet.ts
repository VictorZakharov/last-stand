// The lobby's panels as the kit's sheet takes them (#973: `styles/_lobby.scss` and `_responsive.scss`, rule for rule):
// how `#menu` lays out its panels (the key bar's column and the inventory against the screen's right edge, a short
// screen's rail and its one panel at a time, an upright tablet's), the rail, the inventory's frame and tabs, and the
// attributes. The equipment and the stash are `stashSheet.ts`, the key bar and the spellbook `loadoutSheet.ts`. Sizes
// are px of the lobby's scale (`#menu .panel`'s `zoom: var(--ui)`); `#menu`'s own gaps and padding are css px.
import { framed, mediaQuery, SHORT_OR_UPRIGHT } from './controlsSheet';
import { accent } from './diagFrame';
import { safeInsets } from './kit/safeArea';
import { FRAME, INK, INK_DIM, WELL, WELL_LIT, alpha } from './kit/theme';
import { uiScales } from './scale';
import type { Sheet } from './kit/sheet';

/** CSS's `(orientation: portrait) and (max-width: 1000px) and (min-height: 521px)`: an upright tablet */
export const UPRIGHT = mediaQuery('(orientation: portrait) and (max-width: 1000px) and (min-height: 521px)');
/** a phone held sideways, one panel beside the rail (`SHORT_OR_UPRIGHT` but not upright) */
export const SIDEWAYS = (): boolean => SHORT_OR_UPRIGHT() && !UPRIGHT();

/** css px as px of the lobby's scale */
export const css = (px: number): number => px / uiScales.ui;

/** the inventory's width (px), and its padding and frame across */
export const RIGHT = { width: 290, across: 14 * 2 + 2 * 2 };
/** the rail's width (px): its buttons and its padding and frame */
const RAIL = 64 + 6 * 2 + 2 * 2;
/** `#menu`'s padding on a short screen (css px) */
const PAD = 8;

/** `#menu`'s padding on a short screen, the screen's safe area at its sides (px) */
function shortPadding(): [number, number, number, number] {
  const safe = safeInsets();
  return [css(PAD), css(PAD + safe.right), css(PAD), css(PAD + safe.left)];
}

/** How wide the inventory's room is on a phone held sideways (px): the screen less the rail, the gaps, its frame. */
export function sidewaysRoom(): number {
  const [, right, , left] = shortPadding();
  return innerWidth / uiScales.ui - left - right - RAIL - css(PAD) - RIGHT.across;
}

/** a row of tabs over its pages (`.tabs`, `.tab`: the inventory's, the pause menu's) */
export const TABS: Sheet = [
  { at: '.tabs', flex: true, box: { direction: 'row', gap: 4, border: [0, 0, 1, 0], margin: [0, 0, 10, 0] },
    look: { border: alpha(FRAME, 0.45) } },
  {
    at: '.tab',
    box: { grow: 1, basis: 0, padding: [8, 6], border: [1, 1, 0, 1] },
    look: { fill: WELL, border: alpha(FRAME, 0.35), radius: [3, 3, 0, 0] },
    text: { face: 'display', size: 13, weight: 700, spacing: 0.5, color: INK_DIM, whole: true, align: 'center' },
    hover: { text: { color: INK } },
  },
  { at: '.tab.active', look: { fill: WELL_LIT }, text: () => ({ color: accent() }),
    hover: { text: { color: accent() } } },
];

export const LOBBY: Sheet = [
  {
    at: '#menu',
    flex: true,
    box: () => ({ position: 'absolute', inset: 0, direction: 'row', alignItems: 'stretch', gap: css(16), padding: 0 }),
  },
  { at: '#menu.ahead', look: { opacity: 0.004 } },
  // (the crest stays on the page: its letters are the loading screen's logo gathered into it, `logoWind.ts`; the card
  // is `villageCardPanel.ts`'s)
  { at: '.menu-crest, #vcard', apart: true },
  { at: '#menu .panel', hits: true, ease: 0.35 },
  { at: '#menu.ahead .panel', hits: false },
  { at: '#menu.stowed .panel', hits: false, look: { opacity: 0 } },
  { at: '#menu.stowed .menu-right', shift: [24, 0] },
  { at: '#menu.stowed #loadout', shift: [0, 24] },
  { at: '.menu-center', flex: true,
    box: { direction: 'column', justify: 'end', alignItems: 'center', minWidth: 0, grow: 1, basis: 0 } },
  // the inventory: the full height against the screen's edge, in the full-screen menus' ornamented frame
  {
    at: '.menu-right',
    flex: true,
    ...framed('rgba(8,7,9,.89)'),
    box: { direction: 'column', width: RIGHT.width, padding: [12, 14, 14, 14], border: 2 },
    brackets: true,
  },
  ...TABS,
  { at: '.tab-page', flex: true, box: { direction: 'column', minHeight: 0, grow: 1 } },
  { at: '.tab-page.off', box: { display: 'none' } },
  { at: '.tab-page[data-page="attrs"]', scrolls: true, box: { overflow: 'scroll' } },
  { at: '.tab-page .panel-title', box: { margin: [12, 0, 8, 0] } },
  // the attributes
  { at: '#stats', flex: true, box: { direction: 'column', gap: 2 }, text: { size: 15 } },
  { at: '#stats .grp', box: { margin: [12, 0, 4, 0], padding: [0, 0, 3, 0], border: [0, 0, 1, 0] },
    look: { border: alpha(FRAME, 0.3) }, text: () => ({ face: 'display', size: 14, color: accent() }) },
  { at: '#stats .grp:first-child', box: { margin: [0, 0, 4, 0] } },
  { at: '#stats div.row', flex: true, box: { direction: 'row', justify: 'between', padding: [3, 4] },
    text: { color: INK_DIM } },
  { at: '#stats div.row:nth-child(odd)', look: { fill: 'rgba(255,255,255,.025)' } },
  { at: '#stats div.row[data-attr]', hover: { look: { fill: 'rgba(240,200,96,.08)' }, text: { color: INK } } },
  { at: '#stats b', text: { color: INK, weight: 500 } },
  // the rail: a short screen's or an upright tablet's, picking the one panel shown
  { at: '#lobby-rail', box: { display: 'none' } },
  // a short screen and an upright tablet: the rail, then the one panel picked
  { at: '#menu', when: SHORT_OR_UPRIGHT, box: () => ({ gap: css(PAD), padding: shortPadding() }) },
  { at: '#lobby-rail', when: SHORT_OR_UPRIGHT, flex: true,
    box: { display: 'flex', direction: 'column', gap: 6, padding: [8, 6] } },
  {
    at: '#lobby-rail button',
    when: SHORT_OR_UPRIGHT,
    box: { width: 64, padding: [7, 4], border: 1 },
    look: { fill: WELL, border: alpha(FRAME, 0.35), radius: 4 },
    text: { face: 'display', size: 12, color: INK_DIM, align: 'center' },
  },
  { at: '#lobby-rail button .ri', text: { size: 22, line: 1, block: true } },
  { at: '#lobby-rail button.active', when: SHORT_OR_UPRIGHT, look: { fill: WELL_LIT, border: alpha(FRAME, 0.6) },
    text: () => ({ color: accent() }) },
  { at: '#lobby-rail button:disabled', look: { opacity: 0.45 } },
  { at: '#rail-close', when: SHORT_OR_UPRIGHT, box: { margin: ['auto', 0, 0, 0] } },
  { at: '#menu .menu-right, #menu .menu-center', when: SHORT_OR_UPRIGHT,
    box: { display: 'none', grow: 0, basis: 'auto', minHeight: 0 } },
  { at: '#menu[data-tab="skills"] .menu-center', when: SHORT_OR_UPRIGHT, box: { display: 'flex' } },
  { at: '#menu[data-tab="gear"] .menu-right', when: SHORT_OR_UPRIGHT, box: { display: 'flex', width: 'auto' } },
  { at: '.menu-center', when: SHORT_OR_UPRIGHT, box: { justify: 'start' } },
  // an upright tablet: the panel across the width, its equipment above its stash
  { at: '#menu', when: UPRIGHT, box: { alignItems: 'start' } },
  { at: '#menu .menu-right, #menu .menu-center', when: UPRIGHT,
    box: () => ({ maxHeight: innerHeight / uiScales.ui - 40, grow: 1, basis: 0 }) },
  { at: '.menu-center', when: UPRIGHT, box: { alignItems: 'stretch' } },
];
