// `lab ui`'s `saveDelete` state: the dialog that deletes a save slot (`src/ui/saves.ts` `askDelete`), drawn by the
// engine (`src/ui/cloudSheet.ts`), over the save slots with heroes in them (`uiSavesHeroes.ts`). Its field must be
// drawn inside the dialog with the focus, so the player types into it at once, and DELETE typed there must arm the
// button, which the kit draws from the page's own `disabled`. Its canary types something else.
import { boxOf, seenOf, type Lab } from './lab';
import { closeSavesHeroes, openSavesHeroes } from './uiSavesHeroes';
import type { Found } from './uiKit';

export const SAVE_DELETE_CANARY = { name: 'the button stays held off', what: 'KEEP typed in place of DELETE' };

/** the frames the UI kit is given to draw what changed */
const KIT_FRAMES = 3;

const dialog = (): HTMLElement => document.getElementById('save-delete')!;

/** The save slots with heroes, and slot 3's delete asked for by its button, as the player presses it. */
export async function openSaveDelete(lab: Lab): Promise<void> {
  openSavesHeroes();
  await lab.step(KIT_FRAMES);
  const button = document.querySelector<HTMLElement>('#saves .sv-pane:last-child .sv-del');
  if (!button) throw new Error('lab: saveDelete: slot 3 shows no Delete');
  button.click();
  await lab.step(KIT_FRAMES);
}

/** The dialog closed, and the save slots after it. */
export async function closeSaveDelete(lab: Lab): Promise<void> {
  dialog().querySelector<HTMLElement>('.sd-cancel')?.click();
  await lab.step(KIT_FRAMES);
  closeSavesHeroes();
}

/** Whether `inner` lies inside `outer` (css px, half a px of slack). */
const inside = (inner: DOMRect, outer: DOMRect): boolean =>
  inner.left >= outer.left - 0.5 && inner.right <= outer.right + 0.5
  && inner.top >= outer.top - 0.5 && inner.bottom <= outer.bottom + 0.5;

/** The field drawn in the dialog with the focus, and DELETE typed into it arming the button. */
export async function saveDeleteChecked(canary: boolean, lab: Lab): Promise<Found> {
  const problems: string[] = [];
  const box = dialog().querySelector('.modal-box')!;
  const field = dialog().querySelector<HTMLInputElement>('#sd-input')!;
  const ok = dialog().querySelector<HTMLButtonElement>('.sd-ok')!;
  const drawn = boxOf(box);
  if (!seenOf(box) || drawn.width < 1) problems.push('saveDelete: the dialog isn\'t drawn');
  if (!inside(boxOf(field), drawn)) problems.push('saveDelete: the field lies outside the dialog');
  if (document.activeElement !== field) problems.push('saveDelete: the field hasn\'t the focus');
  if (!ok.disabled) problems.push('saveDelete: the button is armed before anything is typed');
  field.value = canary ? 'KEEP' : 'DELETE';
  field.dispatchEvent(new Event('input', { bubbles: true }));
  await lab.step(KIT_FRAMES);
  if (ok.disabled) problems.push(`saveDelete: ${SAVE_DELETE_CANARY.name} with ${field.value} typed`);
  const lines = [`  dialog ${Math.round(drawn.width)} × ${Math.round(drawn.height)} px, "${ok.textContent}" `
    + `${ok.disabled ? 'held off' : 'armed'} once typed`];
  return { lines, problems };
}
