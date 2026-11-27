// The help text's paragraphs drawn by the engine (ui/kit's sheet; #973), rule for rule from `styles/_modals.scss`:
// its gold and red words and the dialogs' titles, which Install, the bug report and How to play share. Sizes are px
// of the lobby's scale.
import { DANGER, HIGHLIGHT, INK_DIM } from './kit/theme';
import { accent } from './diagFrame';
import type { Sheet } from './kit/sheet';

/** a paragraph's margin (the browser's `1em` of the help text's 15 px), held between paragraphs as CSS collapses it */
export const PARAGRAPH = 15;

/** The help text and its paragraphs (`.help-text`, the browser's `p`), its gold and red words. */
export const HELP_TEXT: Sheet = [
  { at: '.help-text', flex: true, box: { direction: 'column' }, text: { size: 15, line: 1.45, align: 'start' } },
  { at: '.help-text p', box: { margin: [0, 0, PARAGRAPH, 0] } },
  { at: '.help-text p:first-child', box: { margin: [PARAGRAPH, 0, PARAGRAPH, 0] } },
  // (`b` is bold as the browser's own style has it: the kit's runs take only what a rule gives)
  { at: '.help-text b, .ht-lead b', text: { weight: 700 } },
  { at: '.gold', text: { color: HIGHLIGHT } },
  { at: '.red', text: { color: DANGER } },
  { at: '.sm-title', text: () => ({ face: 'display', size: 32, weight: 900, color: accent() }) },
  { at: '.sm-title.dead', text: { color: '#ff5040', shadows: [{ x: 0, y: 0, blur: 20, color: 'rgba(255,40,20,.4)' }] } },
  { at: '.sm-sub', text: { color: INK_DIM } },
];
