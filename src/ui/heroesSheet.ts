// The hero selection screen drawn by the engine (ui/kit's sheet; #973), rule for rule from `styles/_heroes.scss`: the
// shade over the hall (`heroesPaint.ts`), the title and the save slot, the arrows, the heroes' names with their
// numbers, Back, and the panel at the right (along the foot on an upright screen): its tabs, the hero's card, his
// look, his gear and his attributes (the lobby's rules for those: `stashSheet.ts`, `lobbySheet.ts`'s `STATS`). The
// screen is `heroSelect.ts`'s markup, written and bound there as before; its backdrop takes the pointer's events as
// the page's did (`kit/forward.ts`: the drag along the row, a hero lit and tapped), and the choice on the hero stays
// on the page, moved by its transform every frame. Sizes are px of the lobby's scale. Not drawn: the card's fade in,
// the arrows' glow and hover colour, the slot's dotted underline, the own hair's dashed ring.
import { CONTROLS, SHORT, TOUCH, mediaQuery } from './controlsSheet';
import { accent } from './diagFrame';
import { brackets, headLine, heroColour, KEY_DARK, pip, rhombus, shade } from './heroesPaint';
import { STATS, TABS, css } from './lobbySheet';
import { STASH } from './stashSheet';
import { slotFace } from './loadoutSheet';
import { FRAME, HIGHLIGHT, INK, INK_DIM, alpha } from './kit/theme';
import { layer, Panel } from './kit/panel';
import { safeInsets } from './kit/safeArea';
import { SheetTree, type Sheet } from './kit/sheet';
import { OUTLINE, type TextStyle } from './overlay/paint';
import { wrapText, wrappedHeight } from './kit/wrap';
import { columnOf, termsWidth, widthOf } from './savesGrid';
import { uiScales } from './scale';
import type { PanelStyle } from '../engine/ui';

/** the screen's layer: over the lobby, under the save slots it opens and the modals (`#heroes`' `z-index: 30`) */
const SCREEN_LAYER = 30;
/** an upright screen (`@media (orientation: portrait)`) */
const UPRIGHT = mediaQuery('(orientation: portrait)');
const SHORT_OR_UPRIGHT = (): boolean => SHORT() || UPRIGHT();
/** the records' figures */
const FIGURE = '#f3e1b0';
/** a raised card's fill (`linear-gradient(135deg, …)`, top to bottom here) */
const RAISED: [string, string] = ['rgba(40,32,22,.55)', 'rgba(12,10,12,.8)'];

/** the room round the screen's edges (`--gut`) and the panel's width (`--pw`) */
const gut = (): number => (SHORT() ? 12 : 22);
const panelWidth = (): number => (SHORT() ? 380 : 430);
/** an upright screen's panel's height (`--ph: 44%`) */
const panelHeight = (): number => (0.44 * innerHeight) / uiScales.ui;
/** a share of the window's width, px (`vw`) */
const vw = (percent: number): number => (innerWidth * percent) / 100 / uiScales.ui;
/** the screen's safe area (px) */
function safe(): { top: number; right: number; bottom: number; left: number } {
  const insets = safeInsets();
  return { top: css(insets.top), right: css(insets.right), bottom: css(insets.bottom), left: css(insets.left) };
}
/** the room the panel leaves at the right (`calc(var(--pw) + var(--gut) * 2)`), less the safe area */
const besidePanel = (): number => (UPRIGHT() ? gut() : panelWidth() + gut() * 2) + safe().right;
/** the arrows' top: beside the hero's middle (`top: 50%; translate: 0 -50%`), above an upright panel */
const arrowTop = (): number => (innerHeight / uiScales.ui - (UPRIGHT() ? panelHeight() : 0)) / 2 - 48;
/** a name's rhombus's side (`--ks`) */
function keySide(): number {
  if (TOUCH()) return 14;
  return Math.max(SHORT() ? 26 : 32, css(24));
}

/** A box `n` to a row of its parent's, square where `square`. */
function inColumns(n: number, gap: number, square = false) {
  return (_element: Element, round: Panel | null): PanelStyle => {
    const side = columnOf(round, n, gap);
    return { width: side, height: square ? side : undefined, shrink: 0, grow: 0 };
  };
}

/** a section's head (`section-head`), and a trait's term */
const HEAD: TextStyle = { face: 'display', size: 12, weight: 700, spacing: 3, upper: true, color: INK };
const TERM: TextStyle = { face: 'display', size: 12, weight: 700, spacing: 2, upper: true, color: INK_DIM };
/** the padding and line under a tagline that follows the role (px) */
const TAG_UNDER = 10 + 1;
/** a card's tagline */
const tagStyle = (): TextStyle => ({ face: 'body', size: SHORT() ? 15 : 17, italic: true, line: 1.35, color: INK });

/** A tagline's height: the tallest of every card's at this width, so each card's rows stand where the others' do
 *  (the page's cards share their rows' heights, a subgrid). */
function tagHeight(element: Element, round: Panel | null): number {
  const width = widthOf(round);
  const cards = element.closest('.hs-cards');
  if (!cards || width <= 0) return 0;
  const tags = [...cards.querySelectorAll('.hs-tag')];
  const words = Math.max(...tags.map((tag) => wrappedHeight(wrapText(tag.textContent ?? '', tagStyle(), width,
    'center'))));
  // (the least height is the box's whole: its rule under the role adds its padding and line)
  return words + (element.matches('.hs-role + .hs-tag') ? TAG_UNDER : 0);
}

/** the skills' gap and how many to a row */
const skillsGap = (): number => (SHORT() ? 4 : 7);
const skillsInRow = (): number => (SHORT() ? 9 : 5);

/** The skills' height: the most rows any card's take, at the side of this one's (`width` across). */
function skillsHeight(element: Element, width: number): number {
  const cards = element.closest('.hs-cards');
  const counts = [...(cards?.querySelectorAll('.hs-skills') ?? [])].map((skills) => skills.children.length);
  const rows = Math.ceil(Math.max(0, ...counts) / skillsInRow());
  const side = (width - skillsGap() * (skillsInRow() - 1)) / skillsInRow();
  return rows > 0 ? rows * side + (rows - 1) * skillsGap() : 0;
}

/** The shade over the hall, its glow where the hero stands in the room the panel leaves. */
function shadeOver(): ReturnType<typeof shade> {
  const w = innerWidth / uiScales.ui;
  const across = UPRIGHT() ? w / 2 : (w - panelWidth() - gut() * 2) / 2;
  return shade(w, innerHeight / uiScales.ui, across);
}

/** The room round the hero: the shade, the title, the arrows, the heroes' names, Back. */
const ROOM: Sheet = [
  ...CONTROLS,
  { at: '#heroes', box: { position: 'absolute', inset: 0 } },
  { at: '.hs-choose', apart: true },
  // (the room takes no pointer but at its controls, as the page's `pointer-events` had it: the backdrop's beneath)
  { at: '.hs-slot, .hs-arrow, .hs-tabs button, .hs-back', hits: true },
  { at: '.hs-shade', hits: true, box: () => ({ position: 'absolute', inset: [0, 'auto', 'auto', 0],
    width: innerWidth / uiScales.ui, height: innerHeight / uiScales.ui }), paint: shadeOver },
  // the title, and the save slot under it
  { at: '.hs-top', flex: true, box: () => ({ position: 'absolute', direction: 'row', alignItems: 'center', gap: 18,
    inset: [gut() * 0.7 + safe().top, 'auto', 'auto', gut() + safe().left] }) },
  { at: '.hs-heading', flex: true, box: { direction: 'column', gap: 3 } },
  { at: '.hs-title', text: () => ({ face: 'display', weight: 700, size: SHORT_OR_UPRIGHT() ? 19 : 26,
    spacing: SHORT_OR_UPRIGHT() ? 3 : 5, upper: true, color: accent(), whole: true,
    shadows: [{ x: 0, y: 0, blur: 14, color: 'rgba(240,190,90,.35)' }, ...OUTLINE] }) },
  { at: '.hs-slot', box: { padding: 0, alignSelf: 'start' },
    text: { face: 'body', size: 15, spacing: 1, color: INK_DIM, shadows: OUTLINE, underline: true } },
  // the arrows either side of the hero
  { at: '.hs-arrow', flex: true, box: { position: 'absolute', width: 54, height: 96, padding: [18, 14] },
    look: { fill: ['rgba(0,0,0,.55)', 'rgba(0,0,0,0)'], radial: { y: 0.5, stop: 0.7 } } },
  { at: '.hs-arrow svg', picture: [26, 60] },
  { at: '.hs-prev', box: () => ({ inset: [arrowTop(), 'auto', 'auto', gut() + safe().left] }) },
  { at: '.hs-next', box: () => ({ inset: [arrowTop(), besidePanel(), 'auto', 'auto'] }) },
  // the heroes' names, each with its number in a rhombus hanging under it
  { at: '.hs-tabs', flex: true, box: () => {
    const bottom = UPRIGHT() ? panelHeight() + gut() * 1.6 + keySide() * 0.6
      : Math.max(gut() * 1.4, keySide() * 0.6 + 8);
    return { position: 'absolute', direction: 'row', justify: 'center', gap: SHORT() ? 10 : 18,
      inset: ['auto', besidePanel(), bottom + safe().bottom, gut() + safe().left] };
  } },
  { at: '.hs-tabs button', flex: true, box: () => {
    if (SHORT()) return { padding: [6, 14, 12, 14] };
    if (UPRIGHT()) return { padding: [8, 18, 14, 18] };
    const across = Math.min(24, vw(1.1));
    return { padding: [10, across, 16, across] };
  }, text: () => ({ face: 'display', weight: 700, upper: true, color: INK_DIM, shadows: OUTLINE, whole: true,
    size: SHORT() ? 17 : UPRIGHT() ? 20 : Math.min(26, vw(1.45)),
    spacing: SHORT() || UPRIGHT() ? 3 : Math.min(4, vw(0.2)) }),
  hover: { text: { color: INK } } },
  { at: '.hs-tabs button.active', text: (element) => ({ color: heroColour(element),
    shadows: [{ x: 0, y: 0, blur: 12, color: alpha(heroColour(element), 0.45) }, ...OUTLINE] }) },
  // (a hero still warming: his name's bar fills as he gets further)
  { at: '.hs-tabs button.cold', marks: (element) => {
    const share = Math.min(1, Math.max(0, Number((element as HTMLElement).style.getPropertyValue('--ready')) || 0));
    return [{ inset: ['auto', '18%', 13, '18%'], bar: { height: 3, fill: 'rgba(255,255,255,.18)' } },
      { inset: ['auto', 'auto', 13, '18%'], bar: { width: `${share * 64}%` as const, height: 3, fill: heroColour } }];
  } },
  { at: '.hs-key', box: () => {
    const side = keySide();
    return { position: 'absolute', width: side, height: side, alignItems: 'center', justify: 'center',
      inset: ['auto', 'auto', -side * 0.6, '50%'], margin: [0, 0, 0, -side / 2] };
  }, paint: (element, w) => rhombus(element, w),
  text: () => ({ face: 'display', weight: 700, size: keySide() * 0.5, line: 1, spacing: 0, color: INK_DIM,
    shadows: [] }) },
  { at: '.hs-tabs button:hover .hs-key', text: { color: INK } },
  { at: '.hs-tabs button.active .hs-key', text: { color: KEY_DARK } },
  { at: '.hs-key', when: TOUCH, says: '' },
  // Back, at the bottom left (at the top of the room on a short or upright screen), with its key
  { at: '.hs-back', flex: true, box: () => (SHORT_OR_UPRIGHT()
    ? { position: 'absolute', padding: [9, 16], inset: [gut() * 0.7 + safe().top, besidePanel(), 'auto', 'auto'] }
    : { position: 'absolute', padding: [9, 16], inset: ['auto', 'auto', gut() + safe().bottom, gut() + safe().left] }),
  text: { size: 15 } },
  { at: '#heroes.first .hs-back', box: { display: 'none' } },
  // (its words' space before it, which a box of its own trims)
  { at: '.hs-long', box: { margin: [0, 0, 0, 4] } },
  { at: '.hs-long', when: SHORT_OR_UPRIGHT, box: { display: 'none' } },
  { at: '.hs-back-key', box: { margin: [0, 0, 0, 9], padding: [1, 6], border: 1 },
    look: { border: alpha(HIGHLIGHT, 0.5), fill: alpha(HIGHLIGHT, 0.08), radius: 3 },
    text: { face: 'display', weight: 700, size: 12, line: 1.3, spacing: 0, color: INK } },
  { at: '.hs-back-key', when: TOUCH, box: { display: 'none' } },
];

/** The panel: its frame, its tabs and its pages' cell. */
const PANEL: Sheet = [
  { at: '.hs-panel', flex: true, hits: true, box: () => {
    const room = { direction: 'column' as const, gap: SHORT() ? 10 : 14,
      padding: SHORT() ? [14, 16] as [number, number] : [22, 24, 22, 24] as [number, number, number, number] };
    if (UPRIGHT()) {
      return { ...room, position: 'absolute', height: panelHeight(), width: 'auto',
        inset: ['auto', gut() + safe().right, gut(), gut() + safe().left] };
    }
    return { ...room, position: 'absolute', width: panelWidth(), inset: [gut(), gut() + safe().right, gut(), 'auto'] };
  }, look: { fill: ['rgba(8,7,9,.82)', 'rgba(8,7,9,.94)'] }, marks: brackets },
  ...TABS,
  { at: '.hs-pagetabs', box: { shrink: 0, margin: 0, gap: 4 } },
  { at: '.hs-pagetabs .tab', box: { padding: [8, 6] }, text: { size: 14, spacing: 1 } },
  { at: '.hs-pagetabs .tab.active', text: (element) => ({ color: heroColour(element) }),
    marks: [{ inset: [0, 0, 'auto', 0], bar: { height: 2, fill: heroColour } }] },
  { at: '.hs-pages', flex: true, box: { direction: 'column', grow: 1, minHeight: 0 } },
  { at: '.hs-page', flex: true, box: { direction: 'column', grow: 1, basis: 0, minHeight: 0 } },
  { at: '#heroes .hs-page.off', box: { display: 'none' } },
  { at: '.hs-gear, .hs-stats, .hs-look, .hs-cards', scrolls: true, box: { overflow: 'scroll' } },
  { at: '.hs-gear', box: { padding: [14, 0, 0, 0] } },
  { at: '.hs-stats', box: { padding: [10, 0, 0, 0] } },
  { at: '.hs-stash', flex: true, box: { direction: 'row', wrap: true, gap: 4 } },
  { at: '.hs-stash .sitem', box: (element, round) => inColumns(8, 4, true)(element, round) },
  { at: '.hs-label', flex: true, box: (_element, round) => ({ direction: 'row', alignItems: 'center',
    width: widthOf(round), height: 16, shrink: 0 }),
  text: () => ({ ...HEAD, color: accent() }), paint: headLine(HEAD) },
];

/** The hero's card: his name in the logo's steel, his role, tagline, traits, skills and records. */
const CARD: Sheet = [
  { at: '.hs-cards', box: () => ({ gap: SHORT() ? 8 : UPRIGHT() ? 10 : 12 }) },
  { at: '.hs-card', box: { display: 'none' } },
  { at: '.hs-card.active', flex: true, box: () => ({ display: 'flex', direction: UPRIGHT() ? 'row' : 'column',
    wrap: UPRIGHT(), gap: UPRIGHT() ? [22, 10] : SHORT() ? 8 : 12, grow: 1, shrink: 0, alignContent: 'start' }) },
  { at: '.hs-name', flex: true, box: (_element, round) => {
    const w = UPRIGHT() ? Math.min(widthOf(round), 420) : widthOf(round);
    return { position: 'relative', width: w, height: (w * 110) / 600, shrink: 0, alignSelf: 'center',
      margin: UPRIGHT() ? [0, (widthOf(round) - w) / 2] : 0 };
  } },
  { at: '.hs-name svg', box: { position: 'absolute', inset: 0 }, picture: (_element, round) => {
    const w = widthOf(round);
    return [w, (w * 110) / 600];
  } },
  { at: '.hs-name .logo-glow', look: { opacity: 0.75 } },
  { at: '.hs-role', box: (_element, round) => ({ margin: [-4, 0, 0, 0], width: UPRIGHT() ? widthOf(round) : undefined }),
    text: (element) => ({ face: 'display', weight: 700, size: 14, spacing: 3, upper: true, align: 'center',
      color: heroColour(element), shadows: [{ x: 0, y: 0, blur: 10, color: alpha(heroColour(element), 0.4) }] }) },
  { at: '.hs-tag', box: (element, round) => ({ margin: 0, minHeight: tagHeight(element, round),
    width: UPRIGHT() ? widthOf(round) : undefined }),
  text: () => ({ ...tagStyle(), align: 'center' }) },
  { at: '.hs-card > .hs-role + .hs-tag', box: { padding: [0, 0, 10, 0], border: [0, 0, 1, 0] },
    look: { border: alpha(FRAME, 0.3) } },
  // the traits: each term beside its five pips, the terms' column as wide as the widest
  { at: '.hs-traits', flex: true, box: (_element, round) => ({ direction: 'row', wrap: true, alignItems: 'center',
    gap: [16, 7], margin: 0, width: UPRIGHT() ? columnOf(round, 2, 22) : undefined }) },
  { at: '.hs-traits dt', box: (element) => ({ width: termsWidth(element.parentElement, TERM), shrink: 0 }),
    text: TERM },
  { at: '.hs-traits dd', flex: true, box: (element, round) => ({ direction: 'row', gap: 5, margin: 0, shrink: 0,
    width: Math.max(0, widthOf(round) - termsWidth(element.parentElement, TERM) - 16 - 0.01) }) },
  { at: '.hs-traits i', box: (_element, round) => ({ width: Math.min(44, columnOf(round, 5, 5)), height: 8,
    shrink: 0 }), paint: pip },
  { at: '.hs-card > .hs-label', when: UPRIGHT, box: { display: 'none' } },
  // the skills: five to a row (nine on a short screen), each its icon
  { at: '.hs-skills', flex: true, box: (element, round) => {
    const width = UPRIGHT() ? columnOf(round, 2, 22) : widthOf(round);
    // (its rows spread over the shared height, as the page's grid's tracks stretch, each slot at its track's top)
    const height = skillsHeight(element, width);
    const rows = Math.ceil(element.children.length / skillsInRow());
    const side = (width - skillsGap() * (skillsInRow() - 1)) / skillsInRow();
    const track = rows > 1 ? (height - (rows - 1) * skillsGap()) / rows : side;
    return { direction: 'row', wrap: true, gap: [skillsGap(), track + skillsGap() - side],
      width: UPRIGHT() ? width : undefined, alignContent: 'start', minHeight: height };
  } },
  {
    at: '.hs-skills .slot',
    flex: true,
    box: (element, round) => ({ border: 1, overflow: 'hidden', alignItems: 'center', justify: 'center',
      ...inColumns(skillsInRow(), skillsGap(), true)(element, round) }),
    look: { border: '#000000', radius: 3 },
    ring: alpha(FRAME, 0.7),
    paint: slotFace,
  },
  { at: '.hs-skills .slot :is(.icon, .cd, .cdt, .key)', box: { display: 'none' } },
  // the records, at the card's foot
  { at: '.hs-records', flex: true, box: (_element, round) => ({ direction: 'row', gap: 6, margin: ['auto', 0, 0, 0],
    width: UPRIGHT() ? widthOf(round) : undefined, shrink: 0 }) },
  { at: '.hs-records div', flex: true, box: { direction: 'column', alignItems: 'center', padding: [6, 2], border: 1,
    grow: 1, basis: 0, minWidth: 0 }, look: { fill: RAISED, border: alpha(FRAME, 0.3) },
  text: { size: 10, spacing: 1, upper: true, color: INK_DIM, align: 'center', whole: true } },
  { at: '.hs-records b', text: { face: 'display', weight: 700, size: 18, spacing: 0, upper: false, color: FIGURE,
    block: true } },
  { at: '.hs-records .hs-new', box: { padding: 8, border: 1, grow: 1 }, look: { border: alpha(FRAME, 0.35) },
    text: { size: 14, italic: true, color: INK_DIM, align: 'center' } },
];

/** The hero's look: his looks, a button each, and his hair's colours, a swatch each. */
const LOOK: Sheet = [
  { at: '.hs-look', box: () => ({ gap: SHORT() ? 8 : 12 }) },
  { at: '.hl-presets', flex: true, box: { direction: 'row', wrap: true, gap: 8, shrink: 0 } },
  { at: '.hl-preset', flex: true, box: (element, round) => ({ direction: 'column', alignItems: 'start', justify: 'start', gap: 3,
    padding: SHORT() ? [6, 9] : [9, 11], border: 1, minHeight: TOUCH() ? css(44) : undefined,
    ...inColumns(UPRIGHT() ? 4 : 2, 8)(element, round) }),
  look: { fill: RAISED, border: alpha(FRAME, 0.35) }, text: { color: INK_DIM, align: 'start' },
  hover: { look: { border: alpha(FRAME, 0.8) } } },
  { at: '.hl-preset b', text: { face: 'display', weight: 700, size: 15, spacing: 1, color: INK, block: true } },
  { at: '.hl-preset span', text: { size: 13, line: 1.3, italic: true } },
  { at: '.hl-preset span', when: SHORT, text: { size: 12 } },
  // (no glow round it: the kit's shadow lies under its see-through fill too, and tinted it)
  { at: '.hl-preset.on', look: (element) => ({ border: heroColour(element) }), ring: heroColour },
  { at: '.hl-preset.on b', text: (element) => ({ color: heroColour(element) }) },
  { at: '.hl-preset.busy span', text: (element) => ({ color: heroColour(element), italic: false }) },
  { at: '.hl-hairs', flex: true, box: { direction: 'row', wrap: true, gap: 8, shrink: 0 } },
  { at: '.hl-swatch', box: () => {
    const side = TOUCH() ? Math.max(32, css(40)) : 32;
    return { width: side, height: side, padding: 0, border: 2, shrink: 0 };
  }, look: (element) => ({ fill: (element as HTMLElement).style.getPropertyValue('--swatch').trim() || '#000',
    border: alpha(FRAME, 0.5), radius: 999 }),
  hover: { look: { border: INK } } },
  { at: '.hl-swatch[aria-checked="true"]', look: (element) => ({ border: heroColour(element),
    shadow: { blur: 0, color: heroColour(element) } }), ring: heroColour },
  { at: '.hl-note', box: { margin: 0 }, text: { size: 13, italic: true, color: INK_DIM } },
];

const SHEET: Sheet = [...ROOM, ...PANEL, ...STASH, ...STATS, ...CARD, ...LOOK];

let tree: SheetTree | null = null;

/** The hero selection screen drawn by the engine from now on, its page's parts out of sight (the choice on the hero
 *  stays on the page). */
export function drawHeroes(): void {
  if (tree) return;
  const page = document.getElementById('heroes');
  if (!page) return;
  for (const part of page.children) if (!part.classList.contains('hs-choose')) part.classList.add('kit-mirror');
  // (a room of the lobby's scale: the layer's own is the HUD's, which an upright tablet's is not)
  const room = new Panel(layer(SCREEN_LAYER), { position: 'absolute', inset: 0 }, {}, 'ui');
  tree = new SheetTree(page, SHEET, 'ui', room);
}

