// How to play drawn by the engine (ui/kit's sheet; #973), rule for rule from `styles/_modals.scss`: the notice board's
// tutorial and its stations, the controls (`controlsHelpSheet.ts`: the keyboard and the mouse, or on touch their
// list) beside the rules (`helpTextSheet.ts`), one column on a narrow window, and its buttons at the box's right. The
// dialog is `menus.ts`'s markup, written and bound there as before. Sizes are px of the lobby's scale.
import { CONTROLS_HELP } from './controlsHelpSheet';
import { HELP_TEXT } from './helpTextSheet';
import { mediaQuery } from './controlsSheet';
import { accent } from './diagFrame';
import type { Sheet } from './kit/sheet';

/** a window too narrow for the diagrams beside the rules (`@media (max-width: 720px)`) */
const NARROW_HELP = mediaQuery('(max-width: 720px)');
/** the diagrams' gap from the rules, and a station's tick's green */
const COLUMNS_GAP = 24;
const DONE = '#8fae7c';

export const HELP: Sheet = [
  ...CONTROLS_HELP,
  ...HELP_TEXT,
  { at: '#help .modal-box:has(.diagrams)', box: { width: 960 } },
  // the diagrams beside the rules (`grid-template-columns: auto 1fr`), one over the other when narrow; on touch, the
  // list over the rules as blocks
  { at: '.help-cols', flex: true, box: { direction: 'column' } },
  { at: '.help-cols:has(.diagrams)', box: () => (NARROW_HELP()
    ? { direction: 'column', gap: COLUMNS_GAP, alignItems: 'stretch' }
    : { direction: 'row', gap: COLUMNS_GAP, alignItems: 'center' }) },
  { at: '.help-cols:has(.diagrams) > .controls-help', box: { shrink: 0 } },
  { at: '.help-cols:has(.diagrams) > .help-text', box: { grow: 1, basis: 0, minWidth: 0 } },
  // the tutorial: its lead, then its stations in a row that wraps
  { at: '.help-tour', flex: true, box: { direction: 'column', margin: [0, 0, 14, 0], padding: [10, 14], border: 1 },
    look: { fill: 'rgba(0,0,0,.25)', border: 'rgba(232,217,180,.25)', radius: 6 }, text: { align: 'start' } },
  { at: '.ht-lead', text: { size: 15, line: 1.4 } },
  { at: '.ht-stations', flex: true, box: { direction: 'row', wrap: true, gap: [22, 4], margin: [8, 0, 0, 0],
    alignItems: 'baseline' }, text: { size: 14 } },
  { at: '.ht-station', flex: true, box: { direction: 'row', gap: 7, alignItems: 'baseline' }, text: { whole: true } },
  { at: '.ht-station b', text: () => ({ face: 'display', color: accent() }) },
  { at: '.ht-station i', text: { italic: false, color: DONE } },
  // its buttons, Got it at the right
  { at: '.help-actions', flex: true, box: { direction: 'row', justify: 'end', alignItems: 'center', gap: 12 } },
];
