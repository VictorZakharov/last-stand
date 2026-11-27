// `lab ui`'s `skillTips` state (`../uiKit.ts` `Steps`): each skill's tooltip on the hotbar opened by the mouse
// (`../uiSkillTips.ts`).
import { hideTooltip } from '../../../../src/ui/tooltip';
import { middleOf } from '../lab';
import type { Lab } from '../lab';
import { openEach, skillTipsShown, tallTipsCaught } from '../uiSkillTips';
import type { Steps } from '../uiKit';

/** Each skill's tooltip on the hotbar opened by the mouse moved over its slot. */
async function openSkillTips(lab: Lab): Promise<void> {
  // (the mouse moved first: a state on touch before this one leaves the game in touch mode, where the hotbar
  // isn't shown, and measured on main so it found no skills; a mouse's move ends it, a move that moves: it was left
  // in the middle)
  await lab.mouseTo({ x: innerWidth / 2 - 8, y: innerHeight / 2 - 8 });
  await lab.mouseTo({ x: innerWidth / 2, y: innerHeight / 2 });
  await lab.step(2);
  const slots = [...document.querySelectorAll<HTMLElement>('#hotbar .slot:not(.empty)')];
  await openEach(slots, 'the mouse', (slot) => lab.mouseTo(middleOf(slot)), () => undefined);
}

/** The mouse moved off the hotbar to the middle of the window, which closes the tooltip. */
async function closeSkillTips(lab: Lab): Promise<void> {
  await lab.mouseTo({ x: innerWidth / 2, y: innerHeight / 2 });
  hideTooltip();
}

const STATE: Steps = {
  order: 490,
  inRun: true,
  open: openSkillTips,
  close: closeSkillTips,
  check: skillTipsShown,
  canary: tallTipsCaught,
};
export default STATE;
