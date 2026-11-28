// `lab ui`'s `saveDelete` state (`../uiKit.ts` `Steps`): deleting a save slot (`../uiSaveDelete.ts`).
import { SAVE_DELETE_CANARY, closeSaveDelete, openSaveDelete, saveDeleteChecked } from '../uiSaveDelete';
import { caught } from '../uiKit';
import type { Steps } from '../uiKit';

const STATE: Steps = {
  order: 56,
  open: openSaveDelete,
  close: closeSaveDelete,
  check: saveDeleteChecked,
  canary: caught(SAVE_DELETE_CANARY),
};
export default STATE;
