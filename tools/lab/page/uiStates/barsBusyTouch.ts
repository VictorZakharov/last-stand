// `lab ui`'s `barsBusyTouch` state (`../uiKit.ts` `Steps`): the touch HUD's bars as a fight leaves them, the Frenzy
// under them (`../uiBars.ts`).
import { barsBusyShown, barsCanary, closeBarsBusy, openBarsBusy } from '../uiBars';
import { touchMode } from '../uiTouch';
import type { Lab } from '../lab';
import type { Steps } from '../uiKit';

/** Touch mode first, then the bar as a fight leaves it. */
async function openBarsBusyTouch(lab: Lab): Promise<void> {
  await touchMode(lab);
  await openBarsBusy(lab);
}

const STATE: Steps = {
  order: 525,
  inRun: true,
  open: openBarsBusyTouch,
  close: closeBarsBusy,
  check: barsBusyShown,
  canary: barsCanary,
};
export default STATE;
