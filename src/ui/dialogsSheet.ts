// The small dialogs drawn by the engine (ui/kit's sheet; #973): Install (opened over the pause menu, `pwa.ts`), rule
// for rule from `styles/_modals.scss`, and the help text's paragraphs they and How to play share. Each is a modal
// (`modalSheet.ts`): its page element out of sight, written and listened to by its module as before. Made after the
// pause menu's, so drawn over it in the modals' layer. Sizes are px of the lobby's scale.
import { drawModal } from './modalSheet';
import { DANGER, HIGHLIGHT, INK_DIM } from './kit/theme';
import { accent } from './diagFrame';
import type { Sheet } from './kit/sheet';

/** a paragraph's margin (the browser's `1em` of the help text's 15 px), held between paragraphs as CSS collapses it */
const PARAGRAPH = 15;

/** The help text and its paragraphs (`.help-text`, the browser's `p`), its gold and red words. */
export const HELP_TEXT: Sheet = [
  { at: '.help-text', flex: true, box: { direction: 'column' }, text: { size: 15, line: 1.45, align: 'start' } },
  { at: '.help-text p', box: { margin: [0, 0, PARAGRAPH, 0] } },
  { at: '.help-text p:first-child', box: { margin: [PARAGRAPH, 0, PARAGRAPH, 0] } },
  { at: '.gold', text: { color: HIGHLIGHT } },
  { at: '.red', text: { color: DANGER } },
  { at: '.sm-title', text: () => ({ face: 'display', size: 32, weight: 900, color: accent() }) },
  { at: '.sm-title.dead', text: { color: '#ff5040', shadows: [{ x: 0, y: 0, blur: 20, color: 'rgba(255,40,20,.4)' }] } },
  { at: '.sm-sub', text: { color: INK_DIM } },
];

/** Install: the steps to add the game to the home screen, and Got it. */
const INSTALL: Sheet = [
  ...HELP_TEXT,
  { at: '.install-steps', flex: true, box: { direction: 'column' } },
  // (the steps' paragraphs and the last one's, one help text's paragraphs, collapsed as one)
  { at: '#install .help-text > p', box: { margin: [0, 0, PARAGRAPH, 0] } },
  { at: '#install .install-steps p:first-child', box: { margin: [PARAGRAPH, 0, PARAGRAPH, 0] } },
  { at: '#install .install-steps:empty + p', box: { margin: [PARAGRAPH, 0, PARAGRAPH, 0] } },
];

/** The dialogs drawn by the engine from now on (after the pause menu: drawn over it). */
export function drawDialogs(): void {
  drawModal('install', INSTALL);
}

