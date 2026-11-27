// The save slots screen drawn by the engine (ui/kit's sheet; #973), rule for rule from `styles/_saves.scss`: the
// title in the logo's steel, the cloud's bar under it (`cloudSheet.ts`), and the three saves side by side, each its
// heroes' records, gear, skills, attributes, stash and starting waves. The screen is `saves.ts`'s markup, written and
// bound there as before. Its box is zoomed by the lobby's scale, by 0.8 of it on an upright tablet (`--z`): the
// tree is drawn at the panes' scale (`uiScales.panes`). Not drawn: the slots' glide as the cloud moves them (Web
// Animations of the page's panes), a pane's fade where its scroll cuts it, the screen's fade in, the backdrop's blur.
import { CONTROLS, SHORT, SHORT_OR_UPRIGHT } from './controlsSheet';
import { ALLY_TEXT, CLOUD_BAR } from './cloudSheet';
import { accent } from './diagFrame';
import { diamondRule } from './pauseSheet';
import { slotFace } from './loadoutSheet';
import { FRAME, FRAME_DARK, HIGHLIGHT, INK, INK_DIM, PANEL, alpha, mix } from './kit/theme';
import { Panel, layer } from './kit/panel';
import { SheetTree, type Sheet } from './kit/sheet';
import type { TextStyle } from './overlay/paint';
import { columnOf, termsWidth, widthOf } from './savesGrid';
import { BODY } from './kit/sheetRules';
import { uiScales } from './scale';
import type { PanelLook, PanelStyle } from '../engine/ui';

/** a card on a panel (`$panel-raised`), and the hero's records' figures */
export const PANEL_RAISED = 'rgba(22,20,24,.95)';
const FIGURE = '#f3e1b0';
/** the screen's own layer: over the lobby, under the modals (its delete and cloud dialogs) and the tooltips */
const SCREEN_LAYER = 35;
/** the title's view box (900 by 120) */
const TITLE_SHAPE = 120 / 900;

/** A box `n` to a row of its parent's, square where `square`. */
function inColumns(n: () => number, gap: number, square = false) {
  return (_element: Element, round: Panel | null): PanelStyle => {
    const side = columnOf(round, n(), gap);
    return { width: side, height: square ? side : undefined, shrink: 0, grow: 0 };
  };
}

/** An element's colour from its inline `--name`, or `fallback`. */
const inline = (element: Element, name: string, fallback: string): string =>
  (element as HTMLElement).style?.getPropertyValue(name).trim() || fallback;

/** A hero's class colour (`--cc` on his card). */
const heroColour = (element: Element): string =>
  inline(element.closest('.sv-hero') ?? element, '--cc', accent());

/** a hero's rows' terms (`.svh-rows dt`) */
const TERM: TextStyle & { spacing: number; upper: boolean } = { ...BODY, size: 11, spacing: 1.2, upper: true,
  color: INK_DIM };

/** A pane's look: the panel's fill, lit at its top where it's the slot in play. */
function paneLook(element: Element): PanelLook {
  const current = element.classList.contains('current');
  const fill: PanelLook['fill'] = current ? [mix('#f0be5a', 0.1, PANEL), PANEL] : PANEL;
  return { fill, radial: current ? { y: 0, stop: 0.5 } : undefined, border: FRAME_DARK,
    shadow: { blur: 40, y: 10, color: 'rgba(0,0,0,.8)' } };
}

/** The screen, its box and its top. */
const SCREEN: Sheet = [
  ...CONTROLS,
  { at: '#saves', flex: true, hits: true, box: { position: 'absolute', inset: 0, direction: 'row', justify: 'center' },
    look: { fill: ['rgba(40,13,9,.95)', 'rgba(5,4,6,.94)'], radial: { y: 0, stop: 0.7 } } },
  { at: '.sv-box', flex: true, box: () => ({ direction: 'column', width: '100%', maxWidth: 1500, height: '100%',
    gap: SHORT() ? 8 : 12, padding: SHORT() ? [8, 14, 10, 14] : [16, 26, 20, 26] }) },
  { at: '.sv-top', flex: true, box: { position: 'relative', direction: 'column', alignItems: 'center', gap: 4,
    shrink: 0 } },
  { at: '.sv-back', box: { position: 'absolute', inset: [2, 'auto', 'auto', 0] } },
  { at: '.sv-title', flex: true, box: (_element, round) => {
    const w = Math.min(SHORT() ? 320 : 470, widthOf(round) * (SHORT() ? 0.4 : 0.56));
    return { position: 'relative', width: w, height: w * TITLE_SHAPE, shrink: 0 };
  } },
  { at: '.sv-title svg', box: { position: 'absolute', inset: 0 }, picture: (_element, round) => {
    const w = widthOf(round);
    return [w, w * TITLE_SHAPE];
  } },
  { at: '.sv-title .logo-glow', look: { opacity: 0.75 } },
  { at: '.sv-top .pb-rule', box: { width: 420, maxWidth: '80%', height: 7, margin: [-2, 0, 0, 0] },
    paint: diamondRule },
  { at: '.sv-top .pb-rule i', box: { display: 'none' } },
  { at: '.sv-intro', box: { margin: [2, 0, 0, 0], maxWidth: 760 },
    text: { size: 16, color: INK_DIM, align: 'center' } },
  { at: '.sv-top .pb-rule, .sv-intro', when: SHORT, box: { display: 'none' } },
];

/** The three panes, each a save's head, its heroes and its foot. */
const PANES: Sheet = [
  { at: '.sv-panes', flex: true, box: () => ({ direction: 'row', grow: 1, minHeight: 0, gap: SHORT() ? 10 : 18,
    alignItems: 'stretch' }) },
  { at: '.sv-pane', flex: true, box: { position: 'relative', direction: 'column', grow: 1, basis: 0, minWidth: 0,
    minHeight: 0, border: 2 }, look: paneLook, ring: alpha(FRAME, 0.6) },
  { at: '.sv-pane.current', ring: () => accent(), brackets: true },
  { at: '.sv-pane.cloud', ring: HIGHLIGHT },
  { at: '.sv-head', flex: true, box: () => ({ direction: 'row', alignItems: 'center', gap: 12, shrink: 0,
    padding: SHORT() ? [8, 12, 6, 12] : [14, 16, 8, 16] }) },
  { at: '.sv-head:has(.sv-cloud-info)', box: { alignItems: 'start', wrap: true, gap: [12, 6] } },
  {
    at: '.sv-gem',
    flex: true,
    box: () => {
      const side = SHORT() ? 38 : 48;
      return { width: side, height: side, shrink: 0, border: 2, alignItems: 'center', justify: 'center' };
    },
    look: { fill: ['#3a3430', '#0c0a0a'], radial: { y: 0.35, stop: 0.7 }, border: FRAME, radius: 24 },
    text: () => ({ face: 'display', weight: 900, size: SHORT() ? 16 : 19, color: accent(),
      shadows: [{ x: 0, y: 0, blur: 8, color: 'rgba(240,190,90,.5)' }] }),
  },
  { at: '.current .sv-gem', look: () => ({ border: accent(), shadow: { blur: 14, color: 'rgba(240,190,90,.45)' } }) },
  { at: '.sv-name', flex: true, box: { direction: 'column' },
    text: () => ({ face: 'display', weight: 700, size: SHORT() ? 20 : 24, line: 1.15, color: INK }) },
  { at: '.sv-status', text: { face: 'body', weight: 400, size: 15, line: undefined, color: INK_DIM } },
  { at: '.current .sv-status', text: { color: HIGHLIGHT } },
  { at: '.sv-totals', box: () => ({ padding: SHORT() ? [0, 12, 6, 12] : [0, 16, 10, 16] }),
    text: { size: 14, color: INK_DIM } },
  { at: '.sv-body', flex: true, scrolls: true, box: () => ({ direction: 'column', grow: 1, minHeight: 0, gap: 10,
    padding: SHORT() ? [8, 10] : [12, 14], border: [1, 0, 0, 0], overflow: 'scroll' }),
  look: { border: alpha(FRAME, 0.3) } },
  { at: '.sv-foot', flex: true, box: () => ({ direction: 'row', gap: 10, shrink: 0, border: [1, 0, 0, 0],
    padding: SHORT() ? [8, 10] : [12, 14, 14, 14] }), look: { border: alpha(FRAME, 0.3) } },
  { at: '.sv-foot .btn', when: SHORT, box: { padding: [7, 12] } },
  { at: '.sv-foot .sv-play', box: { grow: 1 } },
  { at: '.sv-del', flex: true, box: { direction: 'row', alignItems: 'center', gap: 7 } },
  { at: '.sv-del svg', picture: [19, 19] },
  { at: '.sv-del span', when: SHORT_OR_UPRIGHT, box: { display: 'none' } },
  // an empty slot
  { at: '.sv-empty', flex: true, box: { direction: 'column', grow: 1, alignItems: 'center', justify: 'center',
    gap: 12, padding: 16 }, text: { align: 'center' } },
  { at: '.sv-empty > svg', picture: [92, 92] },
  { at: '.sv-empty p', box: { margin: 0, maxWidth: 320 }, text: { size: 16, line: 1.4, color: INK_DIM } },
  { at: '.sv-empty .sv-note', text: { size: 14, color: ALLY_TEXT } },
];

/** A save's hero: his name, records, gear, skills, attributes and rows. */
const HEROES: Sheet = [
  {
    at: '.sv-hero',
    flex: true,
    box: { position: 'relative', direction: 'column', gap: 8, padding: [10, 12, 12, 14], border: 1, shrink: 0 },
    look: { fill: PANEL_RAISED, border: alpha(FRAME, 0.4) },
    // (its left border in its class's colour, 3 px over the 1 of the rest)
    marks: [{ inset: [-1, 'auto', -1, -1], bar: { width: 3, fill: heroColour } }],
  },
  { at: '.svh-top', flex: true, box: { direction: 'row', alignItems: 'end', justify: 'between', gap: 8 } },
  { at: '.svh-name', text: (element) => ({ face: 'display', weight: 700, size: 21, color: heroColour(element),
    shadows: [{ x: 0, y: 0, blur: 10, color: alpha(heroColour(element), 0.35) }] }) },
  { at: '.svh-when', text: { size: 13, color: INK_DIM, whole: true } },
  { at: '.svh-recs', flex: true, box: { direction: 'row', wrap: true, gap: 6 } },
  {
    at: '.svh-recs div',
    flex: true,
    box: (element, round) => ({ direction: 'column', alignItems: 'center', gap: 1, padding: [5, 2], border: 1,
      ...inColumns(() => (SHORT_OR_UPRIGHT() ? 2 : 4), 6)(element, round) }),
    look: { fill: ['rgba(40,32,22,.55)', 'rgba(12,10,12,.8)'], border: alpha(FRAME, 0.3) },
    text: { size: 10, spacing: 1, upper: true, color: INK_DIM, align: 'center' },
  },
  { at: '.svh-recs b', text: { face: 'display', weight: 700, size: 18, line: 1.15, spacing: 0, upper: false,
    whole: true, color: FIGURE } },
  { at: '.svh-gear, .svh-skills', flex: true, box: { direction: 'row', wrap: true, gap: 5 } },
  {
    at: '.svh-item',
    flex: true,
    box: (element, round) => ({ padding: 3, border: 1, alignItems: 'center', justify: 'center',
      ...inColumns(() => 7, 5, true)(element, round) }),
    look: (element) => ({ fill: [mix(inline(element, '--c', '#555'), 0.22, '#151315'), '#080708'],
      radial: { y: 0.45, stop: 0.78 }, border: '#000000' }),
    ring: (element) => inline(element, '--c', alpha(FRAME, 0.35)),
  },
  { at: '.svh-item.empty', look: { fill: ['#151315', '#070607'], radial: { y: 0.5, stop: 0.75 } } },
  { at: '.svh-item .item-icon', picture: (_element, round) => {
    const side = Math.max(1, widthOf(round) - 8);
    return [side, side];
  } },
  // (a placeholder's faintness is its own opacity, which its picture takes from the page's style: `svgArt`)
  {
    at: '.svh-skills .slot',
    flex: true,
    box: (element, round) => ({ border: 1, overflow: 'hidden', alignItems: 'center', justify: 'center',
      ...inColumns(() => 7, 5, true)(element, round) }),
    look: { border: '#000000', radius: 3 },
    ring: alpha(FRAME, 0.7),
    paint: slotFace,
  },
  { at: '.svh-skills .slot :is(.icon, .cd, .cdt)', box: { display: 'none' } },
  { at: '.svh-skills .slot .key', box: { position: 'absolute', inset: ['auto', 2, 0, 'auto'] },
    text: { size: 9, weight: 700, color: '#ffffff', shadows: [{ x: 0, y: 0, blur: 3, color: '#000000' }] } },
  { at: '.svh-cap', box: { margin: [-3, 0, 0, 0] }, text: { size: 13, color: INK_DIM } },
  { at: '.svh-cap b', text: { weight: 500, color: INK } },
  { at: '.svh-attrs', flex: true, box: { direction: 'row', wrap: true, gap: [14, 2] }, text: { size: 13 } },
  { at: '.svh-attrs div', flex: true, box: (element, round) => ({ direction: 'row', justify: 'between', gap: 6,
    ...inColumns(() => (SHORT_OR_UPRIGHT() ? 1 : 2), 14)(element, round) }), text: { color: INK_DIM, whole: true } },
  { at: '.svh-attrs span', box: { minWidth: 0, overflow: 'hidden' } },
  { at: '.svh-attrs b', text: { weight: 500, color: INK } },
  // the rows: each term beside what it is, the terms' column as wide as the widest
  { at: '.svh-rows', flex: true, box: { direction: 'row', wrap: true, gap: [12, 4], margin: 0 },
    text: { size: 14, line: 1.35 } },
  { at: '.svh-rows dt', box: (element) => ({ width: termsWidth(element.parentElement, TERM), shrink: 0,
    padding: [2, 0, 0, 0] }), text: { size: 11, spacing: 1.2, upper: true, color: INK_DIM } },
  { at: '.svh-rows dd', box: (element, round) => ({ margin: 0, shrink: 0,
    width: Math.max(0, widthOf(round) - termsWidth(element.parentElement, TERM) - 12 - 0.01) }) },
  { at: '.svh-rows .nw', text: { whole: true } },
  { at: '.svh-rows .svh-stash', flex: true, box: { direction: 'row', wrap: true, gap: [10, 0] } },
  { at: '.svh-rows .chip', text: (element) => ({ size: 13, color: (element as HTMLElement).style.color || INK }) },
  // a hero not played in this slot
  { at: '.sv-hero.unplayed', box: { direction: 'row', alignItems: 'end', justify: 'between' },
    look: { opacity: 0.55 } },
  { at: '.sv-hero.unplayed .svh-name', text: { size: 18 } },
];

const SHEET: Sheet = [...SCREEN, ...CLOUD_BAR, ...PANES, ...HEROES];

let tree: SheetTree | null = null;

/** The save slots screen drawn by the engine from now on, its page element out of sight. */
export function drawSaves(): void {
  if (tree) return;
  const page = document.getElementById('saves');
  if (!page) return;
  page.classList.add('kit-mirror');
  const room = new Panel(layer(SCREEN_LAYER), { position: 'absolute', inset: 0 }, {}, 'panes');
  tree = new SheetTree(page, SHEET, 'panes', room);
}
