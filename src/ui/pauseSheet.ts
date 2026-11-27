// The pause menu drawn by the engine (ui/kit's sheet; #973): its forged title between Abandon run and Resume, the
// diamond rule, its tabs and their pages in one cell (Controls, Settings, Performance, Guide), the Install link and
// the build's lines at its foot, rule for rule from `styles/_modals.scss` (and the rows' `_controls.scss`, the guide's
// doors' `_guide.scss`, the build's line `_bugReport.scss`). The page's `#pause` stays, out of sight, written and
// listened to by `menus.ts` and the tabs' modules as before; How to play (`#help`) shares the controls' help, and the
// install dialog opens over it. Sizes are px of the lobby's scale. Not drawn: the box's red glow is a single fill
// round its top's middle (CSS's ellipse over its gradient), a lit tab's line along its top.
import { drawModal, windowShare } from './modalSheet';
import { mediaQuery, SHORT, TOUCH } from './controlsSheet';
import { CONTROLS_HELP } from './controlsHelpSheet';
import { COLOUR_PICKER } from './colourPickerSheet';
import { TABS } from './lobbySheet';
import { accent } from './diagFrame';
import { FRAME, HIGHLIGHT, INK, INK_DIM, WELL, WELL_LIT, alpha } from './kit/theme';
import { now } from './kit/motion';
import { drawnAt } from './kit/press';
import { uiScales } from './scale';
import type { Painted, Sheet } from './kit/sheet';

/** CSS's `(max-width: 720px)`: the settings in one column, the title over the two buttons */
export const NARROW = mediaQuery('(max-width: 720px)');
/** a co-op partner's text (`$ally-text`) */
const ALLY_TEXT = '#9ccfff';
/** the build's quiet lines */
const BUILD = '#7d7466';

/** The title's width (`min(300px, 34vw / var(--ui))`, 210 on a short screen) and its height (600 by 120). */
function titleWidth(): number {
  return SHORT() ? 210 : Math.min(300, (innerWidth * 0.34) / uiScales.ui);
}

/** The diamond rule (`@mixin diamond-rule`): a line fading in from the left to a small gem, and out to the right. */
export function diamondRule(_element: Element, w: number, h: number): Painted {
  const colour = accent();
  return {
    key: `${w}x${h} ${colour}`,
    paint: (c) => {
      const middle = { x: w / 2, y: h / 2 };
      const half = 3.5;
      const gap = 10;
      const line = (from: number, to: number, fadeFromLeft: boolean): void => {
        const fade = c.createLinearGradient(from, 0, to, 0);
        fade.addColorStop(fadeFromLeft ? 0 : 1, alpha(FRAME, 0));
        fade.addColorStop(fadeFromLeft ? 1 : 0, FRAME);
        c.fillStyle = fade;
        c.fillRect(from, middle.y - 0.5, to - from, 1);
      };
      line(0, middle.x - half - gap, true);
      line(middle.x + half + gap, w, false);
      c.save();
      c.translate(middle.x, middle.y);
      c.rotate(Math.PI / 4);
      c.shadowBlur = 8;
      c.shadowColor = 'rgba(230,70,40,.7)';
      c.fillStyle = '#3a0c08';
      c.fillRect(-half, -half, half * 2, half * 2);
      c.shadowBlur = 0;
      c.strokeStyle = colour;
      c.lineWidth = 1;
      c.strokeRect(-half + 0.5, -half + 0.5, half * 2 - 1, half * 2 - 1);
      c.restore();
    },
  };
}

/** when each held button's hold began (s, the kit's clock) */
const heldSince = new WeakMap<Element, number>();
/** a hold's fill is painted again at this many steps across */
const HOLD_STEPS = 60;

/** A held button's fill running across it as it's held (`.hold-btn.holding::before`, scaled across in `--hold-ms`). */
function holdFill(element: Element, w: number, h: number): Painted | null {
  if (!element.classList.contains('holding')) {
    heldSince.delete(element);
    return null;
  }
  if (!heldSince.has(element)) heldSince.set(element, now());
  const holdMs = parseFloat((element as HTMLElement).style.getPropertyValue('--hold-ms')) || 2000;
  const share = Math.min(1, ((now() - heldSince.get(element)!) * 1000) / holdMs);
  const step = Math.round(share * HOLD_STEPS);
  return {
    key: `hold ${step} ${w}x${h}`,
    paint: (c) => {
      const across = (w * step) / HOLD_STEPS;
      const fill = c.createLinearGradient(0, 0, across || 1, 0);
      fill.addColorStop(0, 'rgba(255,140,90,.25)');
      fill.addColorStop(1, 'rgba(255,170,110,.55)');
      c.fillStyle = fill;
      c.fillRect(0, 0, across, h);
    },
  };
}

/** The numbers of the profiler's list's items (an `ol`'s `1.`, `2.`...). */
const NUMBERED: Sheet = Array.from({ length: 12 }, (_, at) => ({
  at: `.profile-parts li:nth-child(${at + 1})`,
  before: { says: `${at + 1}. ` },
}));

/** Send the report beside Profile this spot, as the grid stands them (`.profile-row`'s second row): placed after
 *  Profile this spot's drawn box. */
function besideProfile(element: Element): { inset: [number, 'auto', 'auto', number] } {
  const row = element.parentElement;
  const profile = row?.querySelector('#btn-profile');
  const rowBox = row ? drawnAt(row) : null;
  const at = profile ? drawnAt(profile) : null;
  if (!rowBox || !at) return { inset: [0, 'auto', 'auto', 0] };
  return { inset: [(at.y - rowBox.y) / uiScales.ui, 'auto', 'auto', (at.x - rowBox.x + at.w) / uiScales.ui + 6] };
}

/** Developer mode's parts of the menu (`src/dev/dev.scss`: its label, its help on the Controls page, the pages
 *  scrolling): rules alone, matching nothing where developer mode isn't (production's bundle has none of its code). */
const DEVELOPER: Sheet = [
  { at: '.dv-mode-label', box: { alignSelf: 'center', padding: [3, 16], border: 1 },
    look: () => ({ fill: alpha(hexAccent(), 0.12), border: accent() }),
    text: { face: 'display', weight: 700, size: 14, spacing: 2, upper: true, color: HIGHLIGHT, whole: true } },
  { at: 'body:has(.dv-help) #pause .build-info', before: { says: 'DEV MODE · ', text: { color: HIGHLIGHT, weight: 700 } } },
  // the pages' cell scrolling (`#pause .pb-pages { overflow-y: auto }`), the box round it held: a cell that scrolls
  // is sized by taffy below its content, so what's in a page has sizes of its own (the keyboard, the mouse)
  { at: 'body:has(.dv-help) #pause .pb-pages', scrolls: true, box: { shrink: 1, minHeight: 0 } },
  { at: '.dv-help', flex: true, box: { direction: 'column', padding: [10, 12], margin: [0, 0, 14, 0], border: 1 },
    look: { fill: 'rgba(12,11,14,.8)', border: alpha(FRAME, 0.6) }, text: { size: 13 } },
  { at: '.dv-help h3', box: { margin: [0, 0, 5, 0] }, text: () => ({ face: 'display', weight: 700, size: 14,
    color: accent() }) },
  { at: '.dv-help dl + h3', box: { margin: [12, 0, 5, 0] } },
  { at: '.dv-help p', box: { margin: [4, 0, 8, 0] }, text: { color: INK_DIM } },
  { at: '.dv-help dl', flex: true, box: { direction: 'row', wrap: true, gap: [16, 5] } },
  { at: '.dv-help dl > div', flex: true, box: () => ({ direction: 'row', gap: 6, alignItems: 'start',
    basis: NARROW() ? '100%' : '45%', grow: 1, minWidth: 0 }) },
  { at: '.dv-help dt', box: { width: 100, shrink: 0 }, text: { color: HIGHLIGHT } },
  { at: '.dv-help dd', box: { grow: 1, basis: 0, minWidth: 0 } },
];

/** the accent as `#rrggbb` for a share of it */
const hexAccent = (): string => (/^#[0-9a-f]{6}$/i.test(accent()) ? accent() : '#e2c07e');

const SHEET: Sheet = [
  // (out of sight under the bug report opened over it, kept as it is to come back to: two boxes one over another
  // read as a muddle)
  { at: '#pause', when: () => !!document.querySelector('#bug-report:not(.hidden)'), box: { display: 'none' } },
  ...TABS,
  ...CONTROLS_HELP,
  ...COLOUR_PICKER,
  { at: '.pause-note', text: { size: 14, color: ALLY_TEXT } },
  // the box: its frame's line inside it and its corner brackets, its glow round the title
  {
    at: '.pause-box',
    box: () => ({ position: 'relative', width: 860, padding: SHORT() ? [10, 22, 10, 22] : [18, 34, 16, 34],
      gap: SHORT() ? 6 : 10, maxWidth: windowShare(0.94).w, maxHeight: windowShare(0.94).h }),
    look: { fill: ['rgba(64,26,18,.98)', 'rgba(12,10,10,.98)'], radial: { y: 0, stop: 0.45 } },
    brackets: true,
  },
  // the title between the buttons, the title over them where it's narrow
  { at: '.pb-top', flex: true, box: () => {
    const title = titleWidth() / 5;
    return NARROW()
      ? { position: 'relative', direction: 'row', gap: [12, 8], padding: [title + 8, 0, 0, 0], alignItems: 'center' }
      : { position: 'relative', direction: 'row', justify: 'between', alignItems: 'center', minHeight: title };
  } },
  { at: '.pb-top .btn', box: () => ({ maxWidth: '100%', padding: SHORT() ? [7, 18] : [10, 18] }) },
  { at: '.pb-top .btn', when: NARROW, box: { grow: 1, basis: 0 } },
  { at: '.pb-title', flex: true, box: () => {
    const w = titleWidth();
    return NARROW()
      ? { position: 'absolute', width: w, height: w / 5, inset: [0, 'auto', 'auto', '50%'], margin: [0, 0, 0, -w / 2] }
      : { position: 'absolute', width: w, height: w / 5, inset: ['50%', 'auto', 'auto', '50%'],
        margin: [-w / 10, 0, 0, -w / 2] };
  } },
  { at: '.pb-title svg', box: { position: 'absolute', inset: 0 }, picture: () => [titleWidth(), titleWidth() / 5] },
  { at: '.pb-title .logo-glow', look: { opacity: 0.75 } },
  { at: '.hold-btn.holding', paint: holdFill },
  { at: '.hold-btn.hinting', says: (element) => (element as HTMLElement).dataset.hint ?? '',
    text: { size: 15 * 0.85 } },
  { at: '.pb-rule', box: { width: 420, maxWidth: '80%', height: 7, alignSelf: 'center', margin: [-4, 0, 2, 0] },
    paint: diamondRule },
  { at: '.pb-rule i', box: { display: 'none' } },
  { at: '.pb-tabs', box: { width: 520, maxWidth: '100%', alignSelf: 'center', margin: [0, 0, 4, 0] } },
  // the pages in one cell: side by side, each after the first drawn back over it, the cell the tallest's height
  { at: '.pb-pages', flex: true, box: { direction: 'row', alignItems: 'start', minHeight: 0, shrink: 0 },
    text: { align: 'start' } },
  { at: '.pb-page', flex: true, box: { direction: 'column', width: '100%', shrink: 0, minWidth: 0, padding: [2, 12] } },
  { at: '.pb-page + .pb-page', box: { margin: [0, 0, 0, '-100%'] } },
  { at: '.pb-page.off', hits: false, look: { opacity: 0 } },
  // the settings in two columns (one where it's narrow), the colours across both
  { at: '.pb-opts', box: () => ({ direction: NARROW() ? 'column' : 'row', wrap: true, gap: [32, 0],
    alignItems: 'start' }) },
  { at: '.pb-opts #hero-colour-settings', box: { basis: '100%', margin: [0, 0, 8, 0] } },
  { at: '.pb-opts #hero-colour-settings', when: () => SHORT() && TOUCH(), box: { margin: 0 } },
  { at: '#hero-colour-settings .coop-colour', when: () => SHORT() && TOUCH(), box: { gap: [6, 3] } },
  { at: '.pb-opt-col', flex: true, box: () => ({ direction: 'column', minWidth: 0, grow: 1, basis: 0,
    alignSelf: NARROW() ? 'stretch' : 'start' }) },
  // a row of settings: its name over its choice
  { at: '.opt-row', flex: true, hits: true, box: { direction: 'row', alignItems: 'center', justify: 'center', gap: 8,
    margin: [14, 0, 4, 0] }, text: { size: 14, color: INK } },
  { at: '.opt-row input', box: { width: 16, height: 16, margin: [3, 3, 3, 4], shrink: 0 } },
  { at: '.pb-opts .opt-row', box: () => ({ justify: 'start', margin: SHORT() ? [1, 0, 5, 0] : [4, 0, 14, 0],
    gap: SHORT() ? 4 : 8 }) },
  { at: '.pb-opts .quality-row', box: { direction: 'column', alignItems: 'start', gap: 6 } },
  { at: '.pb-opts .quality-row > span', text: { size: 13, color: INK_DIM } },
  // (a choice at its row's start, as CSS's `inline-flex` stands it: the shared controls centre it, as the card's)
  { at: '.pb-opts .quality-row > .seg', box: { alignSelf: 'start' } },
  { at: '.pb-opts .opt-advanced', flex: true, box: { direction: 'column', margin: [4, 0, 14, 0] } },
  { at: '.pb-opts .opt-advanced summary', hits: true, box: { margin: [0, 0, 8, 0] }, text: { size: 14, color: INK },
    before: { says: '▶  ', text: { size: 9 } } },
  { at: '.pb-opts .opt-advanced[open] summary', before: { says: '▼  ', text: { size: 9 } } },
  { at: '.opt-advanced:not([open]) > :not(summary)', box: { display: 'none' } },
  { at: '.pb-opts .opt-advanced .quality-row', box: { direction: 'row', alignItems: 'center', justify: 'between',
    margin: [0, 0, 6, 0] } },
  { at: '.pb-opts .opt-advanced .quality-row > .seg', box: { alignSelf: 'center' } },
  { at: '.pb-opts .opt-pair', flex: true, box: { direction: 'row', wrap: true, alignItems: 'center', gap: [14, 6] } },
  { at: '.pb-opts .opt-inline', flex: true, hits: true, box: { direction: 'row', alignItems: 'center', gap: 8 },
    text: { size: 13, color: INK } },
  { at: '.pb-opts .seg-row', box: { direction: 'row', alignItems: 'center', gap: 10 } },
  { at: '.pb-opts .seg-row .seg button', box: { padding: [3, 10] } },
  // the levels: a slider each, its name before it and its value after
  { at: '.opt-levels', flex: true, box: { direction: 'column', gap: 4, width: '100%' } },
  { at: '.opt-level', flex: true, hits: true, box: { direction: 'row', alignItems: 'center', gap: 8 },
    text: { size: 13, color: INK_DIM } },
  { at: '.opt-level > span', box: { width: 76, shrink: 0 } },
  { at: '.opt-row .opt-level input', box: { grow: 1, width: 'auto', minWidth: 0, height: 16, margin: 2 } },
  { at: '.opt-level output', box: { width: 40, shrink: 0 }, text: { color: INK, align: 'end' } },
  { at: '.hour-row .opt-level', box: { width: '100%' } },
  { at: '.hour-row .opt-level output', box: { width: 72 } },
  // the profiler and the recording
  { at: ':is(.profile-note, .recording-note, .renderer-note)', text: { size: 12, color: INK_DIM } },
  { at: '.recording-controls', flex: true, box: { direction: 'row', wrap: true, gap: 6 } },
  { at: ':is(.recording-controls, .profile-row) .btn', box: { padding: [6, 10] }, text: { size: 14 } },
  { at: '.recording-controls .btn', when: TOUCH, box: () => ({ minHeight: 36 / uiScales.ui }) },
  { at: '.pb-opts .profile-row', box: { position: 'relative' } },
  { at: '.profile-row > #btn-profile-send', box: (element) => ({ position: 'absolute', ...besideProfile(element) }) },
  { at: '.profile-parts', flex: true, box: { direction: 'column', margin: 0, padding: [0, 0, 0, 18] },
    text: { size: 12 } },
  { at: '.profile-parts li', box: { margin: [1, 0] } },
  ...NUMBERED,
  // the guide's doors (`_guide.scss`)
  { at: '.pbg-intro', text: { color: INK, align: 'center' } },
  { at: '.pbg-key', text: { color: INK_DIM } },
  { at: '.pbg-key', when: TOUCH, box: { display: 'none' } },
  { at: '.pbg-key kbd', box: { padding: [0, 5], border: 1 }, look: { border: alpha(FRAME, 0.55) },
    text: () => ({ face: 'display', weight: 700, size: 12, color: accent() }) },
  { at: '.pbg-doors', flex: true, box: { direction: 'row', wrap: true, gap: 8 } },
  { at: '.pbg-door', flex: true, box: () => ({ direction: 'column', alignItems: 'start', gap: 2,
    padding: SHORT() ? [6, 10] : [10, 14], border: 1, basis: 0, grow: 1, minWidth: '40%' }),
  look: { fill: WELL, border: alpha(FRAME, 0.45) }, text: { size: 14, color: INK, align: 'start' },
  hover: { look: { fill: WELL_LIT, border: FRAME } } },
  { at: '.pbg-door b', text: () => ({ face: 'display', weight: 700, size: SHORT() ? 15 : 17, color: accent() }) },
  { at: '.pbg-door span', text: { color: INK_DIM } },
  // its foot: Install, the build and its status, and the way to report a bug
  { at: '.pb-links', flex: true, box: { direction: 'row', justify: 'center', gap: 6, margin: [4, 0, 2, 0] } },
  { at: '.pb-links .link', box: { padding: [0, 4] }, text: { line: 1.1 } },
  { at: '.pb-links .link', when: () => TOUCH() && !SHORT(), box: () => ({ minHeight: 28 / uiScales.ui }) },
  { at: '.pb-links .link', when: SHORT, box: { padding: [4, 4] }, text: { line: undefined } },
  { at: '.pb-build', flex: true, box: () => (SHORT()
    ? { direction: 'row', wrap: true, justify: 'center', alignItems: 'center', gap: [12, 0] }
    : { direction: 'column', alignItems: 'center', gap: 10 }) },
  { at: '#pause :is(.build-info, .build-status)', text: { size: 12, color: BUILD, align: 'center' } },
  { at: '#pause .build-status[data-status="latest"]', text: { color: '#8fae7c' } },
  { at: '#pause .build-status[data-status="newer"]', text: { color: HIGHLIGHT } },
  { at: '.pb-build-line', flex: true, box: { direction: 'row', alignItems: 'baseline', justify: 'center', wrap: true,
    gap: [14, 0] } },
  { at: '.pb-build-line .link', box: { padding: [0, 4] }, text: { size: 13 } },
  { at: '.pb-build-line .link', when: TOUCH, box: () => ({ padding: [8 / uiScales.ui, 10 / uiScales.ui] }) },
  ...DEVELOPER,
  // (a row made taller by its inline style: the lab's canary, a page too tall for the window)
  { at: '#pause [style*="min-height"]', box: (element) =>
    ({ minHeight: parseFloat((element as HTMLElement).style.minHeight) || 0, shrink: 0 }) },
];

/** The pause menu drawn by the engine from now on. */
export function drawPause(): void {
  drawModal('pause', SHEET);
}
