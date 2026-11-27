// The dialogs drawn by the engine (ui/kit's sheet; #973): Install (opened over the pause menu, `pwa.ts`), rule for
// rule from `styles/_modals.scss`, How to play (`helpSheet.ts`), the bug report's form (`bugReportSheet.ts`) and the save slots' two (`cloudSheet.ts`). Each is a modal
// (`modalSheet.ts`): its page element out of sight, written and listened to by its module as before. Made after the
// pause menu's, so drawn over it in the modals' layer. Sizes are px of the lobby's scale.
import { drawModal } from './modalSheet';
import { HELP_TEXT, PARAGRAPH } from './helpTextSheet';
import { BUG_REPORT } from './bugReportSheet';
import { CLOUD_DIALOG, SAVE_DELETE } from './cloudSheet';
import { HELP } from './helpSheet';
import type { Sheet } from './kit/sheet';

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
  drawModal('help', HELP);
  drawModal('bug-report', BUG_REPORT);
  drawModal('save-delete', SAVE_DELETE);
  drawModal('cloud-dialog', CLOUD_DIALOG);
}

