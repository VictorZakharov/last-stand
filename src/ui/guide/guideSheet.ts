// The guide drawn by the engine (ui/kit's sheet; #973), rule for rule from `styles/_guide.scss`: the bound book over
// the pause menu (its leather and gilt corners), its title, the sections' tabs and Close, the entries down its spine
// beside the page (a row over it, scrolled across, on a narrow or short screen), and the page (`guidePageSheet.ts`:
// what every page has; `guideHeroSheet.ts`: a hero's skills, keys, styles, loadouts and combos). The page's `#guide`
// stays, out of sight, written by `index.ts` as before. Sizes are px of the lobby's scale.
import { TABS } from '../lobbySheet';
import { drawModal, finger, windowShare } from '../modalSheet';
import { TOUCH } from '../controlsSheet';
import { accent } from '../diagFrame';
import { CARDS } from '../tooltipPanel';
import { FRAME, HIGHLIGHT, INK, WELL_LIT, alpha } from '../kit/theme';
import { scrolledAcross } from '../kit/scroll';
import { NARROW, innerOf } from './guideRoom';
import { PAGE } from './guidePageSheet';
import { HERO_PAGE } from './guideHeroSheet';
import { portrait } from './guidePaint';
import { headLine } from '../heroesPaint';
import type { TextStyle } from '../overlay/paint';
import type { Rule, Sheet } from '../kit/sheet';

/** the list's pictures' side, wide and narrow (`.gd-mini`, `.gd-glyph`) */
const MINI = { wide: 38, narrow: 28 };
const mini = (): number => (NARROW() ? MINI.narrow : MINI.wide);

/** a group's name in the list (`.gd-group`: `section-head` at 11 px) */
const GROUP: TextStyle = { face: 'display', weight: 700, size: 11, spacing: 2, upper: true, color: INK };

/** The book: its box, its head and the body's two parts. */
const BOOK: Sheet = [
  ...TABS,
  {
    at: '#guide .gd-box',
    box: () => ({ width: 1180, height: windowShare(0.92).h, maxHeight: windowShare(0.94).h, overflow: 'hidden',
      padding: NARROW() ? [10, 14] : [16, 22], gap: NARROW() ? 8 : 10 }),
    look: { fill: ['#1e1712', '#0c0908'], radial: { y: 0.6, stop: 0.75 } },
    text: { align: 'start' },
    brackets: true,
  },
  { at: '.gd-head', flex: true, box: () => ({ direction: 'row', alignItems: 'center', gap: NARROW() ? 10 : 18 }) },
  { at: '.gd-head .sm-title', box: { shrink: 0 },
    text: () => ({ face: 'display', weight: 900, size: NARROW() ? 20 : 28, line: 1, color: accent() }) },
  { at: '.gd-sections', box: { grow: 1, margin: 0, minWidth: 0 } },
  { at: '.gd-sections .tab', box: () => ({ grow: 1, basis: 0, minWidth: 0, minHeight: TOUCH() ? finger(36) : 0 }) },
  { at: '#btn-guide-close', box: () => ({ shrink: 0, minHeight: TOUCH() ? finger(36) : 0 }) },
  { at: '.gd-body', flex: true, box: () => ({ direction: NARROW() ? 'column' : 'row', gap: NARROW() ? 8 : 18,
    grow: 1, shrink: 1, basis: 0, minHeight: 0 }) },
];

/** The entries down the spine, or in a row scrolled across. */
const ENTRIES: Sheet = [
  { at: '.gd-entries', flex: true, scrolls: true, box: { direction: 'column', gap: 2, width: 236, shrink: 0,
    minHeight: 0, overflow: 'scroll', padding: [0, 10, 0, 0], border: [0, 1, 0, 0] },
  look: { border: alpha(FRAME, 0.3) } },
  { at: '.gd-entries', when: NARROW, scrolls: 'across', box: { direction: 'row', width: 'auto', alignSelf: 'stretch',
    padding: [0, 0, 4, 0], border: 0 } },
  // (scrolled across by the first entry's margin: the engine scrolls up alone)
  { at: '.gd-entries > button:first-of-type', when: NARROW,
    box: (_element, round) => ({ margin: [0, 0, 0, -scrolledAcross(round)] }) },
  // a group's name and its line fading out after it (`section-head`)
  { at: '.gd-group', box: (_element, round) => ({ width: innerOf(round), margin: [8, 0, 4, 0] }),
    text: () => ({ ...GROUP, color: accent() }), paint: headLine(GROUP) },
  { at: '.gd-group:first-child', box: { margin: [0, 0, 4, 0] } },
  { at: '.gd-group', when: NARROW, box: { display: 'none' } },
  {
    at: '.gd-entry',
    flex: true,
    box: () => ({ direction: 'row', alignItems: 'center', justify: 'start', gap: 10, shrink: 0,
      padding: NARROW() ? [3, 8, 3, 4] : [5, 8],
      border: 1, minHeight: TOUCH() ? finger(36) : 0 }),
    look: { border: 'rgba(0,0,0,0)' },
    text: () => ({ face: 'body', size: NARROW() ? 14 : 15, color: INK, whole: NARROW() }),
    hover: { look: { border: alpha(FRAME, 0.35) } },
  },
  { at: '.gd-entry.active', look: { fill: WELL_LIT, border: alpha(FRAME, 0.7) }, text: { color: HIGHLIGHT },
    marks: () => (NARROW() ? [] : [{ inset: [0, 'auto', 0, 0], bar: { width: 3, fill: HIGHLIGHT } }]),
    hover: { look: { border: alpha(FRAME, 0.7) } } },
  { at: '.gd-mini', box: () => ({ width: mini(), height: mini(), shrink: 0 }),
    look: { radius: MINI.wide / 2 }, ring: alpha(FRAME, 0.6), paint: portrait },
  { at: '.gd-glyph', box: () => ({ width: mini(), height: mini(), shrink: 0, border: 1 }),
    look: { fill: ['#3a3430', '#0c0a0a'], radial: { y: 0.35, stop: 0.7 }, border: alpha(FRAME, 0.5),
      radius: MINI.wide / 2 },
    text: () => ({ face: 'display', weight: 900, size: NARROW() ? 14 : 18, color: accent(),
      line: (mini() - 2) / (NARROW() ? 14 : 18), align: 'center' }) },
  { at: '.gd-pic canvas', box: { display: 'none' } },
];

/** The page's box, scrolling. */
const PAGE_BOX: Rule = {
  at: '.gd-page',
  flex: true,
  scrolls: true,
  // (a hero's page is some 1,900 elements: made in steps, its top first)
  inSteps: true,
  // (laid out as the page's blocks are, their margins collapsed)
  blocks: true,
  box: () => ({ direction: 'column', grow: 1, basis: 0, minWidth: 0, minHeight: 0, overflow: 'scroll', border: 1,
    padding: NARROW() ? [10, 12, 14, 12] : [16, 22, 20, 22] }),
  look: { fill: ['#17120e', '#110d0b'], border: alpha(FRAME, 0.35) },
  text: { size: 15, line: 1.45, color: INK },
};
/** (what's in the page keeps its height and the page scrolls it, as a block's children do: in a flex column they
 *  shrank, and the styles' table, which hides what overflows it, to nothing) */
const PAGE_PARTS: Rule = { at: '.gd-page > *', box: { shrink: 0 } };

/** The guide drawn by the engine from now on, the page's out of sight. */
export function drawGuide(): void {
  drawModal('guide', [...CARDS, ...BOOK, ...ENTRIES, PAGE_BOX, PAGE_PARTS, ...PAGE, ...HERO_PAGE]);
}
