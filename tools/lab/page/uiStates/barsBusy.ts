// `lab ui`'s `barsBusy` state (`../uiKit.ts` `Steps`): the run's bottom bar as a fight leaves it, low health
// pulsing, short energy, a skill cooling down, the warrior's Frenzy part lit, a ward and the tavern's ale in the
// buffs over its left end (`../uiBars.ts`).
import { barsBusyShown, barsCanary, closeBarsBusy, openBarsBusy } from '../uiBars';
import type { Steps } from '../uiKit';

const STATE: Steps = {
  order: 326,
  inRun: true,
  open: openBarsBusy,
  close: closeBarsBusy,
  check: barsBusyShown,
  canary: barsCanary,
};
export default STATE;
