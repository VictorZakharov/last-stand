// The shared controls' rules as the kit's sheet takes them (#973: `styles/_controls.scss`, rule for rule): buttons
// (`.btn` and its kinds), links, panels and their titles, segmented buttons, and the page's `.hidden`. A screen moved
// onto the kit lists these first and its own after them (`kit/sheet.ts`: a later rule wins).
import { accent } from './diagFrame';
import { FRAME, FRAME_DARK, INK, INK_DIM, PANEL, WELL, alpha } from './kit/theme';
import type { Rule, Sheet } from './kit/sheet';

/** CSS's `(max-height: 520px), (orientation: portrait) and (max-width: 1000px)`: a phone held sideways, an upright
 *  tablet (`_responsive.scss`'s first query) */
export const SHORT_OR_UPRIGHT = (): boolean =>
  matchMedia('(max-height: 520px), (orientation: portrait) and (max-width: 1000px)').matches;
/** CSS's `(max-height: 520px)`: a phone held sideways */
export const SHORT = (): boolean => matchMedia('(max-height: 520px)').matches;
/** the page in touch mode (`body.touch`) */
export const TOUCH = (): boolean => document.body.classList.contains('touch');

/** a hover's `filter: brightness(1.35)` */
const LIT = 1.35;

/** The framed box's look (`@mixin frame`: 2 px of the frame's dark, its line inside, a shadow under it). */
export function framed(fill: string | [string, string]): Pick<Rule, 'look' | 'ring' | 'box'> {
  return {
    box: { border: 2 },
    look: { fill, border: FRAME_DARK, shadow: { blur: 40, y: 10, color: 'rgba(0,0,0,.8)' } },
    ring: FRAME,
  };
}

export const CONTROLS: Sheet = [
  { at: '.hidden', box: { display: 'none' } },
  // buttons and their kinds
  {
    at: '.btn',
    box: { padding: [10, 18], border: 1 },
    look: { fill: ['#2a2420', '#141110'], border: '#000', radius: 3,
      shadow: { blur: 6, y: 2, color: 'rgba(0,0,0,.6)' } },
    text: { face: 'display', weight: 700, size: 15, spacing: 1, color: INK, whole: true },
    ring: FRAME,
    hover: { lit: LIT },
  },
  {
    at: '.btn.primary',
    look: { fill: ['#6a4a1c', '#2e1e0a'], shadow: { blur: 14, color: 'rgba(240,190,90,.25)' } },
    text: { color: '#ffe7b0' },
    ring: accent,
  },
  { at: '.btn.danger', look: { fill: ['#5a1a14', '#260a08'] } },
  { at: '.btn.big', box: { padding: [18, 24], alignSelf: 'stretch' }, text: { size: 24 } },
  { at: '.btn .k', box: { minWidth: 20, padding: [0, 4], margin: [0, 6, 0, 0], border: 1 },
    look: { border: FRAME, radius: 2 }, text: () => ({ size: 12, color: accent() }) },
  { at: '.link', box: { padding: 4 }, text: { color: INK_DIM, size: 16, underline: true }, hover: { text: { color: INK } } },
  // panels
  {
    at: '.panel',
    box: { border: 2 },
    look: { fill: PANEL, border: FRAME_DARK, shadow: { blur: 40, y: 10, color: 'rgba(0,0,0,.8)' } },
    ring: alpha(FRAME, 0.6),
  },
  { at: '.panel-title', box: { padding: [0, 0, 4, 0], margin: [10, 0, 8, 0], border: [0, 0, 1, 0] },
    look: { border: alpha(FRAME, 0.35) }, text: () => ({ face: 'display', size: 18, color: accent() }) },
  { at: '.panel-title.small', box: { margin: [4, 0, 8, 0] }, text: { size: 14 } },
  // segmented buttons
  { at: '.seg', flex: true, box: { direction: 'row', border: 1, overflow: 'hidden', alignSelf: 'center' },
    look: { border: alpha(FRAME, 0.55), radius: 3 } },
  {
    at: '.seg button',
    box: { padding: [5, 10], border: [0, 0, 0, 1] },
    look: { fill: WELL, border: alpha(FRAME, 0.35) },
    text: { size: 13, color: INK_DIM, whole: true },
    hover: { text: { color: INK } },
  },
  { at: '.seg button:first-child', box: { border: 0 } },
  {
    at: '.seg button.active',
    look: { fill: ['#5a3e18', '#2a1c0a'] },
    text: { color: '#ffe7b0' },
    ring: accent,
    hover: { text: { color: '#ffe7b0' } },
  },
  { at: '.seg small', text: { size: 11 } },
];
